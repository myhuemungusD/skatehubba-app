const { initializeTestEnvironment, assertSucceeds, assertFails } = require('@firebase/rules-unit-testing');
const { readFileSync } = require('fs');
require('firebase/compat/app');
require('firebase/compat/firestore');
require('firebase/compat/storage');

const PROJECT_ID = 'skatehubba-test';
const STORAGE_RULES = readFileSync('storage.rules', 'utf8');
const FIRESTORE_RULES = readFileSync('firestore.rules', 'utf8');

async function seedGame(testEnv, gameId, data) {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await db.doc(`games/${gameId}`).set(data);
  });
}

async function setupEnvironment() {
  return initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules: FIRESTORE_RULES },
    storage: { rules: STORAGE_RULES },
  });
}

async function run() {
  const testEnv = await setupEnvironment();
  try {
    const baseGame = {
      phase: 'SET_RECORD',
      current: { by: 'A' },
      players: {
        A: { uid: 'setterUid' },
        B: { uid: 'responderUid' },
      },
    };

    await seedGame(testEnv, 'game-set', baseGame);
    const setterCtx = testEnv.authenticatedContext('setterUid');
    const setRef = setterCtx.storage().ref('challenges/game-set/setterUid/set.mp4');
    await assertSucceeds(setRef.put(Buffer.from('set'), { contentType: 'video/mp4' }));

    await testEnv.clearStorage();
    await testEnv.clearFirestore();

    await seedGame(testEnv, 'game-resp', {
      ...baseGame,
      phase: 'RESP_RECORD',
    });
    const responderCtx = testEnv.authenticatedContext('responderUid');
    const respRef = responderCtx.storage().ref('challenges/game-resp/responderUid/resp.webm');
    await assertSucceeds(respRef.put(Buffer.from('resp'), { contentType: 'video/webm' }));

    const wrongUserCtx = testEnv.authenticatedContext('intruder');
    await assertFails(
      wrongUserCtx
        .storage()
        .ref('challenges/game-resp/intruder/hack.mp4')
        .put(Buffer.from('hack'), { contentType: 'video/mp4' })
    );

    await assertFails(
      responderCtx
        .storage()
        .ref('challenges/game-resp/responderUid/notallowed.avi')
        .put(Buffer.from('bad'), { contentType: 'video/avi' })
    );

    await testEnv.clearStorage();
    await seedGame(testEnv, 'game-overwrite', baseGame);
    const overwriteCtx = testEnv.authenticatedContext('setterUid');
    const overwriteRef = overwriteCtx.storage().ref('challenges/game-overwrite/setterUid/set.mov');
    await assertSucceeds(overwriteRef.put(Buffer.from('first'), { contentType: 'video/quicktime' }));
    await assertFails(overwriteRef.put(Buffer.from('second'), { contentType: 'video/quicktime' }));

    await testEnv.clearStorage();
    await testEnv.clearFirestore();

    await seedGame(testEnv, 'game-size', baseGame);
    const bigCtx = testEnv.authenticatedContext('setterUid');
    const bigRef = bigCtx.storage().ref('challenges/game-size/setterUid/big.mp4');
    const tooBig = Buffer.alloc(121 * 1024 * 1024);
    await assertFails(bigRef.put(tooBig, { contentType: 'video/mp4' }));
  } finally {
    await testEnv.cleanup();
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
