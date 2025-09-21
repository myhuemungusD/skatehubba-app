'use client';

import { useMemo } from 'react';
import { Button } from '../ui/button';
import type { GameDocument, GamePhase, GameStoreState, PlayerSlot } from '../../src/store/game';
import { useRecording } from '../../src/hooks/useRecording';
import { cn } from '../../src/utils/cn';

interface ControlPanelProps {
  game: GameDocument;
  guards: GameStoreState['guards'];
  gameId?: string;
  role?: PlayerSlot;
  loading: boolean;
  actions: GameStoreState['actions'];
}

const phaseCopy: Record<GamePhase, { title: string; subtitle: string }> = {
  SET_RECORD: { title: 'Set the trick', subtitle: 'One attempt. Record and send your clip.' },
  SET_JUDGE: { title: 'Approve the set', subtitle: 'Judge your opponent’s set attempt.' },
  RESP_RECORD: { title: 'Match the trick', subtitle: 'Record your response attempt now.' },
  RESP_JUDGE: { title: 'Judge the response', subtitle: 'Confirm if the trick was landed clean.' }
};

export const ControlPanel = ({ game, guards, gameId, role, loading, actions }: ControlPanelProps) => {
  const shooter = game.current.by;
  const phase = game.phase;
  const isShooter = guards.isShooter;

  const { status, progress, error, startRecording, stopRecording } = useRecording({
    gameId,
    phase,
    shooter,
    onUploaded: async (path) => {
      if (phase === 'SET_RECORD') {
        await actions.submitSetClip(path);
      } else if (phase === 'RESP_RECORD') {
        await actions.submitResponseClip(path);
      }
    },
    onError: (err) => console.error(err)
  });

  const isRecording = status === 'recording';
  const isUploading = status === 'uploading';

  const copy = useMemo(() => phaseCopy[phase], [phase]);

  const handleSelfFail = async () => {
    if (phase === 'SET_RECORD') {
      await actions.selfFailSet();
    } else if (phase === 'RESP_RECORD') {
      await actions.selfFailResponse();
    }
  };

  return (
    <section className="rounded-3xl border border-white/10 bg-gradient-to-br from-black/60 via-black/40 to-black/20 p-6 shadow-xl backdrop-blur">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-white">{copy.title}</h2>
          <p className="text-sm text-white/60">{copy.subtitle}</p>
        </div>
        <span className="rounded-full border border-white/10 px-3 py-1 text-xs uppercase tracking-[0.3em] text-white/70">
          Turn: {game.turn}
        </span>
      </header>
      <div className="mt-6 flex flex-wrap items-center gap-4">
        {guards.canRecord ? (
          <div className="flex flex-col gap-3">
            <Button
              onClick={isRecording ? stopRecording : startRecording}
              disabled={loading || isUploading}
              className={cn(
                'w-48 justify-center bg-red-500 text-black hover:bg-red-400',
                isRecording && 'animate-pulse bg-red-600'
              )}
            >
              {isRecording ? 'Stop Recording' : 'Record Clip'}
            </Button>
            {isShooter ? (
              <Button
                variant="outline"
                onClick={handleSelfFail}
                disabled={loading || isRecording || isUploading}
              >
                Self Fail
              </Button>
            ) : null}
            {isUploading ? (
              <p className="text-xs text-white/60">Uploading… {progress}%</p>
            ) : null}
            {error ? <p className="text-xs text-red-400">{error}</p> : null}
          </div>
        ) : null}
        {guards.canApprove ? (
          <div className="flex flex-col gap-3">
            <div className="flex gap-3">
              <Button
                className="bg-hubba-green text-black hover:bg-hubba-green/90"
                disabled={loading}
                onClick={async () => {
                  if (phase === 'SET_JUDGE') {
                    await actions.judgeSet(true);
                  } else if (phase === 'RESP_JUDGE') {
                    await actions.judgeResponse(true);
                  }
                }}
              >
                Approve
              </Button>
              <Button
                className="bg-hubba-orange text-black hover:bg-hubba-orange/90"
                disabled={loading}
                onClick={async () => {
                  if (phase === 'SET_JUDGE') {
                    await actions.judgeSet(false);
                  } else if (phase === 'RESP_JUDGE') {
                    await actions.judgeResponse(false);
                  }
                }}
              >
                Decline
              </Button>
            </div>
            <p className="text-xs text-white/60">
              Only non-shooters judge. The current shooter is {shooter === 'A' ? game.players.A?.name : game.players.B?.name}.
            </p>
          </div>
        ) : null}
        {!guards.canRecord && !guards.canApprove ? (
          <p className="text-sm text-white/60">
            Waiting for your opponent. Stay ready!
          </p>
        ) : null}
      </div>
      {role && (
        <footer className="mt-6 text-xs text-white/50">
          You are playing as {role}. Shooter: {shooter}. Phase: {phase}.
        </footer>
      )}
    </section>
  );
};
