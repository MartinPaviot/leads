"use client";

import { useEffect, useState } from "react";

interface ScoreExplain {
  grade: string | null;
  rationale: string;
  confidence: number;
  /** Shadow propensity [0,1] — not the grade yet. */
  propensity?: number | null;
}

/**
 * "Why this grade" — fetches GET /api/contacts/[id]/score-explain and shows
 * the one-line evidence-cited rationale + a confidence dot. Self-contained and
 * non-critical: renders nothing on failure or when the contact isn't scored.
 */
export function ScoreExplainLine({ contactId }: { contactId: string }) {
  const [data, setData] = useState<ScoreExplain | null>(null);

  useEffect(() => {
    let alive = true;
    fetch(`/api/contacts/${contactId}/score-explain`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: ScoreExplain | null) => {
        if (alive && d && d.grade) setData(d);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [contactId]);

  if (!data) return null;

  const conf = Math.round((data.confidence ?? 0) * 100);
  const tone =
    conf >= 66 ? "var(--color-success)" : conf >= 33 ? "var(--color-warning)" : "var(--color-error)";

  return (
    <div
      className="mt-3 rounded-md border p-3 text-xs"
      style={{ borderColor: "var(--color-border-default)" }}
    >
      <div className="mb-1 flex items-center justify-between">
        <span className="font-semibold uppercase tracking-wider text-[var(--color-text-tertiary)]">
          Why this grade
        </span>
        <span
          className="inline-flex items-center gap-1 text-[var(--color-text-tertiary)]"
          title={`Confidence ${conf}% — criteria coverage × data freshness`}
        >
          <span className="inline-block h-2 w-2 rounded-full" style={{ background: tone }} />
          {conf}%
        </span>
      </div>
      <p className="text-[var(--color-text-secondary)]">{data.rationale}</p>
      {typeof data.propensity === "number" && (
        <p className="mt-1 text-[10px] text-[var(--color-text-tertiary)]">
          Propensity {Math.round(data.propensity * 100)}% — shadow, not the grade yet
        </p>
      )}
    </div>
  );
}
