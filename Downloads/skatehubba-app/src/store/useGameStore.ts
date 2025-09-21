import { create } from "zustand";
import type { GameDoc } from "@/types/game";

interface GameState {
  gameId: string | null;
  game: GameDoc | null;
  loading: boolean;
  error?: string;
  setSnapshot: (gameId: string, data: GameDoc) => void;
  setLoading: (loading: boolean) => void;
  setError: (error?: string) => void;
  clear: () => void;
}

export const useGameStore = create<GameState>((set) => ({
  gameId: null,
  game: null,
  loading: true,
  error: undefined,
  setSnapshot: (gameId, data) =>
    set({ gameId, game: data, loading: false, error: undefined }),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error, loading: false, game: null, gameId: null }),
  clear: () => set({ gameId: null, game: null, loading: false, error: undefined }),
}));
