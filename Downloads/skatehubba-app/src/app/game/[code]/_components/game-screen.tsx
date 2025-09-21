"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  collection,
  limit,
  onSnapshot,
  query,
  where,
  DocumentData,
  QueryDocumentSnapshot,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { onAuthStateChanged, User } from "firebase/auth";
import { ref, uploadBytesResumable } from "firebase/storage";

import { auth, db, functions, storage } from "@/lib/firebase";
import { buildChallengeClipPath } from "@/lib/validators";
import VideoPlayer from "@/components/VideoPlayer";

const LETTER_ORDER = ["S", "K", "8"] as const;

type PlayerKey = "A" | "B";

type GamePhase = "SET_RECORD" | "SET_JUDGE" | "RESP_RECORD" | "RESP_JUDGE";

type HistoryResult = "declined_set" | "approved_set" | "landed" | "failed";

interface GamePlayer {
  uid: string;
  name: string;
  letters?: number | string;
}

interface GameHistoryEntry {
  by: PlayerKey;
  setPath?: string;
  respPath?: string;
  result: HistoryResult;
  ts?: { seconds: number; nanoseconds: number } | number;
}

interface GameDocShape {
  code: string;
  turn: PlayerKey;
  phase: GamePhase;
  winner?: PlayerKey;
  players: Record<PlayerKey, GamePlayer>;
  current?: {
    by: PlayerKey;
    setVideoPath?: string;
    responseVideoPath?: string;
  };
  history?: GameHistoryEntry[];
}

interface GameState {
  id: string;
  data: GameDocShape;
}

interface GameScreenProps {
  code: string;
}

export function GameScreen({ code }: GameScreenProps) {
  const [game, setGame] = useState<GameState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(auth.currentUser);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (next) => {
      setUser(next);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const roomCode = code.trim().toUpperCase();
    const q = query(collection(db, "games"), where("code", "==", roomCode), limit(1));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        setLoading(false);
        if (snapshot.empty) {
          setError("No active game matches that code.");
          setGame(null);
          return;
        }
        const docSnap: QueryDocumentSnapshot<DocumentData> = snapshot.docs[0];
        const payload = docSnap.data() as GameDocShape;
        setGame({ id: docSnap.id, data: payload });
        setError(null);
      },
      (err) => {
        console.error(err);
        setError("We couldn't subscribe to that battle. Check your connection and refresh.");
        setLoading(false);
      },
    );

    return () => unsubscribe();
  }, [code]);

  const playerRole: PlayerKey | null = useMemo(() => {
    if (!user || !game) return null;
    if (game.data.players.A?.uid === user.uid) return "A";
    if (game.data.players.B?.uid === user.uid) return "B";
    return null;
  }, [user, game]);

  const shooterRole: PlayerKey | null = game?.data.turn ?? null;
  const isShooter = playerRole && shooterRole === playerRole;
  const isJudge = playerRole && shooterRole && playerRole !== shooterRole;

  const phaseDescription = useMemo(() => getPhaseCopy(game?.data.phase ?? "SET_RECORD"), [game?.data.phase]);

  return (
    <div className="flex flex-1 flex-col gap-8 bg-[#080808] pb-16">
      <section className="border-b border-white/10 bg-gradient-to-b from-black to-transparent py-12">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-sm uppercase tracking-[0.3em] text-hubba-green">Room code</p>
              <p className="text-3xl font-black text-white">{code.toUpperCase()}</p>
            </div>
            {game?.data.phase && (
              <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-4 py-2 text-sm font-semibold text-white">
                <span className="h-2 w-2 rounded-full bg-hubba-orange" aria-hidden />
                {formatPhase(game.data.phase)}
              </span>
            )}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {(["A", "B"] as PlayerKey[]).map((key) => (
              <ScoreCard
                key={key}
                label={key === "A" ? "Setter" : "Responder"}
                player={game?.data.players?.[key]}
                isYou={playerRole === key}
                isTurn={game?.data.turn === key}
              />
            ))}
          </div>
          <div className="rounded-3xl border border-white/10 bg-white/5 p-6 text-sm text-neutral-300">
            <p className="font-semibold text-white">{phaseDescription.title}</p>
            <p className="mt-2 text-neutral-300">{phaseDescription.subtitle}</p>
          </div>
          {game?.data.winner && (
            <div className="rounded-3xl border border-hubba-green/40 bg-hubba-green/10 p-6 text-white">
              <p className="text-lg font-semibold">
                {resolvePlayerName(game.data.players?.[game.data.winner], game.data.winner)} locked it in!
              </p>
              <p className="text-sm text-neutral-200">Reset the room or start a new code from the home screen.</p>
            </div>
          )}
        </div>
      </section>

      <section className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-6">
        {error && (
          <p role="alert" className="rounded-2xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {error}
          </p>
        )}
        {loading && !error && <p className="text-sm text-neutral-400">Loading battle state…</p>}
        {!loading && !error && !game && (
          <p className="text-sm text-neutral-400">That battle code isn't active. Head back home to create a new one.</p>
        )}

        {game && user && (
          <div className="grid gap-8 lg:grid-cols-[1.2fr_1fr]">
            <div className="flex flex-col gap-8">
              <ActiveClipPanel game={game.data} />
              <HistoryPanel history={game.data.history ?? []} />
            </div>
            <div className="flex flex-col gap-6">
              <ActionPanel
                gameId={game.id}
                game={game.data}
                playerRole={playerRole}
                user={user}
                isShooter={Boolean(isShooter)}
                isJudge={Boolean(isJudge)}
              />
            </div>
          </div>
        )}
      </section>

      <section className="mx-auto w-full max-w-6xl px-6">
        <Link
          href="/"
          className="inline-flex items-center gap-2 rounded-full border border-white/20 px-5 py-2 text-sm font-semibold text-white transition hover:border-hubba-green hover:text-hubba-green focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hubba-green"
        >
          ← Back to lobby
        </Link>
      </section>
    </div>
  );
}

