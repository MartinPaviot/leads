/**
 * Score factors — turn a prospect's scoring artifacts (matched ICP criteria,
 * fresh signals, reachability facts) into the displayed "why this grade":
 * a ranked RationaleFactor list, the one-line rationale, and the confidence.
 *
 * _specs/propensity-scoring A3/A4 surfacing. Pure: it maps criterion field keys
 * to human factor labels and delegates wording to buildRationale + confidence to
 * computeConfidence. Because it only emits factors backed by a REAL matched
 * criterion / signal / reachability fact, it cannot invent a reason.
 */
import { buildRationale, type RationaleFactor } from "./rationale";
import { computeConfidence } from "./confidence";

/** fieldKey → (French factor label, kind). Firmographic identity = "fit";
 *  funding/tech/hiring = "signal" (timing/intent). Unknown keys are skipped. */
const FACTOR_BY_FIELD: Record<string, { label: string; kind: RationaleFactor["kind"] }> = {
  industry: { label: "core sector", kind: "fit" },
  employee_count: { label: "right size band", kind: "fit" },
  geography: { label: "target region", kind: "fit" },
  revenue: { label: "target revenue", kind: "fit" },
  founded_year: { label: "target age", kind: "fit" },
  keywords: { label: "aligned focus", kind: "fit" },
  person_seniorities: { label: "right seniority", kind: "fit" },
  person_titles: { label: "right title", kind: "fit" },
  technologies: { label: "target tech", kind: "signal" },
  latest_funding_stage: { label: "target funding stage", kind: "signal" },
  latest_funding_date: { label: "recent funding", kind: "signal" },
  total_funding: { label: "target funding", kind: "signal" },
  num_open_jobs: { label: "actively hiring", kind: "signal" },
  investor_names: { label: "target investor", kind: "signal" },
};

/** The factor for a matched criterion's field, or null when not labellable. */
export function criterionFactor(fieldKey: string): { label: string; kind: RationaleFactor["kind"] } | null {
  return FACTOR_BY_FIELD[fieldKey] ?? null;
}

export interface AssembleInput {
  grade: string;
  /** fieldKeys of the SOFT criteria that matched (from computeBlendedFit). */
  matchedFieldKeys: string[];
  /** Already-resolved fresh real-time signals (with age in days). */
  freshSignals?: Array<{ label: string; ageDays?: number }>;
  /** Reachability facts, e.g. "reachable", "in your network". */
  reachability?: string[];
  /** Share of scorable criteria evaluable, [0,1] (from computeBlendedFit). */
  coverage: number;
  /** Relevant input dates for freshness (last enriched, role verified, ...). */
  dataDates?: Array<Date | string | null | undefined>;
  /** Max factors in the one-liner (default 4). */
  maxFactors?: number;
}

export interface ScoreExplanation {
  grade: string;
  rationale: string;
  confidence: number;
  factors: RationaleFactor[];
}

export function assembleScoreExplanation(input: AssembleInput): ScoreExplanation {
  const collected: RationaleFactor[] = [];
  for (const s of input.freshSignals ?? []) {
    collected.push({ kind: "signal", label: s.label, ageDays: s.ageDays });
  }
  for (const fk of input.matchedFieldKeys) {
    const f = criterionFactor(fk);
    if (f) collected.push({ kind: f.kind, label: f.label });
  }
  for (const r of input.reachability ?? []) {
    collected.push({ kind: "reach", label: r });
  }

  // Dedup by label (first wins), so a fresh "hiring" signal and a matched
  // num_open_jobs criterion don't both print.
  const seen = new Set<string>();
  const factors = collected.filter((f) => (seen.has(f.label) ? false : (seen.add(f.label), true)));

  const rationale = buildRationale({ grade: input.grade, factors, maxFactors: input.maxFactors ?? 4 });
  const { confidence } = computeConfidence({ coverage: input.coverage, dataDates: input.dataDates });
  return { grade: input.grade, rationale, confidence, factors };
}
