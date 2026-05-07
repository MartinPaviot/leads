"use client";

import { useEffect, useRef, useState } from "react";
import { Undo2, X } from "lucide-react";

/**
 * AI-UI primitive : undo affordance for AI auto-actions.
 *
 * Sprint-2 (audit) — when the agent takes an irreversible action
 * (auto-stage-change, auto-fill, auto-send), it MUST surface this
 * toast so the founder can undo within a 5s window. Without it,
 * autonomy degrades trust on every borderline call.
 *
 * Behaviour :
 *   - Slides in on mount, ticks down a thin progress bar
 *   - On `onUndo`, calls back and self-dismisses
 *   - On timeout, fades out (no-op)
 *
 * Stateless on purpose — caller manages mount/unmount via React key
 * tied to the action id so a new action replaces the previous toast.
 */
export interface UndoToastProps {
  /** Headline shown on the toast — what just happened. */
  message: string;
  /** Async callback to actually reverse the action. */
  onUndo: () => Promise<void> | void;
  /** Total visible window in ms. Default 5000. */
  durationMs?: number;
  /** Fired when the toast self-dismisses without an undo click. */
  onTimeout?: () => void;
}

export function UndoToast({
  message,
  onUndo,
  durationMs = 5000,
  onTimeout,
}: UndoToastProps) {
  const [remaining, setRemaining] = useState(100);
  const [dismissing, setDismissing] = useState(false);
  const startedAt = useRef(Date.now());

  // Smooth countdown via requestAnimationFrame so the bar shrinks
  // continuously rather than in setInterval ticks.
  useEffect(() => {
    let raf = 0;
    function tick() {
      const elapsed = Date.now() - startedAt.current;
      const pct = Math.max(0, 100 - (elapsed / durationMs) * 100);
      setRemaining(pct);
      if (elapsed < durationMs) {
        raf = requestAnimationFrame(tick);
      } else {
        setDismissing(true);
        onTimeout?.();
      }
    }
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [durationMs, onTimeout]);

  if (dismissing) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="rounded-lg p-3 shadow-lg"
      style={{
        background: "var(--color-bg-card)",
        border: "1px solid var(--color-border-default)",
        minWidth: 320,
      }}
    >
      <div className="flex items-start gap-3">
        <div className="flex-1">
          <p className="text-[12px]" style={{ color: "var(--color-text-primary)" }}>
            {message}
          </p>
          <button
            type="button"
            onClick={async () => {
              setDismissing(true);
              await onUndo();
            }}
            className="mt-1 flex items-center gap-1 text-[11px] font-medium"
            style={{ color: "var(--color-accent, #6366f1)" }}
          >
            <Undo2 size={10} />
            Undo
          </button>
        </div>
        <button
          type="button"
          onClick={() => {
            setDismissing(true);
            onTimeout?.();
          }}
          aria-label="Dismiss"
          className="text-[11px]"
          style={{ color: "var(--color-text-tertiary)" }}
        >
          <X size={11} />
        </button>
      </div>
      {/* Countdown bar — visual ticking. */}
      <div
        className="mt-2 h-0.5 w-full overflow-hidden rounded-full"
        style={{ background: "var(--color-bg-hover)" }}
        aria-hidden
      >
        <div
          className="h-full rounded-full"
          style={{
            width: `${remaining}%`,
            background: "var(--color-accent, #6366f1)",
            transition: "width 80ms linear",
          }}
        />
      </div>
    </div>
  );
}
