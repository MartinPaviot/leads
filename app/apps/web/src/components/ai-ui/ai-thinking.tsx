"use client";

import { Loader2, X } from "lucide-react";

/**
 * AI-UI primitive : indicator for in-flight LLM work.
 *
 * Sprint-2 (audit) — every long-running AI call should expose this
 * primitive instead of a vanilla spinner. It provides :
 *   - a visible "AI is reasoning…" affordance (the dot animation
 *     is intentional — feels like cognition, not loading)
 *   - an optional `onCancel` so the founder can interrupt without
 *     waiting for a 60s timeout
 *   - an optional `step` label so multi-step agents (chat, deal
 *     coach, churn-risk batch) name what's happening in plain English
 *
 * The spinner honours `prefers-reduced-motion`: the global
 * `@media (prefers-reduced-motion: reduce)` reset in `globals.css`
 * neutralizes its `animate-spin` for users who request reduced motion.
 */
export interface AIThinkingProps {
  /** Optional textual hint about what the AI is doing right now. */
  step?: string;
  /** Wire to the abort controller of the in-flight request. */
  onCancel?: () => void;
  /** Inline (chip) or block (full-row card). Default block. */
  variant?: "inline" | "block";
}

export function AIThinking({ step, onCancel, variant = "block" }: AIThinkingProps) {
  if (variant === "inline") {
    return (
      <span
        className="inline-flex items-center gap-1.5 text-[12px]"
        style={{ color: "var(--color-text-secondary)" }}
        role="status"
        aria-live="polite"
      >
        <Loader2 size={11} className="animate-spin" aria-hidden />
        <span>{step ?? "AI is reasoning…"}</span>
      </span>
    );
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-center justify-between rounded-lg p-3"
      style={{
        background: "var(--color-bg-hover)",
        border: "1px dashed var(--color-border-default)",
      }}
    >
      <div className="flex items-center gap-2">
        <Loader2 size={13} className="animate-spin" style={{ color: "var(--color-accent, #6366f1)" }} aria-hidden />
        <span className="text-[12px]" style={{ color: "var(--color-text-secondary)" }}>
          {step ?? "AI is reasoning…"}
        </span>
      </div>
      {onCancel && (
        <button
          type="button"
          onClick={onCancel}
          className="flex items-center gap-1 rounded px-2 py-1 text-[11px]"
          style={{
            color: "var(--color-text-tertiary)",
            background: "transparent",
          }}
          aria-label="Cancel AI request"
        >
          <X size={10} />
          Cancel
        </button>
      )}
    </div>
  );
}
