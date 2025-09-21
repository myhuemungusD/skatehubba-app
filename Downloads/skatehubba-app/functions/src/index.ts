import { randomBytes } from 'crypto';
import type { firestore as Firestore } from 'firebase-admin';
import { CallableRequest, HttpsError, onCall } from 'firebase-functions/v2/https';
import { setGlobalOptions } from 'firebase-functions/v2/options';
import { z } from 'zod';
import { admin, db } from './firebase';
import {
  GameDoc,
  HistoryEntry,
  PlayerKey,
  gameSchema,
  lettersSequence,
  playerKeySchema,
} from './schema';
import { RateLimitConfig, enforceRateLimit } from './rateLimit';

setGlobalOptions({
  region: 'us-central1',
  maxInstances: 20,
});

const callableCors = [/localhost(:\d+)?$/, /skatehubba\.app$/];

interface HandlerContext {
  auth: CallableRequest<unknown>['auth'];
  ip: string | null | undefined;
  now: admin.firestore.Timestamp;
}

type Handler<TInput, TResult> = (input: TInput, context: HandlerContext) => Promise<TResult>;

type AuthContext = NonNullable<CallableRequest<unknown>['auth']>;

const createGameInputSchema = z.object({
  name: z.string().trim().min(1).max(60),
});

const joinGameInputSchema = z.object({
  code: z.string().trim().length(6).regex(/^[A-Z0-9]{6}$/i),
  name: z.string().trim().min(1).max(60),
});

const gameActionSchema = z.object({
  gameId: z.string().min(1),
});

const clipSchema = gameActionSchema.extend({
  storagePath: z.string().trim().min(1),
});

const judgeSchema = gameActionSchema.extend({
  approve: z.boolean(),
});

const rateLimits: Record<string, RateLimitConfig> = {
  createGame: { windowMs: 60_000, max: 5 },
  joinGame: { windowMs: 60_000, max: 10 },
  submitSetClip: { windowMs: 60_000, max: 20 },
  judgeSet: { windowMs: 60_000, max: 20 },
  submitRespClip: { windowMs: 60_000, max: 20 },
  judgeResp: { windowMs: 60_000, max: 20 },
  selfFailSet: { windowMs: 60_000, max: 20 },
  selfFailResp: { windowMs: 60_000, max: 20 },
};

function buildContext(request: CallableRequest<unknown>): HandlerContext {
  return {
    auth: request.auth ?? null,
    ip: request.rawRequest?.ip,
    now: admin.firestore.Timestamp.now(),
  };
}

function assertAuth(context: HandlerContext): AuthContext {
  if (!context.auth) {
    throw new HttpsError('unauthenticated', 'Authentication required.');
  }
  return context.auth;
}

function getPlayerKey(game: GameDoc, uid: string): PlayerKey {
  if (game.players.A.uid === uid) {
    return 'A';
  }
  if (game.players.B && game.players.B.uid === uid) {
    return 'B';
  }
  throw new HttpsError('permission-denied', 'You are not a participant in this game.');
}

function getOpponent(key: PlayerKey): PlayerKey {
  return key === 'A' ? 'B' : 'A';
}

async function getGameOrThrow(
  tx: Firestore.Transaction,
  gameId: string,
): Promise<{ ref: Firestore.DocumentReference; data: GameDoc }> {
  const ref = db.collection('games').doc(gameId);
  const snap = await tx.get(ref);
  if (!snap.exists) {
    throw new HttpsError('not-found', 'Game not found.');
  }
  const parsed = gameSchema.safeParse(snap.data());
  if (!parsed.success) {
    throw new HttpsError('internal', 'Game data is invalid.');
  }
  return { ref, data: parsed.data };
}

async function enforceFunctionRateLimit(
  functionName: keyof typeof rateLimits,
  context: HandlerContext,
) {
  const config = rateLimits[functionName];
  await enforceRateLimit(
    functionName,
    [
      context.auth?.uid ? `uid_${context.auth.uid}` : null,
      context.ip ? `ip_${context.ip}` : null,
    ],
    config,
    context.now,
  );
}

