"use client";

import { Info, AlertTriangle } from "lucide-react";

/**
 * AI-UI primitive : "no evidence" fallback state.
 *
 * Sprint-2 (audit) — every coaching answer that lacks transcript
 * grounding MUST render this instead of fabricating prose. The system
 * prompt instructs the LLM to say "no evidence in the transcript",
 * but the UI side enforces : if the AI returns this state, we render
 * the primitive — there is no path where unsupported AI prose lands
 * in front of the founder.
 *
 * Two severity tiers :
 *   - `informational` : "we tried but didn't find anything yet" — a
 *     low-stakes empty state, the founder can re-ask later.
 *   - `warning` : "we found content but it didn't pass our verifier"
 *     — used when retrieved chunks all scored below threshold or
 *     when URL HEAD checks failed on every cited link.
 */
export interface HallucinationFallbackProps {
  /** What the AI was asked to do — for context. */
  question?: string;
  /** Why no answer was produced — visible to the founder. */
  reason?: string;
  /** Suggested next-action the founder can take to fix it. */
  suggestedAction?: string;
  severity?: "informational" | "warning";
}

export function HallucinationFallback({
  question,
  reason,
  suggestedAction,
  severity = "informational",
}: HallucinationFallbackProps) {
  const isWarn = severity === "warning";
  const Icon = isWarn ? AlertTriangle : Info;
  return (
    <div
      role="status"
      className="rounded-lg p-3"
      style={{
        background: isWarn
          ? "rgba(217,119,6,0.08)"
          : "var(--color-bg-hover)",
        border: `1px solid ${isWarn ? "rgba(217,119,6,0.30)" : "var(--color-border-default)"}`,
      }}
    >
      <div className="flex items-start gap-2">
        <Icon
          size={13}
          className="mt-0.5 shrink-0"
          style={{
            color: isWarn
              ? "var(--color-warning, #d97706)"
              : "var(--color-text-tertiary)",
          }}
          aria-hidden
        />
        <div className="space-y-1">
          {question && (
            <p className="text-[11px] italic" style={{ color: "var(--color-text-tertiary)" }}>
              You asked: "{question}"
            </p>
          )}
          <p className="text-[12px] font-medium" style={{ color: "var(--color-text-primary)" }}>
            I don't have evidence in the transcript for this.
          </p>
          {reason && (
            <p className="text-[11px]" style={{ color: "var(--color-text-secondary)" }}>
              {reason}
            </p>
          )}
          {suggestedAction && (
            <p className="text-[11px]" style={{ color: "var(--color-text-secondary)" }}>
              <strong>Try:</strong> {suggestedAction}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
