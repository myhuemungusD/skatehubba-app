"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged, type User } from "firebase/auth";
import {
  collection,
  limit,
  onSnapshot,
  query,
  where,
  type DocumentData,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { getDownloadURL, ref, uploadBytesResumable } from "firebase/storage";
import { auth, db, functions, storage } from "@/lib/firebase/client";
import { useGameStore } from "@/store/useGameStore";
import type { GameDoc, GamePhase, PlayerKey } from "@/types/game";

interface GameClientProps {
  code: string;
}

interface UploadState {
  progress: number | null;
  status: string | null;
  error: string | null;
}

function normalizeGameDoc(snapshot: QueryDocumentSnapshot<DocumentData>): { gameId: string; data: GameDoc } {
  const raw = snapshot.data();
  const players = raw.players ?? {};
  const sanitizePlayer = (key: PlayerKey) => ({
    uid: String(players?.[key]?.uid ?? ""),
    name: String(players?.[key]?.name ?? (key === "A" ? "Player A" : "Player B")),
    letters: String(players?.[key]?.letters ?? ""),
  });

  const history = Array.isArray(raw.history)
    ? raw.history.map((entry: any) => ({
        by: entry?.by === "B" ? "B" : "A",
        setPath: entry?.setPath ?? entry?.setVideoPath ?? entry?.setStoragePath ?? undefined,
        respPath: entry?.respPath ?? entry?.responseVideoPath ?? entry?.respStoragePath ?? undefined,
        result:
          entry?.result === "declined_set" || entry?.result === "approved_set" || entry?.result === "landed"
            ? entry.result
            : "failed",
        ts: entry?.ts ?? null,
      }))
    : [];

  const currentRaw = raw.current ?? {};
  const phaseValue = typeof raw.phase === "string" ? raw.phase : "SET_RECORD";
  const allowedPhases: GamePhase[] = ["SET_RECORD", "SET_JUDGE", "RESP_RECORD", "RESP_JUDGE"];
  const safePhase: GamePhase = allowedPhases.includes(phaseValue as GamePhase)
    ? (phaseValue as GamePhase)
    : "SET_RECORD";

  const data: GameDoc = {
    code: String(raw.code ?? ""),
    turn: raw.turn === "B" ? "B" : "A",
    phase: safePhase,
    winner: raw.winner === "B" ? "B" : raw.winner === "A" ? "A" : undefined,
    players: {
      A: sanitizePlayer("A"),
      B: sanitizePlayer("B"),
    },
    current: currentRaw.by
      ? {
          by: currentRaw.by === "B" ? "B" : "A",
          setVideoPath: currentRaw.setVideoPath ?? currentRaw.setPath ?? undefined,
          responseVideoPath: currentRaw.responseVideoPath ?? currentRaw.respPath ?? undefined,
        }
      : undefined,
    history,
  };

  return { gameId: snapshot.id, data };
}

const phaseCopy: Record<GamePhase, { title: string; description: string }> = {
  SET_RECORD: {
    title: "Set the bar",
    description: "Record your line in one take. The clip uploads automatically when you tap stop.",
  },
  SET_JUDGE: {
    title: "Approve the set",
    description: "Watch the trick and decide if it counts before the response round starts.",
  },
  RESP_RECORD: {
    title: "Match the trick",
    description: "You get one attempt to land the response. Tap stop as soon as you roll away.",
  },
  RESP_JUDGE: {
    title: "Call the make",
    description: "Review the response clip and mark it landed or failed to hand out letters.",
  },
};

const lettersOrder = ["S", "K", "8"] as const;

function LettersTrack({ letters }: { letters: string }) {
  return (
    <div className="flex items-center gap-2 text-lg font-semibold">
      {lettersOrder.map((letter) => {
        const active = letters.toUpperCase().includes(letter);
        return (
          <span
            key={letter}
            className={`grid h-9 w-9 place-items-center rounded-full border text-base ${
              active
                ? "border-hubba-orange bg-hubba-orange/20 text-hubba-orange"
                : "border-zinc-700 bg-zinc-900 text-zinc-600"
            }`}
          >
            {letter}
          </span>
        );
      })}
    </div>
  );
}

function ActionBanner({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6 text-sm text-zinc-300">
      <h2 className="text-2xl font-semibold text-white">{title}</h2>
      <p className="mt-2 leading-relaxed">{description}</p>
    </div>
  );
}

function CurrentClip({
  label,
  storagePath,
  url,
}: {
  label: string;
  storagePath?: string;
  url?: string | null;
}) {
  if (!storagePath) return null;
  return (
    <div className="space-y-3 rounded-2xl border border-zinc-800 bg-black/60 p-4">
      <div className="flex items-center justify-between text-sm text-zinc-400">
        <span className="font-semibold uppercase tracking-[0.2em] text-hubba-green">{label}</span>
        <span className="truncate text-xs text-zinc-500">{storagePath}</span>
      </div>
      {url ? (
        <video controls playsInline className="w-full rounded-xl border border-zinc-800">
          <source src={url} />
        </video>
      ) : (
        <div className="flex h-40 items-center justify-center rounded-xl border border-dashed border-zinc-700 text-sm text-zinc-500">
          Fetching clip…
        </div>
      )}
    </div>
  );
}

function HistoryList({
  history,
  urlMap,
}: {
  history: GameDoc["history"];
  urlMap: Record<string, string>;
}) {
  if (!history?.length) {
    return (
      <div className="rounded-2xl border border-zinc-800 bg-black/60 p-6 text-sm text-zinc-400">
        No battles logged yet. Every approved clip will land here for playback.
      </div>
    );
  }
  return (
    <div className="space-y-4">
      {history
        .slice()
        .reverse()
        .map((entry, index) => (
          <div key={`${entry.ts ?? index}-${index}`} className="space-y-3 rounded-2xl border border-zinc-800 bg-black/50 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.25em] text-zinc-500">Round {history.length - index}</p>
                <p className="text-sm text-zinc-300">
                  Setter: {entry.by} · Result: <span className="font-semibold text-white">{entry.result}</span>
                </p>
              </div>
            </div>
            {entry.setPath && (
              urlMap[entry.setPath] ? (
                <video controls playsInline className="w-full rounded-xl border border-zinc-800">
                  <source src={urlMap[entry.setPath]} />
                </video>
              ) : (
                <div className="flex h-32 items-center justify-center rounded-xl border border-dashed border-zinc-700 text-sm text-zinc-500">
                  Loading set clip…
                </div>
              )
            )}
            {entry.respPath && (
              urlMap[entry.respPath] ? (
                <video controls playsInline className="w-full rounded-xl border border-zinc-800">
                  <source src={urlMap[entry.respPath]} />
                </video>
              ) : (
                <div className="flex h-32 items-center justify-center rounded-xl border border-dashed border-zinc-700 text-sm text-zinc-500">
                  Loading response clip…
                </div>
              )
            )}
          </div>
        ))}
    </div>
  );
}

export default function GameClient({ code }: GameClientProps) {
  const router = useRouter();
  const { game, gameId, loading, error, setError, setLoading, setSnapshot, clear } = useGameStore((state) => state);
  const [user, setUser] = useState<User | null>(() => auth.currentUser);
  const [uploadState, setUploadState] = useState<UploadState>({ progress: null, status: null, error: null });
  const [currentUrls, setCurrentUrls] = useState<{ set?: string; response?: string }>({});
  const [historyUrls, setHistoryUrls] = useState<Record<string, string>>({});
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (next) => setUser(next));
    return () => unsub();
  }, []);

  useEffect(() => {
    setLoading(true);
    const q = query(collection(db, "games"), where("code", "==", code), limit(1));
    const unsub = onSnapshot(
      q,
      (snapshot) => {
        if (snapshot.empty) {
          setError(`No active game with code ${code}`);
          return;
        }
        const normalized = normalizeGameDoc(snapshot.docs[0]);
        setSnapshot(normalized.gameId, normalized.data);
      },
      (err) => {
        console.error(err);
        setError("We lost sync with Firestore. Please refresh.");
      },
    );
    return () => {
      unsub();
      clear();
    };
  }, [code, setSnapshot, setLoading, setError, clear]);

  useEffect(() => {
    const path = game?.current?.setVideoPath;
    if (!path) {
      setCurrentUrls((prev) => ({ ...prev, set: undefined }));
      return;
    }
    let cancelled = false;
    getDownloadURL(ref(storage, path))
      .then((url) => {
        if (!cancelled) {
          setCurrentUrls((prev) => ({ ...prev, set: url }));
        }
      })
      .catch((err) => console.error("Failed to fetch set clip", err));
    return () => {
      cancelled = true;
    };
  }, [game?.current?.setVideoPath]);

  useEffect(() => {
    const path = game?.current?.responseVideoPath;
    if (!path) {
      setCurrentUrls((prev) => ({ ...prev, response: undefined }));
      return;
    }
    let cancelled = false;
    getDownloadURL(ref(storage, path))
      .then((url) => {
        if (!cancelled) {
          setCurrentUrls((prev) => ({ ...prev, response: url }));
        }
      })
      .catch((err) => console.error("Failed to fetch response clip", err));
    return () => {
      cancelled = true;
    };
  }, [game?.current?.responseVideoPath]);

  const historyPaths = useMemo(() => {
    const paths = new Set<string>();
    game?.history?.forEach((entry) => {
      if (entry.setPath) paths.add(entry.setPath);
      if (entry.respPath) paths.add(entry.respPath);
    });
    return Array.from(paths);
  }, [game?.history]);

  useEffect(() => {
    let cancelled = false;
    const missing = historyPaths.filter((path) => !historyUrls[path]);
    if (!missing.length) return;
    missing.forEach((path) => {
      getDownloadURL(ref(storage, path))
        .then((url) => {
          if (!cancelled) {
            setHistoryUrls((prev) => ({ ...prev, [path]: url }));
          }
        })
        .catch((err) => console.error("Failed to fetch history clip", err));
    });
    return () => {
      cancelled = true;
    };
  }, [historyPaths, historyUrls]);

  const playerKey: PlayerKey | null = useMemo(() => {
    if (!user || !game) return null;
    if (game.players.A.uid === user.uid) return "A";
    if (game.players.B.uid === user.uid) return "B";
    return null;
  }, [user, game]);

  const setter = game?.turn ?? "A";
  const responder: PlayerKey = setter === "A" ? "B" : "A";
  const shooter: PlayerKey = game?.phase === "RESP_RECORD" || game?.phase === "RESP_JUDGE" ? responder : setter;
  const canRecord =
    !!game &&
    ((game.phase === "SET_RECORD" && playerKey === setter) ||
      (game.phase === "RESP_RECORD" && playerKey === responder));
  const canJudgeSet = !!game && game.phase === "SET_JUDGE" && playerKey === responder;
  const canJudgeResp = !!game && game.phase === "RESP_JUDGE" && playerKey === setter;
  const canSelfFail =
    !!game &&
    ((game.phase === "SET_RECORD" && playerKey === setter) ||
      (game.phase === "RESP_RECORD" && playerKey === responder));

  const opponentName = playerKey ? game?.players[playerKey === "A" ? "B" : "A"].name : null;

  const handleStartRecording = async () => {
    if (!canRecord || mediaRecorderRef.current) return;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setUploadState({ progress: null, status: null, error: "Camera access is not supported on this device." });
      return;
    }
    try {
      setUploadState({ progress: null, status: "Recording…", error: null });
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
        audio: true,
      });
      streamRef.current = stream;
      const mimeCandidates = [
        "video/webm;codecs=vp9",
        "video/webm;codecs=vp8",
        "video/webm",
        "video/mp4",
      ];
      const mimeType = mimeCandidates.find((candidate) => MediaRecorder.isTypeSupported(candidate)) ?? "video/webm";
      const recorder = new MediaRecorder(stream, { mimeType });
      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType });
        chunksRef.current = [];
        stopStream();
        void uploadClip(blob);
      };
      recorder.start();
      mediaRecorderRef.current = recorder;
    } catch (err: unknown) {
      console.error(err);
      setUploadState({ progress: null, status: null, error: "Unable to access camera. Check permissions and try again." });
      stopStream();
    }
  };

  const stopStream = () => {
    mediaRecorderRef.current = null;
    const stream = streamRef.current;
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  };

  const handleStopRecording = () => {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      setUploadState((prev) => ({ ...prev, status: "Uploading…" }));
      recorder.stop();
    }
  };

  const uploadClip = async (blob: Blob) => {
    if (!gameId || !playerKey || !game) {
      setUploadState({ progress: null, status: null, error: "Missing game context." });
      return;
    }
    const ext = blob.type.includes("mp4") ? "mp4" : "webm";
    const slug = game.phase === "SET_RECORD" ? "set" : "response";
    const fileName = `${slug}-${Date.now()}.${ext}`;
    const storagePath = `games/${gameId}/${playerKey}/${fileName}`;
    const file = new File([blob], fileName, { type: blob.type });
    const storageRef = ref(storage, storagePath);
    const uploadTask = uploadBytesResumable(storageRef, file, { contentType: blob.type });

    setUploadState({ progress: 0, status: "Uploading…", error: null });

    try {
      await new Promise<void>((resolve, reject) => {
        uploadTask.on(
          "state_changed",
          (snapshot) => {
            setUploadState((prev) => ({ ...prev, progress: (snapshot.bytesTransferred / snapshot.totalBytes) * 100 }));
          },
          (err) => {
            reject(err);
          },
          () => resolve(),
        );
      });
    } catch (err) {
      console.error(err);
      setUploadState({ progress: null, status: null, error: "Upload failed. Please try again." });
      return;
    }

    try {
      const functionName = game.phase === "SET_RECORD" ? "submitSetClip" : "submitRespClip";
      const callable = httpsCallable(functions, functionName);
      await callable({ gameId, storagePath });
      setUploadState({ progress: null, status: "Clip sent. Awaiting judgement.", error: null });
    } catch (err: unknown) {
      console.error(err);
      setUploadState({
        progress: null,
        status: null,
        error: err instanceof Error ? err.message : "Failed to notify the server. Retry the action.",
      });
    }
  };

  const handleSelfFail = async () => {
    if (!gameId || !game) return;
    const fn = game.phase === "SET_RECORD" ? "selfFailSet" : "selfFailResp";
    try {
      const callable = httpsCallable(functions, fn);
      await callable({ gameId });
      setUploadState({ progress: null, status: "You marked the attempt as a bail.", error: null });
    } catch (err: unknown) {
      console.error(err);
      setUploadState({
        progress: null,
        status: null,
        error: err instanceof Error ? err.message : "Could not submit self-fail.",
      });
    }
  };

  const handleJudgeSet = async (approve: boolean) => {
    if (!gameId) return;
    try {
      const callable = httpsCallable(functions, "judgeSet");
      await callable({ gameId, approve });
      setUploadState({ progress: null, status: approve ? "Set locked. Time to respond." : "Set declined.", error: null });
    } catch (err: unknown) {
      console.error(err);
      setUploadState({
        progress: null,
        status: null,
        error: err instanceof Error ? err.message : "Failed to submit judgement.",
      });
    }
  };

  const handleJudgeResp = async (approve: boolean) => {
    if (!gameId) return;
    try {
      const callable = httpsCallable(functions, "judgeResp");
      await callable({ gameId, approve });
      setUploadState({
        progress: null,
        status: approve ? "Response landed. No letters awarded." : "Response failed. Letters advancing.",
        error: null,
      });
    } catch (err: unknown) {
      console.error(err);
      setUploadState({
        progress: null,
        status: null,
        error: err instanceof Error ? err.message : "Failed to submit judgement.",
      });
    }
  };

  useEffect(() => () => stopStream(), []);

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-black text-lg text-zinc-300">
        Syncing game state…
      </main>
    );
  }

  if (error) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-black px-6 text-center text-zinc-300">
        <p className="text-lg font-semibold text-red-400">{error}</p>
        <button
          type="button"
          onClick={() => router.push("/")}
          className="rounded-xl bg-hubba-orange px-6 py-3 text-sm font-semibold text-black"
        >
          Back to lobby
        </button>
      </main>
    );
  }

  if (!game) {
    return null;
  }

  if (!playerKey) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-black px-6 text-center text-zinc-200">
        <p className="text-xl font-semibold">This Firebase account is not part of game {code}.</p>
        <button
          type="button"
          onClick={() => router.push("/")}
          className="rounded-xl border border-zinc-700 px-6 py-3 text-sm font-semibold text-white"
        >
          Leave game
        </button>
      </main>
    );
  }

  const phase = game.phase;
  const banner = phaseCopy[phase];
  const isWinner = game.winner && game.winner === playerKey;
  const opponentWon = game.winner && game.winner !== playerKey;

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-10 px-4 pb-24 pt-10 sm:px-6">
      <header className="flex flex-col gap-6 rounded-3xl border border-zinc-800 bg-gradient-to-br from-black/80 via-zinc-900/60 to-black/80 p-6 sm:p-10">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-hubba-green">Lobby {code}</p>
            <h1 className="text-3xl font-black text-white sm:text-4xl">SkateHubba battle</h1>
          </div>
          <div className="text-right text-sm text-zinc-400">
            <p>Turn: <span className="font-semibold text-white">Player {setter}</span></p>
            <p>Phase: <span className="font-semibold text-white">{banner.title}</span></p>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-2xl border border-zinc-800 bg-black/60 p-4">
            <p className="text-sm uppercase tracking-[0.2em] text-zinc-500">You ({playerKey})</p>
            <p className="mt-2 text-2xl font-semibold text-white">{game.players[playerKey].name}</p>
            <LettersTrack letters={game.players[playerKey].letters} />
          </div>
          <div className="rounded-2xl border border-zinc-800 bg-black/60 p-4">
            <p className="text-sm uppercase tracking-[0.2em] text-zinc-500">Opponent ({playerKey === "A" ? "B" : "A"})</p>
            <p className="mt-2 text-2xl font-semibold text-white">{opponentName}</p>
            <LettersTrack letters={game.players[playerKey === "A" ? "B" : "A"].letters} />
          </div>
        </div>
        {banner && <ActionBanner title={banner.title} description={banner.description} />}
        {uploadState.status && (
          <div className="rounded-2xl border border-hubba-green/40 bg-hubba-green/10 p-4 text-sm text-hubba-green">
            {uploadState.status}
          </div>
        )}
        {uploadState.error && (
          <div className="rounded-2xl border border-red-500/60 bg-red-500/10 p-4 text-sm text-red-300">
            {uploadState.error}
          </div>
        )}
      </header>

      {isWinner && (
        <div className="rounded-3xl border border-hubba-green bg-hubba-green/10 p-6 text-center text-lg font-semibold text-hubba-green">
          You locked the win! Share the code if you want a rematch.
        </div>
      )}
      {opponentWon && (
        <div className="rounded-3xl border border-red-500 bg-red-500/10 p-6 text-center text-lg font-semibold text-red-300">
          {opponentName} took the match. Queue another game from the lobby.
        </div>
      )}

      <section className="grid gap-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <div className="space-y-6">
          <div className="rounded-3xl border border-zinc-800 bg-black/60 p-6">
            <h2 className="text-xl font-semibold text-white">Shooter controls</h2>
            <p className="text-sm text-zinc-400">
              {canRecord
                ? "Record with one tap. We auto-stop the camera after you hit stop and upload straight to Firebase."
                : playerKey === shooter
                  ? "Waiting for judgement before the next attempt."
                  : "Opponent is on the board. Hang tight."}
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-4">
              <button
                type="button"
                onClick={handleStartRecording}
                disabled={!canRecord || !!mediaRecorderRef.current}
                className="flex-1 rounded-2xl bg-gradient-to-r from-hubba-orange to-[#ff9500] px-6 py-4 text-lg font-semibold text-black shadow-lg transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
              >
                {mediaRecorderRef.current ? "Recording…" : "Record"}
              </button>
              <button
                type="button"
                onClick={handleStopRecording}
                disabled={!mediaRecorderRef.current}
                className="flex-1 rounded-2xl border border-hubba-green px-6 py-4 text-lg font-semibold text-hubba-green transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
              >
                Stop & Upload
              </button>
            </div>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-zinc-400">
              <button
                type="button"
                onClick={handleSelfFail}
                disabled={!canSelfFail}
                className="rounded-xl border border-red-500 px-4 py-2 font-semibold text-red-300 transition disabled:opacity-40"
              >
                Self-call bail
              </button>
              {uploadState.progress !== null && (
                <span className="font-semibold text-hubba-green">Upload {uploadState.progress.toFixed(0)}%</span>
              )}
            </div>
          </div>

          <div className="rounded-3xl border border-zinc-800 bg-black/60 p-6">
            <h2 className="text-xl font-semibold text-white">Judge controls</h2>
            <p className="text-sm text-zinc-400">
              Only the non-shooter can judge the live clip. Watch the footage and make the call.
            </p>
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => (canJudgeSet ? handleJudgeSet(true) : handleJudgeResp(true))}
                disabled={!canJudgeSet && !canJudgeResp}
                className="rounded-2xl border border-hubba-green bg-hubba-green/20 px-6 py-4 text-lg font-semibold text-hubba-green transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
              >
                {canJudgeSet ? "Approve set" : "Landed"}
              </button>
              <button
                type="button"
                onClick={() => (canJudgeSet ? handleJudgeSet(false) : handleJudgeResp(false))}
                disabled={!canJudgeSet && !canJudgeResp}
                className="rounded-2xl border border-red-500 bg-red-500/10 px-6 py-4 text-lg font-semibold text-red-300 transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
              >
                {canJudgeSet ? "Decline set" : "Failed"}
              </button>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <CurrentClip label="Set clip" storagePath={game.current?.setVideoPath} url={currentUrls.set} />
            <CurrentClip label="Response clip" storagePath={game.current?.responseVideoPath} url={currentUrls.response} />
          </div>
        </div>

        <aside className="space-y-4">
          <div className="rounded-3xl border border-zinc-800 bg-black/60 p-6">
            <h2 className="text-lg font-semibold text-white">Battle history</h2>
            <p className="text-sm text-zinc-500">Replay every approved attempt from this session.</p>
            <div className="mt-4">
              <HistoryList history={game.history} urlMap={historyUrls} />
            </div>
          </div>
        </aside>
      </section>
    </main>
  );
}