const CODE_CHARS = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
const CODE_LENGTH = 6;

function randomCode(): string {
  const bytes = randomBytes(CODE_LENGTH);
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i += 1) {
    const index = bytes[i] % CODE_CHARS.length;
    code += CODE_CHARS[index];
  }
  return code;
}

async function generateGameCode(): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const candidate = randomCode();
    const existing = await db
      .collection('games')
      .where('code', '==', candidate)
      .limit(1)
      .get();
    if (existing.empty) {
      return candidate;
    }
  }
  throw new HttpsError('internal', 'Unable to generate a unique game code.');
}

function validateStoragePath(gameId: string, path: string, kind: 'set' | 'response'): string {
  const trimmed = path.trim();
  if (!trimmed.startsWith(`games/${gameId}/`)) {
    throw new HttpsError('invalid-argument', 'Storage path must be scoped to the game.');
  }
  if (trimmed.includes('..')) {
    throw new HttpsError('invalid-argument', 'Storage path contains invalid segments.');
  }
  const segments = trimmed.split('/');
  if (segments.length < 4) {
    throw new HttpsError('invalid-argument', 'Storage path is incomplete.');
  }
  if (segments[0] !== 'games' || segments[1] !== gameId) {
    throw new HttpsError('invalid-argument', 'Storage path mismatch.');
  }
  const category = segments[2];
  if (kind === 'set' && category !== 'set') {
    throw new HttpsError('invalid-argument', 'Set clips must be saved under the set folder.');
  }
  if (kind === 'response' && category !== 'response') {
    throw new HttpsError(
      'invalid-argument',
      'Response clips must be saved under the response folder.',
    );
  }
  const extension = trimmed.split('.').pop()?.toLowerCase();
  if (!extension || !['mp4', 'mov', 'webm'].includes(extension)) {
    throw new HttpsError('invalid-argument', 'Unsupported video type.');
  }
  return trimmed;
}

function nextLetters(current: string): { value: string; completed: boolean } {
  if (current === '') {
    return { value: lettersSequence[0], completed: false };
  }
  if (current === lettersSequence[0]) {
    return { value: `${lettersSequence[0]}${lettersSequence[1]}`, completed: false };
  }
  if (current === `${lettersSequence[0]}${lettersSequence[1]}`) {
    return {
      value: `${lettersSequence[0]}${lettersSequence[1]}${lettersSequence[2]}`,
      completed: true,
    };
  }
  return { value: current, completed: true };
}

async function createGameImpl(input: z.infer<typeof createGameInputSchema>, context: HandlerContext) {
  const auth = assertAuth(context);
  await enforceFunctionRateLimit('createGame', context);

  const code = await generateGameCode();
  const gameRef = db.collection('games').doc();
  const now = context.now;

  const gameData: GameDoc = {
    code,
    turn: 'A',
    phase: 'SET_RECORD',
    winner: null,
    players: {
      A: { uid: auth.uid, name: input.name, letters: '' },
      B: null,
    },
    current: {
      by: 'A',
      setVideoPath: null,
      responseVideoPath: null,
    },
    history: [],
    createdAt: now,
    updatedAt: now,
  };

  const parsed = gameSchema.safeParse(gameData);
  if (!parsed.success) {
    throw new HttpsError('internal', 'Failed to validate game payload.');
  }

  await gameRef.set(gameData);
  return { gameId: gameRef.id, code };
}

