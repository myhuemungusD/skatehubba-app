import { readFileSync } from 'fs';
import path from 'path';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  RulesTestContext,
  RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  getStorage,
  ref,
  uploadBytes,
  getBytes,
} from 'firebase/storage';
import { doc, setDoc, updateDoc, Timestamp } from 'firebase/firestore';

const SIZE_LIMIT = 125_829_120; // 120 MB

describe('Storage security rules', () => {
  const projectId = 'skatehubba-storage-rules';
  const gameId = 'game123';
  const firestoreRulesPath = path.resolve(__dirname, '../../firestore.rules');
  const storageRulesPath = path.resolve(__dirname, '../../storage.rules');

  let testEnv: RulesTestEnvironment;

  const baseGame = {
    code: 'ABCD12',
    turn: 'A',
    phase: 'SET_RECORD',
    winner: null,
    players: {
      A: { uid: 'alice', name: 'Alice', letters: '' },
      B: { uid: 'bob', name: 'Bob', letters: '' },
    },
    current: {
      by: 'A',
      setVideoPath: null,
      responseVideoPath: null,
    },
    history: [] as Array<unknown>,
    createdAt: Timestamp.fromMillis(0),
    updatedAt: Timestamp.fromMillis(0),
  };

  const buildGame = (overrides: Partial<typeof baseGame> & {
    players?: Partial<typeof baseGame.players>;
    current?: Partial<typeof baseGame.current>;
    history?: Array<unknown>;
  } = {}) => ({
    ...baseGame,
    ...overrides,
    players: {
      A: { ...baseGame.players.A, ...(overrides.players?.A ?? {}) },
      B: { ...baseGame.players.B, ...(overrides.players?.B ?? {}) },
    },
    current: {
      ...baseGame.current,
      ...(overrides.current ?? {}),
    },
    history: overrides.history ?? baseGame.history,
  });

  const seedGame = async (data?: Parameters<typeof buildGame>[0]) => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, 'games', gameId), buildGame(data));
    });
  };

  const contextFor = (uid: string): RulesTestContext =>
    testEnv.authenticatedContext(uid, { uid });

  beforeAll(async () => {
    testEnv = await initializeTestEnvironment({
      projectId,
      firestore: {
        rules: readFileSync(firestoreRulesPath, 'utf8'),
      },
      storage: {
        rules: readFileSync(storageRulesPath, 'utf8'),
      },
    });
  });

  afterAll(async () => {
    await testEnv.cleanup();
  });

  beforeEach(async () => {
    await testEnv.clearFirestore();
    await testEnv.clearStorage();
    await seedGame();
  });

  it('allows the active shooter to upload a set clip within limits', async () => {
    const aliceStorage = getStorage(contextFor('alice').app);
    const fileRef = ref(aliceStorage, `games/${gameId}/current/A/clip.mp4`);
    await assertSucceeds(
      uploadBytes(fileRef, new Uint8Array(1024), {
        contentType: 'video/mp4',
      }),
    );
  });

  it('rejects uploads with disallowed MIME types', async () => {
    const aliceStorage = getStorage(contextFor('alice').app);
    const fileRef = ref(aliceStorage, `games/${gameId}/current/A/clip.mov`);
    await assertFails(
      uploadBytes(fileRef, new Uint8Array(1024), {
        contentType: 'video/avi',
      }),
    );
  });

  it('enforces the 120 MB size ceiling', async () => {
    const aliceStorage = getStorage(contextFor('alice').app);
    const fileRef = ref(aliceStorage, `games/${gameId}/current/A/big.mp4`);
    await assertFails(
      uploadBytes(fileRef, new Uint8Array(SIZE_LIMIT + 1), {
        contentType: 'video/mp4',
      }),
    );
  });

  it('blocks non-shooters from writing to the current clip path', async () => {
    const bobStorage = getStorage(contextFor('bob').app);
    const fileRef = ref(bobStorage, `games/${gameId}/current/B/clip.mp4`);
    await assertFails(
      uploadBytes(fileRef, new Uint8Array(1024), {
        contentType: 'video/mp4',
      }),
    );
  });

  it('allows the responder to upload only during RESP_RECORD', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const adminDb = context.firestore();
      await updateDoc(doc(adminDb, 'games', gameId), {
        phase: 'RESP_RECORD',
        'current.setVideoPath': `games/${gameId}/current/A/clip.mp4`,
      });
    });

    const bobStorage = getStorage(contextFor('bob').app);
    const respRef = ref(bobStorage, `games/${gameId}/current/B/resp.mp4`);
    await assertSucceeds(
      uploadBytes(respRef, new Uint8Array(2048), {
        contentType: 'video/mp4',
      }),
    );

    await testEnv.withSecurityRulesDisabled(async (context) => {
      const adminDb = context.firestore();
      await updateDoc(doc(adminDb, 'games', gameId), {
        'current.responseVideoPath': `games/${gameId}/current/B/resp.mp4`,
      });
    });

    await assertFails(
      uploadBytes(respRef, new Uint8Array(2048), {
        contentType: 'video/mp4',
      }),
    );
  });

  it('makes history clips world-readable', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const storage = getStorage(context.app);
      const historyRef = ref(storage, `games/${gameId}/history/round1.mp4`);
      await uploadBytes(historyRef, new Uint8Array(10), {
        contentType: 'video/mp4',
      });
    });

    const anonStorage = getStorage(testEnv.unauthenticatedContext().app);
    const historyRef = ref(anonStorage, `games/${gameId}/history/round1.mp4`);
    await assertSucceeds(getBytes(historyRef));
  });
});
