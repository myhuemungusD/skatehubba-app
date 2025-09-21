"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { ref, uploadBytesResumable } from "firebase/storage";

import { db, functions, storage } from "../firebase";
import { buildChallengeClipPath, UploadMetaSchema } from "../lib/validators";

interface Props {
  gameId: string;
  uid: string;
  playerKey: "A" | "B";
}

type ShooterPhase = "SET_RECORD" | "RESP_RECORD";

type RecorderStatus =
  | "idle"
  | "recording"
  | "processing"
  | "uploading"
  | "uploaded"
  | "error";

interface GameState {
  phase?: string;
  current?: {
    by?: "A" | "B";
    setVideoPath?: string | null;
    responseVideoPath?: string | null;
  } | null;
}

const MIME_CANDIDATES = [
  "video/webm;codecs=vp9",
  "video/webm;codecs=vp8",
  "video/webm",
  "video/mp4",
];

function pickSupportedMimeType(): string | undefined {
  if (typeof window === "undefined" || typeof window.MediaRecorder === "undefined") {
    return undefined;
  }

  for (const mimeType of MIME_CANDIDATES) {
    if ((window.MediaRecorder as typeof MediaRecorder).isTypeSupported?.(mimeType)) {
      return mimeType;
    }
  }

  return undefined;
}

