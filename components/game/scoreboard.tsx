'use client';

import type { GameDocument, PlayerSlot } from '../../src/store/game';
import { cn } from '../../src/utils/cn';

interface ScoreboardProps {
  game: GameDocument;
  role?: PlayerSlot;
}

const renderLetters = (letters?: string) => {
  const sequence = ['S', 'K', '8'];
  return sequence.map((letter, index) => {
    const isEarned = letters ? letters.length > index : false;
    return (
      <span
        key={letter}
        className={cn(
          'flex h-10 w-10 items-center justify-center rounded-full border text-lg font-bold transition',
          isEarned
            ? 'border-hubba-orange bg-hubba-orange/20 text-hubba-orange'
            : 'border-white/20 text-white/50'
        )}
      >
        {letter}
      </span>
    );
  });
};

export const Scoreboard = ({ game, role }: ScoreboardProps) => {
  return (
    <section className="grid grid-cols-1 gap-4 md:grid-cols-2">
      {(['A', 'B'] as PlayerSlot[]).map((slot) => {
        const player = game.players[slot];
        const isActive = game.turn === slot;
        const isYou = role === slot;
        return (
          <article
            key={slot}
            className={cn(
              'flex flex-col gap-4 rounded-3xl border border-white/10 bg-black/40 p-6 shadow-lg backdrop-blur transition',
              isActive && 'ring-2 ring-hubba-green/60',
              isYou && 'border-hubba-green/60'
            )}
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-white/60">{slot === 'A' ? 'Setter' : 'Responder'}</p>
                <h3 className="text-2xl font-bold text-white">{player?.name ?? 'Waiting…'}</h3>
              </div>
              {isYou ? <span className="rounded-full bg-hubba-green/20 px-3 py-1 text-xs text-hubba-green">You</span> : null}
            </div>
            <div className="flex gap-3">{renderLetters(player?.letters)}</div>
          </article>
        );
      })}
    </section>
  );
};
