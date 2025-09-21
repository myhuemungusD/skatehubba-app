'use client';

export const SkateLogo = () => {
  return (
    <div className="flex items-center gap-3">
      <span className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-hubba-orange via-hubba-green to-hubba-orange text-3xl font-black text-black shadow-2xl">
        SK8
      </span>
      <div className="text-left">
        <p className="text-sm uppercase tracking-[0.4em] text-hubba-green">SkateHubba</p>
        <p className="text-2xl font-bold text-white">Two-Player Battles</p>
      </div>
    </div>
  );
};
