"use client";

import { useEffect, useState } from "react";
import { ensureAnonSignIn } from "@/lib/auth";

export function Providers({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    ensureAnonSignIn()
      .catch((err) => {
        console.error("Failed to bootstrap auth", err);
        if (!cancelled) {
          setError("We couldn't start Firebase Auth. Please retry.");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setReady(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black text-lg font-semibold tracking-wide">
        <div className="animate-pulse text-center">
          <p className="text-orange-500">Dialing in Firebase…</p>
          <p className="text-sm text-zinc-400">Grant camera + mic access when prompted.</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black px-6 text-center text-lg">
        <div>
          <p className="mb-3 font-bold text-red-400">{error}</p>
          <p className="text-sm text-zinc-400">Reload the app and ensure you have a stable connection.</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