function ScoreCard({
  label,
  player,
  isYou,
  isTurn,
}: {
  label: string;
  player?: GamePlayer;
  isYou: boolean;
  isTurn: boolean;
}) {
  const lettersTaken = getLetterCount(player?.letters);
  return (
    <div className="flex flex-col gap-4 rounded-3xl border border-white/10 bg-white/5 p-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-neutral-400">{label}</p>
          <p className="text-lg font-semibold text-white">
            {resolvePlayerName(player, label)} {isYou && <span className="text-xs text-hubba-green">(you)</span>}
          </p>
        </div>
        {isTurn && <span className="rounded-full bg-hubba-orange/20 px-3 py-1 text-xs font-semibold text-hubba-orange">Your turn</span>}
      </div>
      <div className="flex items-center gap-2">
        {LETTER_ORDER.map((letter, index) => (
          <span
            key={letter}
            className={`flex h-10 w-10 items-center justify-center rounded-full border text-base font-semibold transition ${
              lettersTaken > index
                ? "border-hubba-orange bg-hubba-orange/20 text-hubba-orange"
                : "border-white/15 text-neutral-500"
            }`}
            aria-label={`Letter ${letter} ${lettersTaken > index ? "earned" : "available"}`}
          >
            {letter}
          </span>
        ))}
      </div>
    </div>
  );
}

function ActiveClipPanel({ game }: { game: GameDocShape }) {
  const current = game.current;
  if (!current?.setVideoPath && !current?.responseVideoPath) {
    return (
      <div className="rounded-3xl border border-dashed border-white/20 p-8 text-center text-sm text-neutral-400">
        Clips will appear here as soon as the shooter uploads.
      </div>
    );
  }

  return (
    <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
      <h3 className="text-lg font-semibold text-white">Live clips</h3>
      <div className="mt-4 grid gap-6 md:grid-cols-2">
        {current?.setVideoPath && (
          <div>
            <p className="text-sm font-medium text-neutral-300">Set clip</p>
            <VideoPlayer storagePath={current.setVideoPath} />
          </div>
        )}
        {current?.responseVideoPath && (
          <div>
            <p className="text-sm font-medium text-neutral-300">Response clip</p>
            <VideoPlayer storagePath={current.responseVideoPath} />
          </div>
        )}
      </div>
    </div>
  );
}

function HistoryPanel({ history }: { history: GameHistoryEntry[] }) {
  if (!history.length) {
    return (
      <div className="rounded-3xl border border-white/10 bg-white/5 p-6 text-sm text-neutral-300">
        History is empty—your next clip will land here once judged.
      </div>
    );
  }

  return (
    <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
      <h3 className="text-lg font-semibold text-white">Battle timeline</h3>
      <ol className="mt-4 space-y-6">
        {history
          .slice()
          .reverse()
          .map((entry, index) => (
            <li key={`${entry.by}-${index}`} className="rounded-2xl border border-white/10 bg-black/60 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold text-white">
                  {entry.by === "A" ? "Setter" : "Responder"} • {formatHistoryResult(entry.result)}
                </p>
                {typeof entry.ts === "number" ? (
                  <time className="text-xs text-neutral-400">{new Date(entry.ts).toLocaleString()}</time>
                ) : entry.ts ? (
                  <time className="text-xs text-neutral-400">
                    {new Date((entry.ts.seconds ?? 0) * 1000).toLocaleString()}
                  </time>
                ) : null}
              </div>
              <div className="mt-3 grid gap-4 md:grid-cols-2">
                {entry.setPath && (
                  <VideoPlayer storagePath={entry.setPath} />
                )}
                {entry.respPath && (
                  <VideoPlayer storagePath={entry.respPath} />
                )}
              </div>
            </li>
          ))}
      </ol>
    </div>
  );
}

