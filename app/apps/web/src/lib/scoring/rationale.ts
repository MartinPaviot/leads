/**
 * Per-account grade rationale — the one-line "why this grade", evidence-cited.
 *
 * _specs/propensity-scoring, Phase A3. Pure formatter over factors the caller
 * has ALREADY resolved from real data (matched ICP criteria, fresh signals,
 * reachability facts). Because it only formats real factors, it cannot
 * hallucinate a reason — the no-invented-reason guarantee is structural.
 *
 * Order = what makes a prospect STAND OUT: a fresh buying signal first (timing),
 * then specific fit, then reachability (callability), then economic value.
 * Provider-name-free; no emoji.
 */

export type RationaleFactor =
  | { kind: "signal"; label: string; ageDays?: number }
  | { kind: "fit"; label: string }
  | { kind: "reach"; label: string }
  | { kind: "value"; label: string };

const KIND_ORDER: Record<RationaleFactor["kind"], number> = {
  signal: 0,
  fit: 1,
  reach: 2,
  value: 3,
};

function formatFactor(f: RationaleFactor): string {
  if (f.kind === "signal" && typeof f.ageDays === "number") {
    return `${f.label} (${Math.max(0, Math.round(f.ageDays))}d ago)`;
  }
  return f.label;
}

export interface RationaleInput {
  grade: string;
  factors: RationaleFactor[];
  /** Max factors to cite (default 3). */
  maxFactors?: number;
}

export function buildRationale(input: RationaleInput): string {
  const max = input.maxFactors ?? 3;
  const sorted = [...input.factors].sort((a, b) => {
    const k = KIND_ORDER[a.kind] - KIND_ORDER[b.kind];
    if (k !== 0) return k;
    // Fresher signal first; otherwise stable.
    if (a.kind === "signal" && b.kind === "signal") {
      return (a.ageDays ?? Number.POSITIVE_INFINITY) - (b.ageDays ?? Number.POSITIVE_INFINITY);
    }
    return 0;
  });

  const parts = sorted.slice(0, max).map(formatFactor);
  if (parts.length === 0) {
    // Honest fallback: in the ICP, but nothing currently distinguishes it.
    return `${input.grade} · ICP fit, no recent signal`;
  }
  return `${input.grade} · ${parts.join(", ")}`;
}
