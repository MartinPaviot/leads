"use client";

/**
 * In-browser meeting recorder — the "enregistrer une réunion" entry for
 * in-person meetings (or any call without a Recall bot). Captures mic audio via
 * MediaRecorder (Opus at a low bitrate so a long meeting stays under the 25MB
 * Whisper cap in /api/meetings/upload-transcript), and on stop hands the Blob to
 * the caller as a File — which flows through the EXISTING audio pipeline
 * (Whisper → process-transcript → MEDDPICC + CRM enrichment). No new backend.
 */

import { useCallback, useRef, useState } from "react";
import { Mic, Square, Loader2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

// Stay safely under upload-transcript's 25MB Whisper limit.
const MAX_BYTES = 24 * 1024 * 1024;

type RecState = "idle" | "recording" | "stopping";

export function MeetingRecorder({
  onRecorded,
  disabled,
}: {
  onRecorded: (file: File) => void;
  disabled?: boolean;
}) {
  const [state, setState] = useState<RecState>("idle");
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [oversize, setOversize] = useState(false);

  const mediaRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedAtRef = useRef<number>(0);

  const stopTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };
  const cleanupStream = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };

  const start = useCallback(async () => {
    setError(null);
    setOversize(false);
    if (
      typeof navigator === "undefined" ||
      !navigator.mediaDevices?.getUserMedia ||
      typeof MediaRecorder === "undefined"
    ) {
      setError("Recording isn't supported in this browser.");
      return;
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
    } catch {
      setError("Microphone access was blocked. Allow it in your browser, then try again.");
      return;
    }
    streamRef.current = stream;
    chunksRef.current = [];

    const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ? "audio/webm;codecs=opus"
      : MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : "";
    const rec = mime
      ? new MediaRecorder(stream, { mimeType: mime, audioBitsPerSecond: 24000 })
      : new MediaRecorder(stream);
    mediaRef.current = rec;

    rec.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) {
        chunksRef.current.push(e.data);
        const total = chunksRef.current.reduce((n, b) => n + b.size, 0);
        if (total > MAX_BYTES && rec.state === "recording") {
          setOversize(true);
          rec.stop(); // protect the Whisper cap — send what we have
        }
      }
    };
    rec.onstop = () => {
      stopTimer();
      cleanupStream();
      const blob = new Blob(chunksRef.current, { type: rec.mimeType || "audio/webm" });
      chunksRef.current = [];
      setState("idle");
      setElapsed(0);
      mediaRef.current = null;
      if (blob.size > 0) {
        const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
        onRecorded(new File([blob], `meeting-recording-${stamp}.webm`, { type: blob.type }));
      }
    };

    rec.start(1000); // 1s timeslices so the running size is tracked live
    startedAtRef.current = Date.now();
    setElapsed(0);
    timerRef.current = setInterval(
      () => setElapsed(Math.floor((Date.now() - startedAtRef.current) / 1000)),
      500,
    );
    setState("recording");
  }, [onRecorded]);

  const stop = useCallback(() => {
    if (mediaRef.current && mediaRef.current.state !== "inactive") {
      setState("stopping");
      mediaRef.current.stop();
    }
  }, []);

  const mmss = `${String(Math.floor(elapsed / 60)).padStart(2, "0")}:${String(elapsed % 60).padStart(2, "0")}`;

  return (
    <div
      className="rounded-lg border p-4"
      style={{ borderColor: "var(--color-border-default)", background: "var(--color-bg-card)" }}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[13px] font-medium" style={{ color: "var(--color-text-primary)" }}>
            Record the meeting
          </p>
          <p className="mt-0.5 text-[11px]" style={{ color: "var(--color-text-tertiary)" }}>
            {state === "recording"
              ? "Recording — speak naturally. Stop when you're done; Elevay transcribes and fills the CRM."
              : "In person, or a call without a bot — capture the audio here. Transcription + CRM enrichment run automatically."}
          </p>
        </div>
        {state === "recording" ? (
          <div className="flex shrink-0 items-center gap-3">
            <span
              className="inline-flex items-center gap-1.5 text-[12px] font-medium tabular-nums"
              style={{ color: "var(--color-error)" }}
            >
              <span
                className="inline-block h-2 w-2 animate-pulse rounded-full"
                style={{ background: "var(--color-error)" }}
              />
              {mmss}
            </span>
            <Button size="sm" variant="outline" onClick={stop}>
              <Square className="mr-1 h-3 w-3" /> Stop &amp; transcribe
            </Button>
          </div>
        ) : (
          <Button size="sm" onClick={start} disabled={disabled || state === "stopping"}>
            {state === "stopping" ? (
              <Loader2 className="mr-1 h-3 w-3 animate-spin" />
            ) : (
              <Mic className="mr-1 h-3 w-3" />
            )}
            Record
          </Button>
        )}
      </div>
      {oversize && (
        <p className="mt-2 flex items-center gap-1.5 text-[11px]" style={{ color: "var(--color-warning)" }}>
          <AlertTriangle className="h-3 w-3" /> Reached the size limit — stopped and sending what was captured.
        </p>
      )}
      {error && (
        <p className="mt-2 flex items-center gap-1.5 text-[11px]" style={{ color: "var(--color-error)" }}>
          <AlertTriangle className="h-3 w-3" /> {error}
        </p>
      )}
    </div>
  );
}