async function joinGameImpl(input: z.infer<typeof joinGameInputSchema>, context: HandlerContext) {
  const auth = assertAuth(context);
  await enforceFunctionRateLimit('joinGame', context);

  const normalizedCode = input.code.toUpperCase();
  const now = context.now;

  let gameId: string | null = null;

  await db.runTransaction(async (tx) => {
    const query = await tx.get(
      db.collection('games').where('code', '==', normalizedCode).limit(1),
    );
    if (query.empty) {
      throw new HttpsError('not-found', 'Game not found.');
    }
    const doc = query.docs[0];
    const parsed = gameSchema.safeParse(doc.data());
    if (!parsed.success) {
      throw new HttpsError('internal', 'Game data is invalid.');
    }
    const game = parsed.data;
    if (game.players.A.uid === auth.uid) {
      throw new HttpsError('failed-precondition', 'You already created this game.');
    }
    if (game.players.B) {
      throw new HttpsError('already-exists', 'Game is already full.');
    }

    const update: Firestore.UpdateData = {
      'players.B': { uid: auth.uid, name: input.name, letters: '' },
      updatedAt: now,
    };

    tx.update(doc.ref, update);
    gameId = doc.id;
  });

  if (!gameId) {
    throw new HttpsError('internal', 'Failed to join game.');
  }

  return { code: normalizedCode, gameId };
}

async function submitSetClipImpl(input: z.infer<typeof clipSchema>, context: HandlerContext) {
  const auth = assertAuth(context);
  await enforceFunctionRateLimit('submitSetClip', context);

  await db.runTransaction(async (tx) => {
    const { ref, data } = await getGameOrThrow(tx, input.gameId);
    const playerKey = getPlayerKey(data, auth.uid);
    if (!data.players.B) {
      throw new HttpsError('failed-precondition', 'Waiting for an opponent to join.');
    }
    if (data.phase !== 'SET_RECORD' || data.turn !== playerKey) {
      throw new HttpsError('failed-precondition', 'You cannot submit a set clip right now.');
    }
    if (data.current.setVideoPath) {
      throw new HttpsError('failed-precondition', 'Set clip already submitted.');
    }

    const storagePath = validateStoragePath(input.gameId, input.storagePath, 'set');

    const update: Firestore.UpdateData = {
      current: {
        by: playerKey,
        setVideoPath: storagePath,
        responseVideoPath: null,
      },
      phase: 'SET_JUDGE',
      updatedAt: context.now,
    };

    tx.update(ref, update);
  });

  return { phase: 'SET_JUDGE' as const };
}

async function judgeSetImpl(input: z.infer<typeof judgeSchema>, context: HandlerContext) {
  const auth = assertAuth(context);
  await enforceFunctionRateLimit('judgeSet', context);

  await db.runTransaction(async (tx) => {
    const { ref, data } = await getGameOrThrow(tx, input.gameId);
    const setterKey = data.current.by;
    const callerKey = getPlayerKey(data, auth.uid);
    const judgeKey = getOpponent(setterKey);

    if (callerKey !== judgeKey) {
      throw new HttpsError('permission-denied', 'Only the opponent can judge the set.');
    }
    if (data.phase !== 'SET_JUDGE') {
      throw new HttpsError('failed-precondition', 'Not awaiting set approval.');
    }
    if (!data.current.setVideoPath) {
      throw new HttpsError('failed-precondition', 'No set clip to judge.');
    }

    const history = [...data.history];
    const update: Firestore.UpdateData = {
      updatedAt: context.now,
    };

    if (!input.approve) {
      const entry: HistoryEntry = {
        by: setterKey,
        setPath: data.current.setVideoPath,
        respPath: null,
        result: 'declined_set',
        ts: context.now,
      };
      history.push(entry);
      update.history = history;
      update.phase = 'SET_RECORD';
      update.turn = setterKey;
      update.current = {
        by: setterKey,
        setVideoPath: null,
        responseVideoPath: null,
      };
    } else {
      const entry: HistoryEntry = {
        by: setterKey,
        setPath: data.current.setVideoPath,
        respPath: null,
        result: 'approved_set',
        ts: context.now,
      };
      history.push(entry);
      update.history = history;
      update.phase = 'RESP_RECORD';
      update.current = {
        by: setterKey,
        setVideoPath: data.current.setVideoPath,
        responseVideoPath: null,
      };
      update.turn = setterKey;
    }

    tx.update(ref, update);
  });

  return { phase: input.approve ? 'RESP_RECORD' : 'SET_RECORD' };
}

