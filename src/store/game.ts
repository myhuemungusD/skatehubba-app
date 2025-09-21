'use client';

import { httpsCallable } from 'firebase/functions';
import {
  collection,
  doc,
  getDocs,
  limit,
  onSnapshot,
  query,
  Unsubscribe,
  where
} from 'firebase/firestore';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { devtools, subscribeWithSelector } from 'zustand/middleware';
import { create } from 'zustand';
import { auth, ensureSignedIn, firestore, functions } from '../lib/firebase';

export type PlayerSlot = 'A' | 'B';
export type GamePhase = 'SET_RECORD' | 'SET_JUDGE' | 'RESP_RECORD' | 'RESP_JUDGE';

export interface PlayerState {
  uid: string;
  name: string;
  letters: string;
}

export interface GameCurrentState {
  by: PlayerSlot;
  setVideoPath?: string;
  responseVideoPath?: string;
}

export type HistoryResult = 'declined_set' | 'approved_set' | 'landed' | 'failed';

export interface GameHistoryEntry {
  by: PlayerSlot;
  setPath?: string;
  respPath?: string;
  result: HistoryResult;
  ts: string;
}

export interface GameDocument {
  code: string;
  turn: PlayerSlot;
  phase: GamePhase;
  winner?: PlayerSlot;
  players: {
    A?: PlayerState;
    B?: PlayerState;
  };
  current: GameCurrentState;
  history: GameHistoryEntry[];
}

interface PhaseGuards {
  isShooter: boolean;
  isJudge: boolean;
  canRecord: boolean;
  canApprove: boolean;
  canSelfFail: boolean;
}

export interface GameStoreState {
  user: User | null;
  initializing: boolean;
  gameId?: string;
  code?: string;
  role?: PlayerSlot;
  game?: GameDocument;
  guards: PhaseGuards;
  loading: boolean;
  error?: string;
  actions: {
    bootstrap: () => Promise<void>;
    createGame: (name: string) => Promise<{ gameId: string; code: string }>;
    joinGame: (code: string, name: string) => Promise<void>;
    connectGame: (code: string) => Promise<void>;
    submitSetClip: (storagePath: string) => Promise<void>;
    judgeSet: (approve: boolean) => Promise<void>;
    submitResponseClip: (storagePath: string) => Promise<void>;
    judgeResponse: (approve: boolean) => Promise<void>;
    selfFailSet: () => Promise<void>;
    selfFailResponse: () => Promise<void>;
    leaveGame: () => void;
    clearError: () => void;
  };
}

const initialGuards: PhaseGuards = {
  isShooter: false,
  isJudge: false,
  canRecord: false,
  canApprove: false,
  canSelfFail: false
};

let authUnsubscribe: Unsubscribe | null = null;
let gameUnsubscribe: Unsubscribe | null = null;

const deriveGuards = (game: GameDocument | undefined, role: PlayerSlot | undefined): PhaseGuards => {
  if (!game || !role) {
    return initialGuards;
  }

  const isShooter = game.current.by === role;
  const isJudge = !isShooter;

  const canRecord =
    (game.phase === 'SET_RECORD' && isShooter && game.turn === role) ||
    (game.phase === 'RESP_RECORD' && isShooter);

  const canApprove =
    (game.phase === 'SET_JUDGE' && isJudge && game.turn === (role === 'A' ? 'B' : 'A')) ||
    (game.phase === 'RESP_JUDGE' && isJudge);

  const canSelfFail =
    (game.phase === 'SET_RECORD' && isShooter) ||
    (game.phase === 'RESP_RECORD' && isShooter);

  return {
    isShooter,
    isJudge,
    canRecord,
    canApprove,
    canSelfFail
  };
};

export const derivePhaseGuards = deriveGuards;

const bindGame = (gameId: string, set: (partial: Partial<GameStoreState>) => void, get: () => GameStoreState) => {
  if (gameUnsubscribe) {
    gameUnsubscribe();
    gameUnsubscribe = null;
  }

  const gameRef = doc(firestore, 'games', gameId);
  gameUnsubscribe = onSnapshot(
    gameRef,
    (snapshot) => {
      if (!snapshot.exists()) {
        set({ error: 'Game not found', loading: false, game: undefined, gameId: undefined, code: undefined });
        return;
      }

      const data = snapshot.data() as GameDocument;
      const user = get().user;
      let role: PlayerSlot | undefined = get().role;

      if (user) {
        const { players } = data;
        if (players.A?.uid === user.uid) {
          role = 'A';
        } else if (players.B?.uid === user.uid) {
          role = 'B';
        }
      }

      set({
        game: data,
        gameId,
        code: data.code,
        role,
        loading: false,
        guards: deriveGuards(data, role)
      });
    },
    (error) => {
      console.error('Failed to subscribe to game', error);
      set({ error: error.message, loading: false });
    }
  );
};

