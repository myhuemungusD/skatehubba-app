'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ref, uploadBytesResumable } from 'firebase/storage';
import { storage } from '../lib/firebase';
import type { GamePhase, PlayerSlot } from '../store/game';

type RecordingStatus = 'idle' | 'recording' | 'uploading' | 'error';

interface UseRecordingOptions {
  gameId?: string;
  phase: GamePhase;
  shooter: PlayerSlot;
  onUploaded: (storagePath: string) => Promise<void>;
  onError?: (error: Error) => void;
}

export const useRecording = ({ gameId, phase, shooter, onUploaded, onError }: UseRecordingOptions) => {
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const [status, setStatus] = useState<RecordingStatus>('idle');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | undefined>();

  const supportedMimeType = useMemo(() => {
    if (typeof window === 'undefined') {
      return undefined;
    }

    const candidates = [
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus',
      'video/webm',
      'video/mp4'
    ];

    for (const candidate of candidates) {
      if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(candidate)) {
        return candidate;
      }
    }

    return undefined;
  }, []);

  const resetStream = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    mediaRecorderRef.current = null;
    chunksRef.current = [];
  };

  useEffect(() => {
    return () => {
      resetStream();
    };
  }, []);

  const startRecording = useCallback(async () => {
    if (!gameId) {
      const err = new Error('Missing game context');
      setError(err.message);
      onError?.(err);
      return;
    }

    if (typeof window === 'undefined' || typeof navigator === 'undefined') {
      const err = new Error('Recording is only available in the browser');
      setError(err.message);
      onError?.(err);
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      const err = new Error('Recording is not supported on this device');
      setError(err.message);
      onError?.(err);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      streamRef.current = stream;
      const options = supportedMimeType ? { mimeType: supportedMimeType } : undefined;
      const recorder = new MediaRecorder(stream, options);
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };
      recorder.onstop = async () => {
        const mimeType = recorder.mimeType || supportedMimeType || 'video/webm';
        const extension = mimeType.includes('mp4') ? 'mp4' : 'webm';
        const blob = new Blob(chunksRef.current, { type: mimeType });
        const fileName = `${Date.now()}-${phase.toLowerCase()}-${shooter}.${extension}`;
        const storagePath = `games/${gameId}/${fileName}`;
        const storageRef = ref(storage, storagePath);
        setStatus('uploading');
        const uploadTask = uploadBytesResumable(storageRef, blob, { contentType: blob.type });
        uploadTask.on(
          'state_changed',
          (snapshot) => {
            const progressValue = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
            setProgress(Math.round(progressValue));
          },
          (err) => {
            setStatus('error');
            setError(err.message);
            onError?.(err);
          },
          async () => {
            try {
              await onUploaded(uploadTask.snapshot.ref.fullPath);
              setStatus('idle');
              setProgress(0);
            } catch (err) {
              const errorObj = err instanceof Error ? err : new Error('Failed to submit clip');
              setStatus('error');
              setError(errorObj.message);
              onError?.(errorObj);
            }
          }
        );
        resetStream();
      };
      recorder.start();
      setStatus('recording');
      setError(undefined);
      setProgress(0);
    } catch (err) {
      const errorObj = err instanceof Error ? err : new Error('Unable to start recording');
      setStatus('error');
      setError(errorObj.message);
      onError?.(errorObj);
    }
  }, [gameId, onError, onUploaded, phase, shooter, supportedMimeType]);

  const stopRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      recorder.stop();
    }
    streamRef.current?.getTracks().forEach((track) => track.stop());
  }, []);

  const cancelRecording = useCallback(() => {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
    resetStream();
    setStatus('idle');
    setProgress(0);
  }, []);

  return {
    status,
    progress,
    error,
    startRecording,
    stopRecording,
    cancelRecording
  };
};