async function submitRespClipImpl(input: z.infer<typeof clipSchema>, context: HandlerContext) {
  const auth = assertAuth(context);
  await enforceFunctionRateLimit('submitRespClip', context);

  await db.runTransaction(async (tx) => {
    const { ref, data } = await getGameOrThrow(tx, input.gameId);
    const setterKey = data.current.by;
    const responderKey = getOpponent(setterKey);
    const callerKey = getPlayerKey(data, auth.uid);

    if (callerKey !== responderKey) {
      throw new HttpsError('permission-denied', 'Only the responder can submit a clip.');
    }
    if (data.phase !== 'RESP_RECORD') {
      throw new HttpsError('failed-precondition', 'Not awaiting a response clip.');
    }
    if (data.current.responseVideoPath) {
      throw new HttpsError('failed-precondition', 'Response already submitted.');
    }

    const storagePath = validateStoragePath(input.gameId, input.storagePath, 'response');

    const update: Firestore.UpdateData = {
      current: {
        by: setterKey,
        setVideoPath: data.current.setVideoPath,
        responseVideoPath: storagePath,
      },
      phase: 'RESP_JUDGE',
      updatedAt: context.now,
    };

    tx.update(ref, update);
  });

  return { phase: 'RESP_JUDGE' as const };
}

async function judgeRespImpl(input: z.infer<typeof judgeSchema>, context: HandlerContext) {
  const auth = assertAuth(context);
  await enforceFunctionRateLimit('judgeResp', context);

  await db.runTransaction(async (tx) => {
    const { ref, data } = await getGameOrThrow(tx, input.gameId);
    const setterKey = data.current.by;
    const callerKey = getPlayerKey(data, auth.uid);
    if (callerKey !== setterKey) {
      throw new HttpsError('permission-denied', 'Only the setter can judge the response.');
    }
    if (data.phase !== 'RESP_JUDGE') {
      throw new HttpsError('failed-precondition', 'Not awaiting response judgement.');
    }
    if (!data.current.setVideoPath || !data.current.responseVideoPath) {
      throw new HttpsError('failed-precondition', 'Missing clips to judge.');
    }

    const responderKey = getOpponent(setterKey);
    const history = [...data.history];
    if (!history.length || history[history.length - 1].result !== 'approved_set') {
      throw new HttpsError('failed-precondition', 'Set approval record missing.');
    }
    const lastEntry = history[history.length - 1];
    history[history.length - 1] = {
      by: lastEntry.by,
      setPath: data.current.setVideoPath,
      respPath: data.current.responseVideoPath,
      result: input.approve ? 'landed' : 'failed',
      ts: context.now,
    };

    const update: Firestore.UpdateData = {
      history,
      phase: 'SET_RECORD',
      turn: responderKey,
      current: {
        by: responderKey,
        setVideoPath: null,
        responseVideoPath: null,
      },
      updatedAt: context.now,
    };

    if (!input.approve) {
      const currentLetters = data.players[responderKey]?.letters ?? '';
      const { value, completed } = nextLetters(currentLetters);
      (update as Record<string, unknown>)[`players.${responderKey}.letters`] = value;
      if (completed) {
        update.winner = setterKey;
      }
    }

    tx.update(ref, update);
  });

  return { phase: 'SET_RECORD' as const };
}

async function selfFailSetImpl(input: z.infer<typeof gameActionSchema>, context: HandlerContext) {
  const auth = assertAuth(context);
  await enforceFunctionRateLimit('selfFailSet', context);

  await db.runTransaction(async (tx) => {
    const { ref, data } = await getGameOrThrow(tx, input.gameId);
    const playerKey = getPlayerKey(data, auth.uid);
    if (data.phase !== 'SET_RECORD' || data.turn !== playerKey) {
      throw new HttpsError('failed-precondition', 'Self fail is only available during your set.');
    }
    const opponent = getOpponent(playerKey);
    const history = [...data.history];
    history.push({
      by: playerKey,
      setPath: null,
      respPath: null,
      result: 'failed',
      ts: context.now,
    });

    const update: Firestore.UpdateData = {
      history,
      phase: 'SET_RECORD',
      turn: opponent,
      current: {
        by: opponent,
        setVideoPath: null,
        responseVideoPath: null,
      },
      updatedAt: context.now,
    };

    tx.update(ref, update);
  });

  return { phase: 'SET_RECORD' as const };
}