export default function VideoUploader({ gameId, uid, playerKey }: Props) {
  const [game, setGame] = useState<GameState | null>(null);
  const [status, setStatus] = useState<RecorderStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [permissionError, setPermissionError] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [locked, setLocked] = useState(false);
  const [supportMessage, setSupportMessage] = useState<string | null>(null);
  const [recordedPreviewUrl, setRecordedPreviewUrl] = useState<string | null>(null);

  const mediaStreamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const livePreviewRef = useRef<HTMLVideoElement | null>(null);

  const setterKey = game?.current?.by;
  const responderKey = useMemo(() => {
    if (!setterKey) return undefined;
    return setterKey === "A" ? "B" : "A";
  }, [setterKey]);

  const shooterPhase: ShooterPhase | null = useMemo(() => {
    if (!game?.phase) return null;
    if (game.phase === "SET_RECORD" && playerKey === setterKey) return "SET_RECORD";
    if (game.phase === "RESP_RECORD" && playerKey === responderKey) return "RESP_RECORD";
    return null;
  }, [game?.phase, playerKey, responderKey, setterKey]);

  const canRecord =
    shooterPhase !== null &&
    !locked &&
    (status === "idle" || status === "error") &&
    !permissionError &&
    !supportMessage;

  const canStop = status === "recording";
  const canSelfFail =
    shooterPhase !== null &&
    !locked &&
    status !== "uploading" &&
    status !== "recording" &&
    status !== "processing";

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!navigator.mediaDevices?.getUserMedia) {
      setSupportMessage("This device does not support in-browser video capture.");
      return;
    }
    if (typeof window.MediaRecorder === "undefined") {
      setSupportMessage("MediaRecorder is not supported on this device. Please update your browser or use a different device.");
    } else if (!pickSupportedMimeType()) {
      setSupportMessage("No supported recording codecs were found on this device.");
    }
  }, []);

  useEffect(() => {
    const gameRef = doc(db, "games", gameId);
    const unsub = onSnapshot(
      gameRef,
      (snapshot) => {
        if (!snapshot.exists()) {
          setGame(null);
          return;
        }
        setGame(snapshot.data() as GameState);
      },
      (err) => {
        console.error(err);
        setError("Failed to load the latest game state.");
      }
    );

    return () => {
      unsub();
    };
  }, [gameId]);

  useEffect(() => {
    if (!shooterPhase) {
      if (status !== "idle") {
        setStatus("idle");
      }
      setLocked(false);
      setUploadProgress(0);
      setRecordedPreviewUrl((prev) => {
        if (prev) {
          URL.revokeObjectURL(prev);
        }
        return null;
      });
    }
  }, [shooterPhase, status]);

  const stopTracks = useCallback(() => {
    const stream = mediaStreamRef.current;
    if (stream) {
      stream.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch (err) {
          console.warn("Failed to stop track", err);
        }
      });
      mediaStreamRef.current = null;
    }
    const video = livePreviewRef.current;
    if (video) {
      video.srcObject = null;
    }
  }, []);

  const resetRecorder = useCallback(() => {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      try {
        recorder.stop();
      } catch (err) {
        console.warn("Recorder stop failed", err);
      }
    }
    recorderRef.current = null;
    chunksRef.current = [];
    stopTracks();
  }, [stopTracks]);

  useEffect(() => {
    return () => {
      resetRecorder();
      if (recordedPreviewUrl) {
        URL.revokeObjectURL(recordedPreviewUrl);
      }
    };
  }, [recordedPreviewUrl, resetRecorder]);

  const handleUpload = useCallback(
    async (blob: Blob, mimeType: string) => {
      if (!shooterPhase) {
        throw new Error("Not in a recording phase");
      }

      setStatus("uploading");
      setError(null);
      setUploadProgress(0);

      const normalizedMimeType = mimeType.split(";")[0] ?? mimeType;
      const extension = normalizedMimeType.includes("mp4")
        ? "mp4"
        : normalizedMimeType.includes("quicktime")
          ? "mov"
          : "webm";
      const baseName = shooterPhase === "SET_RECORD" ? "set" : "resp";
      const fileName = `${baseName}-${Date.now()}.${extension}`;
      const file = new File([blob], fileName, { type: normalizedMimeType });

      UploadMetaSchema.parse({ sizeBytes: file.size, mimeType: normalizedMimeType });

      const path = buildChallengeClipPath({ gameId, uid, fileName });
      const storageRef = ref(storage, path);
      const uploadTask = uploadBytesResumable(storageRef, file, {
        contentType: normalizedMimeType,
      });

      await new Promise<void>((resolve, reject) => {
        uploadTask.on(
          "state_changed",
          (snapshot) => {
            if (snapshot.totalBytes > 0) {
              setUploadProgress((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
            }
          },
          (err) => {
            console.error(err);
            setStatus("error");
            setError("Upload failed. Please check your connection and try again.");
            reject(err);
          },
          async () => {
            try {
              const callableName = shooterPhase === "SET_RECORD" ? "submitSetClip" : "submitRespClip";
              const submitClip = httpsCallable(functions, callableName);
              await submitClip({ gameId, storagePath: uploadTask.snapshot.ref.fullPath });
              setStatus("uploaded");
              setLocked(true);
              resolve();
            } catch (fnErr) {
              console.error(fnErr);
              setStatus("error");
              setError("Could not submit your clip. Please retry when the network stabilises.");
              reject(fnErr);
            }
          }
        );
      });
    },
    [gameId, shooterPhase, uid]
  );

  const handleRecordingStop = useCallback(
    async (mimeType: string) => {
      try {
        setStatus("processing");
        const blob = new Blob(chunksRef.current, { type: mimeType });
        chunksRef.current = [];
        stopTracks();
        if (recordedPreviewUrl) {
          URL.revokeObjectURL(recordedPreviewUrl);
        }
        const previewUrl = URL.createObjectURL(blob);
        setRecordedPreviewUrl(previewUrl);
        await handleUpload(blob, mimeType);
      } catch (err) {
        console.error(err);
        setStatus("error");
        setError("Recording failed. Please refresh and try again.");
      }
    },
    [handleUpload, recordedPreviewUrl, stopTracks]
  );

  const startRecording = useCallback(async () => {
    if (!canRecord) return;
    setError(null);
    setPermissionError(null);

    const mimeType = pickSupportedMimeType();
    if (!mimeType) {
      setSupportMessage(
        "Recording is not supported on this device. Please switch to a modern browser."
      );
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
        audio: true,
      });

      mediaStreamRef.current = stream;
      const liveView = livePreviewRef.current;
      if (liveView) {
        liveView.srcObject = stream;
        void liveView.play().catch(() => undefined);
      }

      const recorder = new MediaRecorder(stream, { mimeType });
      recorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        void handleRecordingStop(mimeType);
      };

      recorder.onerror = (event) => {
        console.error(event.error);
        setStatus("error");
        setError("Recording stopped due to an unexpected error.");
        resetRecorder();
      };

      recorder.start();
      setStatus("recording");
    } catch (err: unknown) {
      console.error(err);
      if (err instanceof DOMException) {
        if (err.name === "NotAllowedError") {
          setPermissionError("Camera or microphone access was denied. Please enable permissions in your browser settings.");
        } else if (err.name === "NotFoundError") {
          setPermissionError("No camera or microphone was found. Please connect a camera before recording.");
        } else {
          setError(err.message);
        }
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Unable to start recording due to an unknown error.");
      }
      resetRecorder();
    }
  }, [canRecord, handleRecordingStop, resetRecorder]);

  const stopRecording = useCallback(() => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state !== "recording") return;
    try {
      recorder.stop();
      setStatus("processing");
    } catch (err) {
      console.error(err);
      setStatus("error");
      setError("Could not stop the recording safely. Please refresh the page.");
    }
  }, []);

  const handleSelfFail = useCallback(async () => {
    if (!canSelfFail || !shooterPhase) return;
    setError(null);
    setLocked(true);
    setStatus("processing");

    try {
      const callableName = shooterPhase === "SET_RECORD" ? "selfFailSet" : "selfFailResp";
      const selfFail = httpsCallable(functions, callableName);
      await selfFail({ gameId });
      setStatus("uploaded");
    } catch (err) {
      console.error(err);
      setStatus("error");
      setError("Could not submit your self-fail. Please retry.");
      setLocked(false);
    }
  }, [canSelfFail, gameId, shooterPhase]);

  const renderStatusMessage = () => {
    if (supportMessage) return supportMessage;
    if (permissionError) return permissionError;
    if (!shooterPhase) return "Waiting for your turn.";
    switch (status) {
      case "idle":
        return "Ready to record. You have one attempt.";
      case "recording":
        return "Recording… tap stop when you land or bail.";
      case "processing":
        return "Processing clip…";
      case "uploading":
        return `Uploading clip… ${uploadProgress.toFixed(0)}%`;
      case "uploaded":
        return "Clip submitted. Awaiting judgement.";
      case "error":
        return error ?? "Something went wrong.";
      default:
        return "";
    }
  };

  return (
    <div className="space-y-4 rounded-2xl bg-neutral-900/80 p-4 text-white shadow-xl">
      <div className="space-y-2">
        <p className="text-sm uppercase tracking-wide text-neutral-400">Shooter Controls</p>
        <p className="text-base font-semibold text-orange-300">{renderStatusMessage()}</p>
        {error && status !== "error" && <p className="text-sm text-red-400">{error}</p>}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <button
          type="button"
          onClick={startRecording}
          disabled={!canRecord}
          className={`flex-1 rounded-full px-6 py-4 text-lg font-bold uppercase transition focus:outline-none focus-visible:ring-2 focus-visible:ring-green-400 ${
            canRecord
              ? "bg-green-500 text-black hover:bg-green-400"
              : "bg-neutral-700 text-neutral-400"
          }`}
          aria-disabled={!canRecord}
        >
          {status === "recording" ? "Recording…" : "Record"}
        </button>
        <button
          type="button"
          onClick={stopRecording}
          disabled={!canStop}
          className={`flex-1 rounded-full px-6 py-4 text-lg font-bold uppercase transition focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400 ${
            canStop ? "bg-red-600 text-white hover:bg-red-500" : "bg-neutral-700 text-neutral-400"
          }`}
          aria-disabled={!canStop}
        >
          Stop
        </button>
        <button
          type="button"
          onClick={handleSelfFail}
          disabled={!canSelfFail}
          className={`flex-1 rounded-full px-6 py-4 text-lg font-bold uppercase transition focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 ${
            canSelfFail
              ? "bg-orange-500 text-black hover:bg-orange-400"
              : "bg-neutral-700 text-neutral-400"
          }`}
          aria-disabled={!canSelfFail}
        >
          Self Fail
        </button>
      </div>

      {status === "uploading" && (
        <div className="w-full overflow-hidden rounded-full bg-neutral-800">
          <div
            className="h-3 rounded-full bg-green-400 transition-all"
            style={{ width: `${uploadProgress}%` }}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={uploadProgress}
            role="progressbar"
          />
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl bg-black/60 p-3">
          <p className="mb-2 text-sm font-semibold text-neutral-300">Live View</p>
          <video
            ref={livePreviewRef}
            className="aspect-video w-full rounded-lg bg-black object-cover"
            playsInline
            muted
            autoPlay
          />
        </div>
        <div className="rounded-xl bg-black/60 p-3">
          <p className="mb-2 text-sm font-semibold text-neutral-300">Last Take</p>
          {recordedPreviewUrl ? (
            <video
              src={recordedPreviewUrl}
              controls
              className="aspect-video w-full rounded-lg bg-black object-contain"
              playsInline
            />
          ) : (
            <div className="flex aspect-video w-full items-center justify-center rounded-lg border border-dashed border-neutral-700 text-neutral-500">
              No clip submitted yet.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