const handleError = (set: (partial: Partial<GameStoreState>) => void, error: unknown) => {
  const message = error instanceof Error ? error.message : 'Unexpected error';
  set({ error: message, loading: false });
};

const callCloudFunction = async <T>(name: string, payload: Record<string, unknown> | undefined = undefined): Promise<T> => {
  const callable = httpsCallable(functions, name);
  const result = await callable(payload ?? {});
  return result.data as T;
};

export const useGameStore = create<GameStoreState>()(
  devtools(
    subscribeWithSelector((set, get) => ({
      user: null,
      initializing: true,
      game: undefined,
      gameId: undefined,
      code: undefined,
      role: undefined,
      guards: initialGuards,
      loading: false,
      error: undefined,
      actions: {
        bootstrap: async () => {
          if (authUnsubscribe || typeof window === 'undefined') {
            return;
          }

          set({ initializing: true });

          await ensureSignedIn();

          authUnsubscribe = onAuthStateChanged(auth, (user) => {
            set({ user, initializing: false });
            const currentGame = get().game;
            if (currentGame) {
              set({ guards: deriveGuards(currentGame, get().role) });
            }
          });
        },
        createGame: async (name: string) => {
          try {
            set({ loading: true });
            const data = await callCloudFunction<{ gameId: string; code: string }>('createGame', { name });
            await ensureSignedIn();
            set({ loading: false });
            return data;
          } catch (error) {
            handleError(set, error);
            throw error;
          }
        },
        joinGame: async (code: string, name: string) => {
          try {
            set({ loading: true });
            await ensureSignedIn();
            await callCloudFunction('joinGame', { code, name });
            await get().actions.connectGame(code);
            set({ loading: false });
          } catch (error) {
            handleError(set, error);
            throw error;
          }
        },
        connectGame: async (code: string) => {
          try {
            set({ loading: true, error: undefined });
            await ensureSignedIn();
            const gamesQuery = query(collection(firestore, 'games'), where('code', '==', code), limit(1));
            const snapshot = await getDocs(gamesQuery);
            if (snapshot.empty) {
              set({ loading: false, error: 'Game not found' });
              return;
            }

            const [document] = snapshot.docs;
            bindGame(document.id, set, get);
            set({ loading: false });
          } catch (error) {
            handleError(set, error);
          }
        },
        submitSetClip: async (storagePath: string) => {
          try {
            const { gameId } = get();
            if (!gameId) {
              throw new Error('Missing game context');
            }
            set({ loading: true });
            await callCloudFunction('submitSetClip', { gameId, storagePath });
            set({ loading: false });
          } catch (error) {
            handleError(set, error);
          }
        },
        judgeSet: async (approve: boolean) => {
          try {
            const { gameId } = get();
            if (!gameId) {
              throw new Error('Missing game context');
            }
            set({ loading: true });
            await callCloudFunction('judgeSet', { gameId, approve });
            set({ loading: false });
          } catch (error) {
            handleError(set, error);
          }
        },
        submitResponseClip: async (storagePath: string) => {
          try {
            const { gameId } = get();
            if (!gameId) {
              throw new Error('Missing game context');
            }
            set({ loading: true });
            await callCloudFunction('submitRespClip', { gameId, storagePath });
            set({ loading: false });
          } catch (error) {
            handleError(set, error);
          }
        },
        judgeResponse: async (approve: boolean) => {
          try {
            const { gameId } = get();
            if (!gameId) {
              throw new Error('Missing game context');
            }
            set({ loading: true });
            await callCloudFunction('judgeResp', { gameId, approve });
            set({ loading: false });
          } catch (error) {
            handleError(set, error);
          }
        },
        selfFailSet: async () => {
          try {
            const { gameId } = get();
            if (!gameId) {
              throw new Error('Missing game context');
            }
            set({ loading: true });
            await callCloudFunction('selfFailSet', { gameId });
            set({ loading: false });
          } catch (error) {
            handleError(set, error);
          }
        },
        selfFailResponse: async () => {
          try {
            const { gameId } = get();
            if (!gameId) {
              throw new Error('Missing game context');
            }
            set({ loading: true });
            await callCloudFunction('selfFailResp', { gameId });
            set({ loading: false });
          } catch (error) {
            handleError(set, error);
          }
        },
        leaveGame: () => {
          if (gameUnsubscribe) {
            gameUnsubscribe();
            gameUnsubscribe = null;
          }
          set({ game: undefined, gameId: undefined, code: undefined, role: undefined, guards: initialGuards });
        },
        clearError: () => set({ error: undefined })
      }
    }))
  )
);

export const selectGame = (state: GameStoreState) => state.game;
export const selectGuards = (state: GameStoreState) => state.guards;
export const selectRole = (state: GameStoreState) => state.role;
export const selectPhase = (state: GameStoreState) => state.game?.phase;
export const selectActions = (state: GameStoreState) => state.actions;
