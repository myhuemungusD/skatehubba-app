"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { httpsCallable } from "firebase/functions";
import { auth, functions } from "@/lib/firebase/client";
import type { HttpsCallableResult } from "firebase/functions";

interface CreateGameResponse {
  gameId: string;
  code: string;
}

export default function HomeClient() {
  const router = useRouter();
  const [displayName, setDisplayName] = useState("");
  const [joinName, setJoinName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [pending, setPending] = useState<"create" | "join" | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const current = auth.currentUser;
    if (current?.displayName) {
      setDisplayName((prev) => prev || current.displayName!);
      setJoinName((prev) => prev || current.displayName!);
    }
  }, []);

  const sanitizedCode = useMemo(() => joinCode.replace(/[^A-Z0-9]/gi, "").toUpperCase(), [joinCode]);

  const handleCreate = async (evt: React.FormEvent<HTMLFormElement>) => {
    evt.preventDefault();
    if (pending) return;
    const name = displayName.trim();
    if (!name) {
      setError("Add a handle so your opponent knows who's setting the trick.");
      return;
    }

    setPending("create");
    setError(null);
    setStatus("Reserving lobby…");

    try {
      const callable = httpsCallable(functions, "createGame");
      const result = (await callable({ name })) as HttpsCallableResult<CreateGameResponse>;
      const data = result.data;
      if (!data?.code) {
        throw new Error("Invalid response from server");
      }
      setStatus("Lobby ready — dropping you in.");
      router.push(`/game/${data.code}`);
    } catch (err: unknown) {
      console.error(err);
      const message =
        err instanceof Error
          ? err.message
          : "We couldn't create a lobby right now. Please retry.";
      setError(message);
      setStatus(null);
    } finally {
      setPending(null);
    }
  };

  const handleJoin = async (evt: React.FormEvent<HTMLFormElement>) => {
    evt.preventDefault();
    if (pending) return;

    const name = joinName.trim();
    if (!name) {
      setError("Enter a handle before joining.");
      return;
    }
    if (sanitizedCode.length < 4) {
      setError("Join code must be at least four characters.");
      return;
    }

    setPending("join");
    setError(null);
    setStatus("Checking lobby…");

    try {
      const callable = httpsCallable(functions, "joinGame");
      const result = (await callable({ code: sanitizedCode, name })) as HttpsCallableResult<CreateGameResponse>;
      const data = result.data;
      if (!data?.code) {
        throw new Error("Invalid response from server");
      }
      setStatus("Found it — rolling in.");
      router.push(`/game/${sanitizedCode}`);
    } catch (err: unknown) {
      console.error(err);
      const message =
        err instanceof Error
          ? err.message
          : "We couldn't join that lobby. Confirm the code and try again.";
      setError(message);
      setStatus(null);
    } finally {
      setPending(null);
    }
  };

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-16 px-6 pb-24 pt-24">
      <section className="grid gap-12 md:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-6">
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-hubba-green">Realtime S.K.8 duels</p>
          <h1 className="text-4xl font-black leading-tight text-white sm:text-5xl md:text-6xl">
            Film your line, send it live, and let your rival call the make.
          </h1>
          <p className="text-lg text-zinc-400 md:text-xl">
            SkateHubba locks every attempt to Firebase so there are no re-dos, no questionable edits, and no lag on the
            judgement. Two skaters enter, one leaves with letters.
          </p>
          <ul className="grid gap-3 text-sm text-zinc-400 sm:grid-cols-2">
            <li className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 shadow-neon">
              🔒 Integrity-first scoring powered by Cloud Functions
            </li>
            <li className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 shadow-neon">
              📲 Touch-ready recorder with resumable Firebase Storage uploads
            </li>
            <li className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 shadow-neon">
              🔁 Automatic turn swaps from S → K → 8
            </li>
            <li className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 shadow-neon">
              🛠️ Built for PWA installs with offline-ready shell
            </li>
          </ul>
        </div>
        <div className="flex flex-col gap-8 rounded-3xl border border-zinc-800 bg-gradient-to-br from-zinc-950/80 via-zinc-900/60 to-zinc-950/80 p-8 shadow-[0_40px_120px_rgba(255,100,0,0.25)]">
          <form className="space-y-4" onSubmit={handleCreate}>
            <div>
              <h2 className="text-xl font-semibold text-white">Create a lobby</h2>
              <p className="text-sm text-zinc-400">Drop your name and we’ll generate a shareable code.</p>
            </div>
            <label className="block text-sm font-medium text-zinc-300">
              Your handle
              <input
                value={displayName}
                onChange={(evt) => setDisplayName(evt.target.value)}
                autoComplete="name"
                placeholder="Jess the Ledge Slayer"
                className="mt-2 w-full rounded-xl border border-zinc-700 bg-black/60 px-4 py-3 text-base text-white outline-none focus:border-hubba-orange focus:ring-2 focus:ring-hubba-orange/70"
              />
            </label>
            <button
              type="submit"
              disabled={pending === "create"}
              className="w-full rounded-xl bg-gradient-to-r from-hubba-orange to-[#ff8a00] px-6 py-3 text-lg font-semibold text-black shadow-lg transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {pending === "create" ? "Creating…" : "Start new battle"}
            </button>
          </form>
          <div className="h-px bg-gradient-to-r from-transparent via-zinc-700 to-transparent" />
          <form className="space-y-4" onSubmit={handleJoin}>
            <div>
              <h2 className="text-xl font-semibold text-white">Join with a code</h2>
              <p className="text-sm text-zinc-400">Enter the lobby code your opponent sent you.</p>
            </div>
            <label className="block text-sm font-medium text-zinc-300">
              Join code
              <input
                value={sanitizedCode}
                onChange={(evt) => setJoinCode(evt.target.value)}
                placeholder="SK8HUB"
                inputMode="text"
                className="mt-2 w-full rounded-xl border border-zinc-700 bg-black/60 px-4 py-3 text-lg tracking-[0.35em] text-white outline-none focus:border-hubba-green focus:ring-2 focus:ring-hubba-green/70"
              />
            </label>
            <label className="block text-sm font-medium text-zinc-300">
              Your handle
              <input
                value={joinName}
                onChange={(evt) => setJoinName(evt.target.value)}
                placeholder="Chris noseblunt"
                className="mt-2 w-full rounded-xl border border-zinc-700 bg-black/60 px-4 py-3 text-base text-white outline-none focus:border-hubba-green focus:ring-2 focus:ring-hubba-green/70"
              />
            </label>
            <button
              type="submit"
              disabled={pending === "join"}
              className="w-full rounded-xl bg-gradient-to-r from-hubba-green to-[#8fffc4] px-6 py-3 text-lg font-semibold text-black shadow-lg transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {pending === "join" ? "Connecting…" : "Join lobby"}
            </button>
          </form>
          {(status || error) && (
            <div className="rounded-xl border border-zinc-700 bg-black/60 p-4 text-sm">
              {status && <p className="font-semibold text-hubba-green">{status}</p>}
              {error && <p className="text-red-400">{error}</p>}
            </div>
          )}
        </div>
      </section>
      <section className="grid gap-4 rounded-3xl border border-zinc-800 bg-zinc-900/50 p-8 md:grid-cols-3">
        <div>
          <h3 className="text-lg font-semibold text-white">Flow</h3>
          <p className="mt-2 text-sm text-zinc-400">
            Setter records once, opponent approves, responder gets one try, setter judges. Missed response = next letter.
          </p>
        </div>
        <div>
          <h3 className="text-lg font-semibold text-white">Integrity</h3>
          <p className="mt-2 text-sm text-zinc-400">
            Firebase Functions arbitrate every transition, blocking retries and recording immutable clip paths.
          </p>
        </div>
        <div>
          <h3 className="text-lg font-semibold text-white">PWA-ready</h3>
          <p className="mt-2 text-sm text-zinc-400">
            Install on mobile for instant launch, offline shell, and buttery camera startup.
          </p>
        </div>
      </section>
    </main>
  );
}