interface ActionPanelProps {
  gameId: string;
  game: GameDocShape;
  playerRole: PlayerKey | null;
  user: User;
  isShooter: boolean;
  isJudge: boolean;
}

function ActionPanel({ gameId, game, playerRole, user, isShooter, isJudge }: ActionPanelProps) {
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    setStatusMessage(null);
    setErrorMessage(null);
  }, [game.phase]);

  if (!playerRole) {
    return (
      <div className="rounded-3xl border border-white/10 bg-white/5 p-6 text-sm text-neutral-300">
        You're viewing as a spectator. Clips update live, but only the registered skaters can record or judge.
      </div>
    );
  }

  const isWinner = game.winner && game.winner === playerRole;
  const disabled = Boolean(game.winner);

  const handleJudge = async (approve: boolean) => {
    try {
      setErrorMessage(null);
      setStatusMessage("Submitting judgment…");
      if (game.phase === "SET_JUDGE") {
        const judgeSet = httpsCallable(functions, "judgeSet");
        await judgeSet({ gameId, approve });
      } else if (game.phase === "RESP_JUDGE") {
        const judgeResp = httpsCallable(functions, "judgeResp");
        await judgeResp({ gameId, approve });
      }
      setStatusMessage("Decision sent. Waiting for Firebase to confirm.");
    } catch (error) {
      console.error(error);
      setErrorMessage("We couldn't send that decision. Refresh and try again.");
    }
  };

  return (
    <div className="space-y-6">
      {errorMessage && (
        <p role="alert" className="rounded-2xl border border-red-500/50 bg-red-500/10 px-4 py-3 text-xs text-red-200">
          {errorMessage}
        </p>
      )}
      {statusMessage && <p className="text-xs text-neutral-400">{statusMessage}</p>}
      {isWinner && (
        <div className="rounded-2xl border border-hubba-green/40 bg-hubba-green/10 p-4 text-sm text-white">
          You won this battle! Grab a celebratory clip and spin up a new code for the next round.
        </div>
      )}
      {isShooter && !disabled && (game.phase === "SET_RECORD" || game.phase === "RESP_RECORD") && (
        <ClipRecorder
          mode={game.phase === "SET_RECORD" ? "SET" : "RESP"}
          gameId={gameId}
          user={user}
          onStatusChange={setStatusMessage}
          onError={setErrorMessage}
        />
      )}
      {isJudge && !disabled && (game.phase === "SET_JUDGE" || game.phase === "RESP_JUDGE") && (
        <JudgePanel
          phase={game.phase}
          onDecision={handleJudge}
          onError={setErrorMessage}
          statusMessage={statusMessage}
        />
      )}
      {!isShooter && !isJudge && !disabled && (
        <div className="rounded-2xl border border-white/10 bg-black/60 p-4 text-sm text-neutral-300">
          Waiting for your opponent. You'll get controls when it's your turn.
        </div>
      )}
      {disabled && !isWinner && (
        <div className="rounded-2xl border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-200">
          Battle finished. Head back to the lobby to challenge again.
        </div>
      )}
    </div>
  );
}

type RecordingMode = "SET" | "RESP";

interface ClipRecorderProps {
  mode: RecordingMode;
  gameId: string;
  user: User;
  onStatusChange: (status: string | null) => void;
  onError: (error: string | null) => void;
}

