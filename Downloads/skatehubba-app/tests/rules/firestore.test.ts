import { readFileSync } from 'fs';
import path from 'path';
import { Timestamp, doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  RulesTestEnvironment,
  RulesTestContext,
} from '@firebase/rules-unit-testing';

describe('Firestore security rules', () => {
  const projectId = 'skatehubba-firestore-rules';
  const gameId = 'game123';
  const firestoreRulesPath = path.resolve(__dirname, '../../firestore.rules');

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
  } = {}) => {
    return {
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
    };
  };

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
    });
  });

  afterAll(async () => {
    await testEnv.cleanup();
  });

  beforeEach(async () => {
    await testEnv.clearFirestore();
    await seedGame();
  });

  it('allows participants to read their game', async () => {
    const aliceDb = contextFor('alice').firestore();
    await assertSucceeds(getDoc(doc(aliceDb, 'games', gameId)));
  });

  it('blocks non-participants from reading a game', async () => {
    const charlieDb = testEnv.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(charlieDb, 'games', gameId)));
  });

  it('prevents participants from changing phase or letters', async () => {
    const aliceDb = contextFor('alice').firestore();
    await assertFails(
      updateDoc(doc(aliceDb, 'games', gameId), {
        phase: 'RESP_RECORD',
      }),
    );
    await assertFails(
      updateDoc(doc(aliceDb, 'games', gameId), {
        'players.A.letters': 'SK',
      }),
    );
  });

  it('allows the active shooter to submit a set clip exactly once', async () => {
    const aliceDb = contextFor('alice').firestore();
    await assertSucceeds(
      updateDoc(doc(aliceDb, 'games', gameId), {
        'current.setVideoPath': `games/${gameId}/current/A/clip.mp4`,
      }),
    );
    await assertFails(
      updateDoc(doc(aliceDb, 'games', gameId), {
        'current.setVideoPath': `games/${gameId}/current/A/clip-2.mp4`,
      }),
    );
  });

  it('blocks the opponent from submitting the setter clip', async () => {
    const bobDb = contextFor('bob').firestore();
    await assertFails(
      updateDoc(doc(bobDb, 'games', gameId), {
        'current.setVideoPath': `games/${gameId}/current/B/clip.mp4`,
      }),
    );
  });

  it('allows the responder to submit a response clip once the game enters RESP_RECORD', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const adminDb = context.firestore();
      await updateDoc(doc(adminDb, 'games', gameId), {
        phase: 'RESP_RECORD',
        'current.setVideoPath': `games/${gameId}/current/A/clip.mp4`,
      });
    });

    const bobDb = contextFor('bob').firestore();
    await assertSucceeds(
      updateDoc(doc(bobDb, 'games', gameId), {
        'current.responseVideoPath': `games/${gameId}/current/B/resp.mp4`,
      }),
    );
    await assertFails(
      updateDoc(doc(bobDb, 'games', gameId), {
        'current.responseVideoPath': `games/${gameId}/current/B/resp-second.mp4`,
      }),
    );
  });

  it('prevents response submissions before the phase is RESP_RECORD', async () => {
    const bobDb = contextFor('bob').firestore();
    await assertFails(
      updateDoc(doc(bobDb, 'games', gameId), {
        'current.responseVideoPath': `games/${gameId}/current/B/resp.mp4`,
      }),
    );
  });

  it('allows the setter to enqueue a set clip intent', async () => {
    const aliceDb = contextFor('alice').firestore();
    await assertSucceeds(
      setDoc(doc(aliceDb, 'games', gameId, 'intents', 'alice_SET_RECORD_submit_set_clip'), {
        type: 'submit_set_clip',
        createdAt: Timestamp.fromMillis(1),
        phase: 'SET_RECORD',
        by: 'A',
        storagePath: `games/${gameId}/current/A/clip.mp4`,
      }),
    );
  });

  it('prevents duplicate set clip intents in the same phase', async () => {
    const aliceDb = contextFor('alice').firestore();
    const intentRef = doc(aliceDb, 'games', gameId, 'intents', 'alice_SET_RECORD_submit_set_clip');
    await assertSucceeds(
      setDoc(intentRef, {
        type: 'submit_set_clip',
        createdAt: Timestamp.fromMillis(1),
        phase: 'SET_RECORD',
        by: 'A',
        storagePath: `games/${gameId}/current/A/clip.mp4`,
      }),
    );
    await assertFails(
      setDoc(intentRef, {
        type: 'submit_set_clip',
        createdAt: Timestamp.fromMillis(2),
        phase: 'SET_RECORD',
        by: 'A',
        storagePath: `games/${gameId}/current/A/clip-2.mp4`,
      }),
    );
  });

  it('allows the judge to record a decision only in the correct phase', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const adminDb = context.firestore();
      await updateDoc(doc(adminDb, 'games', gameId), {
        phase: 'SET_JUDGE',
        'current.setVideoPath': `games/${gameId}/current/A/clip.mp4`,
      });
    });

    const bobDb = contextFor('bob').firestore();
    await assertSucceeds(
      setDoc(doc(bobDb, 'games', gameId, 'intents', 'bob_SET_JUDGE_judge_set'), {
        type: 'judge_set',
        createdAt: Timestamp.fromMillis(10),
        phase: 'SET_JUDGE',
        by: 'B',
        approve: true,
      }),
    );

    const aliceDb = contextFor('alice').firestore();
    await assertFails(
      setDoc(doc(aliceDb, 'games', gameId, 'intents', 'alice_SET_JUDGE_judge_set'), {
        type: 'judge_set',
        createdAt: Timestamp.fromMillis(11),
        phase: 'SET_JUDGE',
        by: 'A',
        approve: true,
      }),
    );
  });

  it('restricts self-fail intents to the appropriate player and phase', async () => {
    const aliceDb = contextFor('alice').firestore();
    await assertSucceeds(
      setDoc(doc(aliceDb, 'games', gameId, 'intents', 'alice_SET_RECORD_self_fail_set'), {
        type: 'self_fail_set',
        createdAt: Timestamp.fromMillis(20),
        phase: 'SET_RECORD',
        by: 'A',
      }),
    );

    const bobDb = contextFor('bob').firestore();
    await assertFails(
      setDoc(doc(bobDb, 'games', gameId, 'intents', 'bob_SET_RECORD_self_fail_resp'), {
        type: 'self_fail_resp',
        createdAt: Timestamp.fromMillis(21),
        phase: 'SET_RECORD',
        by: 'B',
      }),
    );

    await testEnv.withSecurityRulesDisabled(async (context) => {
      const adminDb = context.firestore();
      await updateDoc(doc(adminDb, 'games', gameId), {
        phase: 'RESP_RECORD',
        'current.setVideoPath': `games/${gameId}/current/A/clip.mp4`,
      });
    });

    await assertSucceeds(
      setDoc(doc(bobDb, 'games', gameId, 'intents', 'bob_RESP_RECORD_self_fail_resp'), {
        type: 'self_fail_resp',
        createdAt: Timestamp.fromMillis(22),
        phase: 'RESP_RECORD',
        by: 'B',
      }),
    );
  });
});
