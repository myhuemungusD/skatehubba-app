'use client';

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { selectGame, selectGuards, selectPhase, selectRole, useGameStore } from '../../../src/store/game';
import { Scoreboard } from '../../../components/game/scoreboard';
import { ControlPanel } from '../../../components/game/control-panel';
import { HistoryList } from '../../../components/game/history-list';
import { Button } from '../../../components/ui/button';

export default function GamePage() {
  const params = useParams<{ code: string }>();
  const router = useRouter();
  const game = useGameStore(selectGame);
  const guards = useGameStore(selectGuards);
  const role = useGameStore(selectRole);
  const phase = useGameStore(selectPhase);
  const { actions, loading, error, gameId } = useGameStore((state) => ({
    actions: state.actions,
    loading: state.loading,
    error: state.error,
    gameId: state.gameId
  }));

  useEffect(() => {
    const code = params?.code?.toString().toUpperCase();
    if (!code) return;
    actions.bootstrap().catch((err) => console.error(err));
    actions.connectGame(code).catch((err) => console.error(err));
  }, [actions, params?.code]);

  if (!game) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4">
        <p className="text-lg text-white/70">Loading game…</p>
        {error ? <p className="text-sm text-red-400">{error}</p> : null}
      </div>
    );
  }

  const handleLeave = () => {
    actions.leaveGame();
    router.replace('/');
  };

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-10 px-6 py-10">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-white/60">Game Code</p>
          <h1 className="text-4xl font-bold text-white">{game.code}</h1>
          <p className="mt-1 text-sm text-white/60">
            Phase: {phase} • Shooter: {game.current.by}
          </p>
        </div>
        <Button variant="outline" onClick={handleLeave} className="w-full sm:w-auto">
          Leave Game
        </Button>
      </header>
      <Scoreboard game={game} role={role} />
      <ControlPanel
        game={game}
        guards={guards}
        gameId={gameId}
        role={role}
        loading={loading}
        actions={actions}
      />
      <section className="rounded-3xl border border-white/10 bg-black/40 p-6 shadow-xl backdrop-blur">
        <h2 className="text-xl font-semibold text-white">History</h2>
        <HistoryList history={game.history} />
      </section>
      {error ? <p className="text-sm text-red-400">{error}</p> : null}
    </div>
  );
}