async function selfFailRespImpl(input: z.infer<typeof gameActionSchema>, context: HandlerContext) {
  const auth = assertAuth(context);
  await enforceFunctionRateLimit('selfFailResp', context);

  await db.runTransaction(async (tx) => {
    const { ref, data } = await getGameOrThrow(tx, input.gameId);
    const setterKey = data.current.by;
    const responderKey = getOpponent(setterKey);
    const callerKey = getPlayerKey(data, auth.uid);
    if (callerKey !== responderKey) {
      throw new HttpsError('permission-denied', 'Only the responder can self-fail.');
    }
    if (data.phase !== 'RESP_RECORD') {
      throw new HttpsError('failed-precondition', 'Self fail is only available while recording a response.');
    }

    const history = [...data.history];
    if (!history.length || history[history.length - 1].result !== 'approved_set') {
      throw new HttpsError('failed-precondition', 'Set approval record missing.');
    }
    history[history.length - 1] = {
      by: setterKey,
      setPath: data.current.setVideoPath,
      respPath: null,
      result: 'failed',
      ts: context.now,
    };

    const update: Firestore.UpdateData = {
      history,
      phase: 'SET_RECORD',
      turn: responderKey,
      current: {
        by: responderKey,
        setVideoPath: null,
        responseVideoPath: null,
      },
      updatedAt: context.now,
    };

    const currentLetters = data.players[responderKey]?.letters ?? '';
    const { value, completed } = nextLetters(currentLetters);
    (update as Record<string, unknown>)[`players.${responderKey}.letters`] = value;
    if (completed) {
      update.winner = setterKey;
    }

    tx.update(ref, update);
  });

  return { phase: 'SET_RECORD' as const };
}

function wrapHandler<TInput, TResult>(
  schema: z.ZodType<TInput>,
  handler: Handler<TInput, TResult>,
) {
  return async (request: CallableRequest<unknown>): Promise<TResult> => {
    const context = buildContext(request);
    let parsed: TInput;
    try {
      parsed = schema.parse(request.data);
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new HttpsError('invalid-argument', error.message);
      }
      throw error;
    }
    return handler(parsed, context);
  };
}

export const createGame = onCall({ cors: callableCors }, wrapHandler(createGameInputSchema, createGameImpl));
export const joinGame = onCall({ cors: callableCors }, wrapHandler(joinGameInputSchema, joinGameImpl));
export const submitSetClip = onCall({ cors: callableCors }, wrapHandler(clipSchema, submitSetClipImpl));
export const judgeSet = onCall({ cors: callableCors }, wrapHandler(judgeSchema, judgeSetImpl));
export const submitRespClip = onCall({ cors: callableCors }, wrapHandler(clipSchema, submitRespClipImpl));
export const judgeResp = onCall({ cors: callableCors }, wrapHandler(judgeSchema, judgeRespImpl));
export const selfFailSet = onCall({ cors: callableCors }, wrapHandler(gameActionSchema, selfFailSetImpl));
export const selfFailResp = onCall({ cors: callableCors }, wrapHandler(gameActionSchema, selfFailRespImpl));

export const handlers = {
  createGameImpl,
  joinGameImpl,
  submitSetClipImpl,
  judgeSetImpl,
  submitRespClipImpl,
  judgeRespImpl,
  selfFailSetImpl,
  selfFailRespImpl,
};

export const internal = {
  buildContext,
  playerKeySchema,
};
