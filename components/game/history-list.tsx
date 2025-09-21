'use client';

import type { GameHistoryEntry, PlayerSlot } from '../../src/store/game';

interface HistoryListProps {
  history: GameHistoryEntry[];
}

const resultCopy: Record<GameHistoryEntry['result'], string> = {
  declined_set: 'Set Declined',
  approved_set: 'Set Approved',
  landed: 'Response Landed',
  failed: 'Response Failed'
};

const slotCopy: Record<PlayerSlot, string> = {
  A: 'Setter',
  B: 'Responder'
};

export const HistoryList = ({ history }: HistoryListProps) => {
  if (!history.length) {
    return (
      <p className="text-sm text-white/60">Clips you record will appear here with approvals.</p>
    );
  }

  return (
    <ol className="flex flex-col gap-4">
      {history
        .slice()
        .reverse()
        .map((entry, index) => (
          <li
            key={`${entry.ts}-${index}`}
            className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-black/30 p-4 shadow-lg"
          >
            <header className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-white/50">
                  {slotCopy[entry.by]} • {new Date(entry.ts).toLocaleString()}
                </p>
                <p className="text-sm font-semibold text-white">{resultCopy[entry.result]}</p>
              </div>
              <div className="flex gap-2 text-xs text-white/60">
                {entry.setPath ? <span>Set clip saved</span> : null}
                {entry.respPath ? <span>Response clip saved</span> : null}
              </div>
            </header>
            <div className="grid gap-4 sm:grid-cols-2">
              {entry.setPath ? (
                <video
                  controls
                  preload="metadata"
                  className="w-full rounded-xl border border-white/10"
                  src={`https://firebasestorage.googleapis.com/v0/b/${process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET}/o/${encodeURIComponent(entry.setPath)}?alt=media`}
                />
              ) : null}
              {entry.respPath ? (
                <video
                  controls
                  preload="metadata"
                  className="w-full rounded-xl border border-white/10"
                  src={`https://firebasestorage.googleapis.com/v0/b/${process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET}/o/${encodeURIComponent(entry.respPath)}?alt=media`}
                />
              ) : null}
            </div>
          </li>
        ))}
    </ol>
  );
};
