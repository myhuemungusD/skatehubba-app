import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { firestore as Firestore } from 'firebase-admin';
import { initializeApp as initClient, deleteApp } from 'firebase/app';
import {
  getAuth,
  connectAuthEmulator,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
} from 'firebase/auth';
import {
  connectFirestoreEmulator,
  doc,
  updateDoc,
  getFirestore,
} from 'firebase/firestore';

const PROJECT_ID = 'demo-skatehubba';

let handlers: typeof import('../src/index').handlers;
let adminModule: typeof import('../src/firebase');
let adminFirestore: Firestore.Firestore;

function makeContext(uid: string, ip = '127.0.0.1') {
  return {
    auth: { uid, token: {} },
    ip,
    now: adminModule.admin.firestore.Timestamp.now(),
  } as Parameters<typeof handlers.createGameImpl>[1];
}

async function setupClientUser(identifier: string) {
  const app = initClient(
    {
      projectId: PROJECT_ID,
      apiKey: 'fake-api-key',
    },
    `client-${identifier}-${Date.now()}`,
  );
  const auth = getAuth(app);
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  let credential;
  const email = `${identifier}@example.com`;
  try {
    credential = await createUserWithEmailAndPassword(auth, email, 'secret-pass');
  } catch (error: any) {
    if (error?.code === 'auth/email-already-in-use') {
      credential = await signInWithEmailAndPassword(auth, email, 'secret-pass');
    } else {
      throw error;
    }
  }
  const firestore = getFirestore(app);
  connectFirestoreEmulator(firestore, '127.0.0.1', 8080);
  return { app, uid: credential.user.uid, firestore };
}

beforeAll(async () => {
  process.env.GCLOUD_PROJECT = PROJECT_ID;
  process.env.FIREBASE_CONFIG = JSON.stringify({ projectId: PROJECT_ID });
  process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080';
  process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099';

  adminModule = await import('../src/firebase');
  adminFirestore = adminModule.db;
  const module = await import('../src/index');
  handlers = module.handlers;
});

beforeEach(async () => {
  await adminFirestore.recursiveDelete(adminFirestore.collection('games'));
  await adminFirestore.recursiveDelete(adminFirestore.collection('rateLimits'));
});

describe('game lifecycle', () => {
  it('creates and joins a game', async () => {
    const { gameId, code } = await handlers.createGameImpl({ name: 'Alice' }, makeContext('uid_alice'));
    expect(gameId).toBeTruthy();
    expect(code).toHaveLength(6);

    const snap = await adminFirestore.collection('games').doc(gameId).get();
    expect(snap.exists).toBe(true);
    const data = snap.data();
    expect(data?.players?.A?.uid).toBe('uid_alice');
    expect(data?.players?.B).toBeNull();

    await handlers.joinGameImpl({ code, name: 'Bob' }, makeContext('uid_bob'));
    const updated = await adminFirestore.collection('games').doc(gameId).get();
    expect(updated.data()?.players?.B?.uid).toBe('uid_bob');
  });

  it('supports set, judgement, response, and scoring flow', async () => {
    const { gameId, code } = await handlers.createGameImpl({ name: 'Alice' }, makeContext('uid_alice'));
    await handlers.joinGameImpl({ code, name: 'Bob' }, makeContext('uid_bob'));

    await handlers.submitSetClipImpl(
      { gameId, storagePath: `games/${gameId}/set/alice.mp4` },
      makeContext('uid_alice'),
    );

    await expect(
      handlers.submitSetClipImpl(
        { gameId, storagePath: `games/${gameId}/set/duplicate.mp4` },
        makeContext('uid_bob'),
      ),
    ).rejects.toThrowError();

    await handlers.judgeSetImpl({ gameId, approve: true }, makeContext('uid_bob'));

    await handlers.submitRespClipImpl(
      { gameId, storagePath: `games/${gameId}/response/bob.webm` },
      makeContext('uid_bob'),
    );

    await handlers.judgeRespImpl({ gameId, approve: false }, makeContext('uid_alice'));

    const snap = await adminFirestore.collection('games').doc(gameId).get();
    const data = snap.data();
    expect(data?.players?.B?.letters).toBe('S');
    expect(data?.turn).toBe('B');
    expect(data?.phase).toBe('SET_RECORD');
    expect(data?.history?.length).toBe(2);
    expect(data?.history?.[data.history.length - 1]?.result).toBe('failed');
  });

  it('marks winner after final letter', async () => {
    const { gameId, code } = await handlers.createGameImpl({ name: 'Alice' }, makeContext('uid_alice'));
    await handlers.joinGameImpl({ code, name: 'Bob' }, makeContext('uid_bob'));

    const ref = adminFirestore.collection('games').doc(gameId);
    await ref.update({ 'players.B.letters': 'SK' });

    await handlers.submitSetClipImpl(
      { gameId, storagePath: `games/${gameId}/set/alice2.mp4` },
      makeContext('uid_alice'),
    );
    await handlers.judgeSetImpl({ gameId, approve: true }, makeContext('uid_bob'));
    await handlers.submitRespClipImpl(
      { gameId, storagePath: `games/${gameId}/response/bob2.mp4` },
      makeContext('uid_bob'),
    );
    await handlers.judgeRespImpl({ gameId, approve: false }, makeContext('uid_alice'));

    const snap = await ref.get();
    const data = snap.data();
    expect(data?.players?.B?.letters).toBe('SK8');
    expect(data?.winner).toBe('A');
  });

  it('allows self fail logic', async () => {
    const { gameId, code } = await handlers.createGameImpl({ name: 'Alice' }, makeContext('uid_alice'));
    await handlers.joinGameImpl({ code, name: 'Bob' }, makeContext('uid_bob'));

    await handlers.selfFailSetImpl({ gameId }, makeContext('uid_alice'));
    let snap = await adminFirestore.collection('games').doc(gameId).get();
    let data = snap.data();
    expect(data?.turn).toBe('B');
    expect(data?.history?.length).toBe(1);

    await handlers.submitSetClipImpl(
      { gameId, storagePath: `games/${gameId}/set/bob.mp4` },
      makeContext('uid_bob'),
    );
    await handlers.judgeSetImpl({ gameId, approve: true }, makeContext('uid_alice'));
    await handlers.selfFailRespImpl({ gameId }, makeContext('uid_bob'));

    snap = await adminFirestore.collection('games').doc(gameId).get();
    data = snap.data();
    expect(data?.players?.B?.letters).toBe('S');
    expect(data?.turn).toBe('B');
  });
});

describe('security rules', () => {
  it('prevents direct client writes to games', async () => {
    const aliceClient = await setupClientUser('alice-client');
    const bobClient = await setupClientUser('bob-client');

    const gameRef = adminFirestore.collection('games').doc('secure-game');
    const now = adminModule.admin.firestore.Timestamp.now();
    await gameRef.set({
      code: 'SECURE',
      turn: 'A',
      phase: 'SET_RECORD',
      winner: null,
      players: {
        A: { uid: aliceClient.uid, name: 'Alice', letters: '' },
        B: { uid: bobClient.uid, name: 'Bob', letters: '' },
      },
      current: { by: 'A', setVideoPath: null, responseVideoPath: null },
      history: [],
      createdAt: now,
      updatedAt: now,
    });

    await expect(
      updateDoc(doc(aliceClient.firestore, 'games/secure-game'), {
        'players.A.letters': 'SK8',
      }),
    ).rejects.toThrowError();

    await deleteApp(aliceClient.app);
    await deleteApp(bobClient.app);
  });
});
