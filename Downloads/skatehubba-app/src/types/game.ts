export type PlayerKey = "A" | "B";

export type GamePhase = "SET_RECORD" | "SET_JUDGE" | "RESP_RECORD" | "RESP_JUDGE";

export interface PlayerState {
  uid: string;
  name: string;
  letters: string;
}

export interface HistoryEntry {
  by: PlayerKey;
  setPath?: string;
  respPath?: string;
  result: "declined_set" | "approved_set" | "landed" | "failed";
  ts: unknown;
}

export interface CurrentState {
  by: PlayerKey;
  setVideoPath?: string;
  responseVideoPath?: string;
}

export interface GameDoc {
  code: string;
  turn: PlayerKey;
  phase: GamePhase;
  winner?: PlayerKey;
  players: {
    A: PlayerState;
    B: PlayerState;
  };
  current?: CurrentState;
  history?: HistoryEntry[];
}
