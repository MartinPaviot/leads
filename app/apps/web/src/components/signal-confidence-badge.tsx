"use client";

import { Check, AlertCircle, Circle, Slash } from "lucide-react";
import {
  classifySignalConfidence,
  isVisibleInDefaultView,
  SIGNAL_STATE_COLORS,
  type SignalConfidenceState,
} from "@/lib/signals/confidence-state";
import type { UrlVerificationOutcome } from "@/lib/signals/url-verifier";

/**
 * MONACO-PARITY-01 — visual badge for the 4-state signal confidence.
 *
 * Render anywhere a signal surfaces (TAM list, account detail, deal
 * card, hot-visitors widget). The badge is small (10px text) so it
 * sits inline with the signal title without overpowering it.
 *
 * The classifier is in `lib/signals/confidence-state.ts` — this
 * component is a presentational shell over that logic. Pass either
 * a precomputed `state` or the inputs and let the badge classify.
 */
export function SignalConfidenceBadge(props:
  | { state: SignalConfidenceState; size?: "sm" | "md" }
  | {
      urlOutcome: UrlVerificationOutcome | null;
      llmConfidence: number | null | undefined;
      size?: "sm" | "md";
    }
) {
  const state: SignalConfidenceState =
    "state" in props
      ? props.state
      : classifySignalConfidence({
          urlOutcome: props.urlOutcome,
          llmConfidence: props.llmConfidence,
        });
  const size = props.size ?? "sm";
  const palette = SIGNAL_STATE_COLORS[state];

  const Icon =
    state === "verified"
      ? Check
      : state === "likely"
        ? Circle
        : state === "uncertain"
          ? Slash
          : AlertCircle;

  const fontSize = size === "md" ? 11 : 10;
  const iconSize = size === "md" ? 11 : 9;
  const padX = size === "md" ? 8 : 6;
  const padY = size === "md" ? 3 : 2;

  return (
    <span
      title={`Signal confidence: ${palette.label}${state === "unverified" ? " (URL HEAD failed — possible LLM hallucination)" : ""}`}
      className="inline-flex items-center gap-1 rounded-full font-medium"
      style={{
        fontSize: `${fontSize}px`,
        padding: `${padY}px ${padX}px`,
        background: palette.bg,
        color: palette.dot,
        // Subtle border keeps the chip readable on hover backgrounds.
        border: `1px solid ${palette.dot}`,
      }}
    >
      <Icon size={iconSize} aria-hidden />
      {palette.label}
    </span>
  );
}

/**
 * Convenience helper — true when the badge state should be shown by
 * default (verified or likely). UI surfaces use this to filter
 * signals in their default view; an "all signals" toggle disables
 * the filter.
 */
export { isVisibleInDefaultView };
