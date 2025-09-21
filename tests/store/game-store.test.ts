import { describe, expect, it, beforeEach } from 'vitest';
import { derivePhaseGuards, type GameDocument, useGameStore } from '../../src/store/game';

describe('derivePhaseGuards', () => {
  const baseGame: GameDocument = {
    code: 'ABCD',
    turn: 'A',
    phase: 'SET_RECORD',
    winner: undefined,
    players: {
      A: { uid: 'alice', name: 'Alice', letters: '' },
      B: { uid: 'bruno', name: 'Bruno', letters: '' }
    },
    current: {
      by: 'A',
      setVideoPath: undefined,
      responseVideoPath: undefined
    },
    history: []
  };

  it('allows the shooter to record during SET_RECORD', () => {
    const guards = derivePhaseGuards(baseGame, 'A');
    expect(guards.isShooter).toBe(true);
    expect(guards.canRecord).toBe(true);
    expect(guards.canApprove).toBe(false);
  });

  it('allows the judge to approve during SET_JUDGE', () => {
    const guards = derivePhaseGuards({ ...baseGame, phase: 'SET_JUDGE' }, 'B');
    expect(guards.isJudge).toBe(true);
    expect(guards.canApprove).toBe(true);
    expect(guards.canRecord).toBe(false);
  });

  it('allows the responder to record during RESP_RECORD', () => {
    const guards = derivePhaseGuards(
      {
        ...baseGame,
        phase: 'RESP_RECORD',
        current: { ...baseGame.current, by: 'B' },
        turn: 'A'
      },
      'B'
    );
    expect(guards.isShooter).toBe(true);
    expect(guards.canRecord).toBe(true);
    expect(guards.canApprove).toBe(false);
  });

  it('allows the original setter to judge the response during RESP_JUDGE', () => {
    const guards = derivePhaseGuards(
      {
        ...baseGame,
        phase: 'RESP_JUDGE',
        current: { ...baseGame.current, by: 'B' },
        turn: 'A'
      },
      'A'
    );
    expect(guards.isJudge).toBe(true);
    expect(guards.canApprove).toBe(true);
    expect(guards.canRecord).toBe(false);
  });
});

describe('game store state management', () => {
  const baseGame: GameDocument = {
    code: 'ROOM1',
    turn: 'A',
    phase: 'SET_RECORD',
    players: {
      A: { uid: 'alice', name: 'Alice', letters: '' },
      B: { uid: 'bruno', name: 'Bruno', letters: 'S' }
    },
    current: {
      by: 'A'
    },
    history: []
  };

  beforeEach(() => {
    useGameStore.setState({
      game: undefined,
      gameId: undefined,
      code: undefined,
      role: undefined,
      guards: derivePhaseGuards(undefined, undefined),
      loading: false,
      error: undefined
    });
  });

  it('clears the active game on leaveGame', () => {
    useGameStore.setState({
      game: baseGame,
      gameId: 'abc123',
      code: 'ROOM1',
      role: 'A',
      guards: derivePhaseGuards(baseGame, 'A')
    });

    useGameStore.getState().actions.leaveGame();

    const state = useGameStore.getState();
    expect(state.game).toBeUndefined();
    expect(state.gameId).toBeUndefined();
    expect(state.role).toBeUndefined();
    expect(state.guards).toEqual(derivePhaseGuards(undefined, undefined));
  });

  it('updates guards when role changes', () => {
    useGameStore.setState({
      game: baseGame,
      gameId: 'abc123',
      code: 'ROOM1',
      role: 'A',
      guards: derivePhaseGuards(baseGame, 'A')
    });

    useGameStore.setState({
      role: 'B',
      guards: derivePhaseGuards(baseGame, 'B')
    });

    const state = useGameStore.getState();
    expect(state.role).toBe('B');
    expect(state.guards.isJudge).toBe(true);
    expect(state.guards.canApprove).toBe(false);
    expect(state.guards.canRecord).toBe(false);
  });
});