function ClipRecorder({ mode, gameId, user, onStatusChange, onError }: ClipRecorderProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const previewRef = useRef<HTMLVideoElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  useEffect(() => {
    return () => {
      stopStream(streamRef.current);
    };
  }, []);

  const startRecording = async () => {
    if (isRecording || uploadProgress !== null) return;
    try {
      onError(null);
      if (!navigator?.mediaDevices?.getUserMedia) {
        onError("This device doesn't support in-browser recording. Try a modern mobile browser.");
        return;
      }
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
        audio: true,
      });
      streamRef.current = mediaStream;
      const mimeType = pickMimeType();
      const recorder = new MediaRecorder(mediaStream, { mimeType });
      recorderRef.current = recorder;
      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };
      recorder.onstop = () => {
        void handleUpload(mimeType);
      };
      if (previewRef.current) {
        previewRef.current.srcObject = mediaStream;
        await previewRef.current.play().catch(() => undefined);
      }
      recorder.start();
      setIsRecording(true);
      onStatusChange("Recording… land it first try.");
    } catch (error) {
      console.error(error);
      onError("Camera and microphone permissions are required to record.");
      setIsRecording(false);
      stopStream(streamRef.current);
    }
  };

  const stopRecording = () => {
    if (!recorderRef.current) return;
    if (recorderRef.current.state !== "inactive") {
      recorderRef.current.stop();
    }
    setIsRecording(false);
    onStatusChange("Processing clip…");
    stopStream(streamRef.current);
    if (previewRef.current) {
      previewRef.current.srcObject = null;
    }
  };

  const handleUpload = async (mimeType: string) => {
    const blob = new Blob(chunksRef.current, { type: mimeType || "video/webm" });
    if (!blob.size) {
      onError("Recording failed—try again.");
      onStatusChange(null);
      return;
    }

    try {
      onStatusChange("Uploading to Firebase Storage…");
      setUploadProgress(0);
      const fileName = `${mode === "SET" ? "set" : "resp"}-${Date.now()}.webm`;
      const storagePath = buildChallengeClipPath({ gameId, uid: user.uid, fileName });
      const storageRef = ref(storage, storagePath);
      const task = uploadBytesResumable(storageRef, blob);
      task.on(
        "state_changed",
        (snap) => {
          const pct = (snap.bytesTransferred / snap.totalBytes) * 100;
          setUploadProgress(Math.round(pct));
        },
        (error) => {
          console.error(error);
          setUploadProgress(null);
          onError("Upload failed—check your network and retry.");
          onStatusChange(null);
        },
        async () => {
          try {
            const callableName = mode === "SET" ? "submitSetClip" : "submitRespClip";
            const submit = httpsCallable(functions, callableName);
            await submit({ gameId, storagePath });
            onStatusChange("Clip uploaded. Awaiting judge call.");
          } catch (error) {
            console.error(error);
            onError("We saved the clip but couldn't notify the server. Refresh the page.");
          } finally {
            setUploadProgress(null);
          }
        },
      );
    } catch (error) {
      console.error(error);
      onError("Something interrupted the upload. Try again.");
      onStatusChange(null);
    }
  };

  const handleSelfFail = async () => {
    try {
      onError(null);
      onStatusChange("Submitting self fail…");
      const callableName = mode === "SET" ? "selfFailSet" : "selfFailResp";
      const fn = httpsCallable(functions, callableName);
      await fn({ gameId });
      onStatusChange("Marked failed. Next skater's up.");
    } catch (error) {
      console.error(error);
      onError("Couldn't register the self fail. Try again.");
    }
  };

  return (
    <div className="space-y-4 rounded-3xl border border-white/10 bg-white/5 p-6">
      <header>
        <p className="text-xs uppercase tracking-[0.3em] text-neutral-400">
          {mode === "SET" ? "Set your line" : "Match the line"}
        </p>
        <h3 className="text-lg font-semibold text-white">
          {mode === "SET" ? "Record the challenge" : "Record the response"}
        </h3>
      </header>
      <div className="flex flex-col gap-4">
        <video
          ref={previewRef}
          className="aspect-video w-full rounded-2xl border border-white/10 bg-black/60"
          playsInline
          muted
        />
        <div className="flex flex-wrap gap-3">
          {!isRecording && (
            <button
              type="button"
              onClick={startRecording}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-full bg-hubba-orange px-5 py-3 text-sm font-semibold text-black transition hover:scale-[1.02] hover:bg-orange-400 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-hubba-orange/50 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={uploadProgress !== null}
            >
              Record
            </button>
          )}
          {isRecording && (
            <button
              type="button"
              onClick={stopRecording}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-full bg-red-500 px-5 py-3 text-sm font-semibold text-white transition hover:scale-[1.02] hover:bg-red-400 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-red-400/60"
            >
              Stop
            </button>
          )}
          <button
            type="button"
            onClick={handleSelfFail}
            className="inline-flex items-center justify-center gap-2 rounded-full border border-white/20 px-5 py-3 text-sm font-semibold text-white transition hover:border-red-400 hover:text-red-300 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-red-400/40"
          >
            Self fail
          </button>
        </div>
        {uploadProgress !== null && (
          <div className="flex items-center gap-3 text-xs text-neutral-300">
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full bg-hubba-green"
                style={{ width: `${uploadProgress}%` }}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={uploadProgress}
                role="progressbar"
              />
            </div>
            <span>{uploadProgress}%</span>
          </div>
        )}
      </div>
    </div>
  );
}

