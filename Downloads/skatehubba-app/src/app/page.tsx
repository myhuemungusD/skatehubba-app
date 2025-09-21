import Link from "next/link";

import { HomeActions } from "./_components/home-actions";

export default function HomePage() {
  return (
    <div className="flex flex-1 flex-col">
      <section className="relative isolate overflow-hidden border-b border-white/10 bg-gradient-to-b from-black via-[#0b0b0b] to-transparent py-24">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top,_rgba(255,122,0,0.25),_transparent_55%)]" />
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-12 px-6 text-left">
          <div className="max-w-3xl space-y-6">
            <span className="inline-flex items-center gap-2 self-start rounded-full border border-white/10 bg-white/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-hubba-green">
              Real-time S.K.8
            </span>
            <h1 className="text-4xl font-black leading-tight text-white sm:text-5xl lg:text-6xl">
              One try. One upload. Let the crew judge the clip live.
            </h1>
            <p className="text-lg text-neutral-300">
              SkateHubba runs authentic S.K.8 battles powered by Firebase security rules, resumable video uploads, and instant
              approvals. Create a room, record straight from your phone, and keep letters honest.
            </p>
            <div className="flex flex-wrap items-center gap-4">
              <Link
                href="#join"
                className="rounded-full bg-hubba-orange px-6 py-3 text-base font-semibold text-black shadow-lg shadow-hubba-orange/40 transition hover:scale-[1.01] hover:bg-orange-400 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-hubba-orange/60"
              >
                Jump into a battle
              </Link>
              <Link
                href="/privacy"
                className="rounded-full border border-white/20 px-6 py-3 text-base font-semibold text-white transition hover:border-hubba-green hover:text-hubba-green focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-hubba-green/40"
              >
                Read privacy controls
              </Link>
            </div>
          </div>
          <dl className="grid gap-6 text-sm text-neutral-300 sm:grid-cols-3">
            <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
              <dt className="font-semibold text-white">Integrity-first scoring</dt>
              <dd className="mt-2 text-sm text-neutral-300">
                Functions enforce letters, phases, and judge roles so nobody can sneak a retry.
              </dd>
            </div>
            <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
              <dt className="font-semibold text-white">Touch-first recorder</dt>
              <dd className="mt-2 text-sm text-neutral-300">
                MediaRecorder streams straight to Firebase Storage with resumable uploads.
              </dd>
            </div>
            <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
              <dt className="font-semibold text-white">Realtime judging</dt>
              <dd className="mt-2 text-sm text-neutral-300">
                Firestore listeners update turns and approvals instantly for both players.
              </dd>
            </div>
          </dl>
        </div>
      </section>
      <section id="join" className="bg-[#080808] py-16">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-6">
          <header className="space-y-2">
            <h2 className="text-3xl font-bold text-white">Create or join a room</h2>
            <p className="text-sm text-neutral-400">
              Sign in happens anonymously until you opt-in. Your UID stays consistent for reputation, but no emails are required.
            </p>
          </header>
          <HomeActions />
        </div>
      </section>
    </div>
  );
}
