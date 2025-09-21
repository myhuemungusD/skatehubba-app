"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { httpsCallable } from "firebase/functions";
import { functions, auth } from "@/lib/firebase";
import { ensureAnonSignIn } from "@/lib/auth";

interface CreateGameResponse {
  gameId: string;
  code: string;
}

export function HomeActions() {
  const router = useRouter();
  const [displayName, setDisplayName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    ensureAnonSignIn()
      .then((user) => {
        if (user.displayName) {
          setDisplayName(user.displayName);
        }
      })
      .catch((err) => {
        console.error("Failed to boot anonymous session", err);
        setError("Unable to initialise Firebase Auth. Refresh to try again.");
      });
  }, []);

  const handleCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!displayName.trim()) {
      setError("Add your name so your opponent knows who is in the room.");
      return;
    }
    setError(null);
    setIsProcessing(true);

    try {
      const createGame = httpsCallable(functions, "createGame");
      const result = await createGame({ name: displayName.trim() });
      const data = result.data as CreateGameResponse;
      router.push(`/game/${encodeURIComponent(data.code)}`);
    } catch (err) {
      console.error(err);
      setError("We couldn't create that room. Please check your network and try again.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleJoin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!displayName.trim() || !joinCode.trim()) {
      setError("Enter both your name and the invite code to join.");
      return;
    }
    setError(null);
    setIsProcessing(true);

    try {
      const joinGame = httpsCallable(functions, "joinGame");
      const result = await joinGame({ code: joinCode.trim().toUpperCase(), name: displayName.trim() });
      const data = result.data as CreateGameResponse;
      router.push(`/game/${encodeURIComponent(joinCode.trim().toUpperCase())}`);
    } catch (err) {
      console.error(err);
      setError("The code didn't match an active battle. Double-check and try again.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSignOut = async () => {
    await auth.signOut();
    setDisplayName("");
    setJoinCode("");
    setError(null);
    await ensureAnonSignIn().catch((err) => {
      console.error(err);
      setError("Unable to reset your anonymous session. Refresh to continue.");
    });
  };

  return (
    <div className="grid w-full gap-6 lg:grid-cols-2">
      <form
        onSubmit={handleCreate}
        className="flex flex-col gap-4 rounded-3xl border border-white/10 bg-white/5 p-8 shadow-[0_20px_60px_-40px_rgba(0,0,0,0.7)] backdrop-blur"
      >
        <div className="space-y-2">
          <h2 className="text-2xl font-bold text-white">Start a battle</h2>
          <p className="text-sm text-neutral-300">
            We'll generate a six-character code and lock the room to you plus one opponent. Firebase Functions guard
            the letters so nobody can cheat.
          </p>
        </div>
        <label className="flex flex-col gap-2 text-sm font-medium text-neutral-300">
          Skater name
          <input
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            placeholder="Jessie Lightning"
            className="w-full rounded-full border border-white/10 bg-black/60 px-5 py-3 text-base text-white placeholder:text-neutral-500 focus:border-hubba-orange focus:outline-none focus:ring-2 focus:ring-hubba-orange/60"
            required
            aria-required
            autoComplete="off"
          />
        </label>
        <button
          type="submit"
          disabled={isProcessing}
          className="inline-flex items-center justify-center gap-2 rounded-full bg-hubba-orange px-6 py-3 text-base font-semibold text-black transition hover:scale-[1.01] hover:bg-orange-400 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-hubba-orange/60 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isProcessing ? "Creating room…" : "Create room"}
        </button>
      </form>
      <form
        onSubmit={handleJoin}
        className="flex flex-col gap-4 rounded-3xl border border-white/10 bg-white/5 p-8 shadow-[0_20px_60px_-40px_rgba(0,0,0,0.7)] backdrop-blur"
      >
        <div className="space-y-2">
          <h2 className="text-2xl font-bold text-white">Join with a code</h2>
          <p className="text-sm text-neutral-300">
            Paste the code your friend created. We only accept one active opponent at a time to keep the S.K.8 duel
            authentic.
          </p>
        </div>
        <label className="flex flex-col gap-2 text-sm font-medium text-neutral-300">
          Room code
          <input
            value={joinCode}
            onChange={(event) => setJoinCode(event.target.value.toUpperCase())}
            placeholder="ABC123"
            maxLength={8}
            className="w-full rounded-full border border-white/10 bg-black/60 px-5 py-3 text-base uppercase tracking-[0.3em] text-white placeholder:text-neutral-500 focus:border-hubba-green focus:outline-none focus:ring-2 focus:ring-hubba-green/60"
            required
            aria-required
            autoComplete="off"
          />
        </label>
        <button
          type="submit"
          disabled={isProcessing}
          className="inline-flex items-center justify-center gap-2 rounded-full bg-hubba-green px-6 py-3 text-base font-semibold text-hubba-black transition hover:scale-[1.01] hover:bg-emerald-300 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-hubba-green/50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isProcessing ? "Joining…" : "Join room"}
        </button>
        <button
          type="button"
          onClick={handleSignOut}
          className="text-left text-xs font-medium text-neutral-400 underline-offset-4 hover:text-neutral-200 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hubba-green"
        >
          Reset anonymous session
        </button>
      </form>
      {error && (
        <p role="alert" className="lg:col-span-2 rounded-2xl border border-red-500/50 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {error}
        </p>
      )}
    </div>
  );
}