function JudgePanel({
  phase,
  onDecision,
  onError,
  statusMessage,
}: {
  phase: GamePhase;
  onDecision: (approve: boolean) => Promise<void>;
  onError: (value: string | null) => void;
  statusMessage: string | null;
}) {
  const handleDecision = async (approve: boolean) => {
    try {
      onError(null);
      await onDecision(approve);
    } catch (error) {
      console.error(error);
      onError("We couldn't send that decision. Try again.");
    }
  };

  return (
    <div className="space-y-4 rounded-3xl border border-white/10 bg-white/5 p-6">
      <header>
        <p className="text-xs uppercase tracking-[0.3em] text-neutral-400">Judge the clip</p>
        <h3 className="text-lg font-semibold text-white">
          {phase === "SET_JUDGE" ? "Approve the set" : "Approve the response"}
        </h3>
      </header>
      <p className="text-sm text-neutral-300">
        Only the non-shooter can judge this clip. Approval advances the battle, decline hands the letter back.
      </p>
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => void handleDecision(true)}
          className="inline-flex flex-1 items-center justify-center gap-2 rounded-full bg-hubba-green px-5 py-3 text-sm font-semibold text-hubba-black transition hover:scale-[1.02] hover:bg-emerald-300 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-hubba-green/40"
        >
          Approve
        </button>
        <button
          type="button"
          onClick={() => void handleDecision(false)}
          className="inline-flex flex-1 items-center justify-center gap-2 rounded-full border border-red-400 px-5 py-3 text-sm font-semibold text-red-200 transition hover:scale-[1.02] hover:border-red-300 hover:text-red-100 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-red-400/40"
        >
          Decline
        </button>
      </div>
      {statusMessage && <p className="text-xs text-neutral-400">{statusMessage}</p>}
    </div>
  );
}

function pickMimeType() {
  if (typeof window === "undefined") return "video/webm";
  const candidates = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm", "video/mp4"];
  for (const type of candidates) {
    if ((window.MediaRecorder as typeof MediaRecorder | undefined)?.isTypeSupported?.(type)) {
      return type;
    }
  }
  return "video/webm";
}

function stopStream(stream: MediaStream | null) {
  stream?.getTracks().forEach((track) => track.stop());
}

function getLetterCount(value: GamePlayer["letters"]): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    return value.replace(/[^sk8]/gi, "").length;
  }
  return 0;
}

function resolvePlayerName(player: GamePlayer | undefined, fallback: string) {
  return player?.name ?? fallback;
}

function formatPhase(phase: GamePhase) {
  switch (phase) {
    case "SET_RECORD":
      return "Setter recording";
    case "SET_JUDGE":
      return "Responder judging";
    case "RESP_RECORD":
      return "Responder recording";
    case "RESP_JUDGE":
      return "Setter judging";
    default:
      return phase;
  }
}

function getPhaseCopy(phase: GamePhase) {
  switch (phase) {
    case "SET_RECORD":
      return {
        title: "Setter: film your line",
        subtitle:
          "You get one shot. As soon as you stop recording we upload to Firebase Storage and lock in the attempt.",
      };
    case "SET_JUDGE":
      return {
        title: "Responder: approve or decline",
        subtitle:
          "Watch the set clip. If it's legit, approve to move the battle forward. Decline if it wasn't landed clean.",
      };
    case "RESP_RECORD":
      return {
        title: "Responder: match the trick",
        subtitle:
          "Roll right away—record your answer in a single take. Upload triggers the setter's judging window.",
      };
    case "RESP_JUDGE":
      return {
        title: "Setter: call the make",
        subtitle:
          "Decide if the response counts. A fail adds the next letter and rotates the turn automatically.",
      };
    default:
      return {
        title: "Live battle",
        subtitle: "Follow the prompts to keep the S.K.8 match moving.",
      };
  }
}

function formatHistoryResult(result: HistoryResult) {
  switch (result) {
    case "declined_set":
      return "Set declined";
    case "approved_set":
      return "Set approved";
    case "landed":
      return "Response landed";
    case "failed":
      return "Response failed";
    default:
      return result;
  }
}
