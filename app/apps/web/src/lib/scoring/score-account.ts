/**
 * Deterministic ICP fit scoring + qualification (spec 09). Pure function of
 * (account, icpModel): a [0,100] weighted score with per-criterion contributions,
 * hard exclusion/suppression filters, a qualified/disqualified/needs-review
 * partition, non-operable-criterion flagging (never silent zero), and a tier.
 * The agentic fit check (spec 10) feeds in as a criterion input, not computed here.
 */

export interface ScoringCriterion {
  id: string;
  fieldKey: string;
  operator: string;
  value: unknown;
  /** Contribution to the weighted score. */
  weight: number;
  /** Must match (operable + matched) or the account is disqualified. */
  isRequired?: boolean;
  /** A matching exclusion criterion disqualifies regardless of score. */
  isExclusion?: boolean;
}

export interface TierThresholds {
  A: number;
  B: number;
  C: number;
}

export interface IcpModel {
  criteria: ScoringCriterion[];
  tiers?: TierThresholds;
}

export interface ScoredAccount {
  /** Canonical fields (flat). */
  fields: Record<string, unknown>;
  excludedReason?: string | null;
  suppressed?: boolean;
}

export interface Contribution {
  criterionId: string;
  fieldKey: string;
  weight: number;
  /** A provider supplied data for this field. */
  operable: boolean;
  matched: boolean;
  /** weight when matched, else 0. */
  points: number;
}

export type Qualification = "qualified" | "disqualified" | "needs-review";

export interface ScoreResult {
  score: number; // [0,100]
  contributions: Contribution[];
  qualification: Qualification;
  reason?: string;
  tier: string | null;
}

const DEFAULT_TIERS: TierThresholds = { A: 75, B: 50, C: 25 };

function norm(v: unknown): string {
  return String(v ?? "").trim().toLowerCase();
}

function hasData(v: unknown): boolean {
  if (v === null || v === undefined || v === "") return false;
  if (Array.isArray(v) && v.length === 0) return false;
  return true;
}

/** Evaluate one operator. Mirrors lib/icp/criteria-engine operator semantics. */
export function matchOperator(actual: unknown, operator: string, expected: unknown): boolean {
  switch (operator) {
    case "equals":
    case "eq":
      return norm(actual) === norm(expected);
    case "not_equals":
    case "neq":
      return norm(actual) !== norm(expected);
    case "contains":
      return norm(actual).includes(norm(expected));
    case "not_contains":
      return !norm(actual).includes(norm(expected));
    case "in":
      return Array.isArray(expected) && expected.map(norm).includes(norm(actual));
    case "not_in":
      return !(Array.isArray(expected) && expected.map(norm).includes(norm(actual)));
    case "gt":
      return Number(actual) > Number(expected);
    case "gte":
      return Number(actual) >= Number(expected);
    case "lt":
      return Number(actual) < Number(expected);
    case "lte":
      return Number(actual) <= Number(expected);
    case "exists":
      return hasData(actual);
    default:
      return false;
  }
}

function tierFor(score: number, t: TierThresholds): string {
  if (score >= t.A) return "A";
  if (score >= t.B) return "B";
  if (score >= t.C) return "C";
  return "D";
}

export function scoreAccount(account: ScoredAccount, model: IcpModel): ScoreResult {
  // AC2 — account-level hard filters short-circuit regardless of score.
  if (account.suppressed) return { score: 0, contributions: [], qualification: "disqualified", reason: "suppressed", tier: null };
  if (account.excludedReason) return { score: 0, contributions: [], qualification: "disqualified", reason: `excluded: ${account.excludedReason}`, tier: null };

  const contributions: Contribution[] = [];
  let numerator = 0;
  let denominator = 0;
  let exclusionReason: string | null = null;
  let requiredUnmatched: string | null = null;
  let requiredNonOperable: string | null = null;

  for (const c of model.criteria) {
    const actual = account.fields[c.fieldKey];
    const operable = hasData(actual);

    if (c.isExclusion) {
      // AC2 — a matching exclusion criterion disqualifies.
      if (operable && matchOperator(actual, c.operator, c.value)) exclusionReason = `exclusion: ${c.fieldKey}`;
      continue; // exclusion criteria do not add positive score
    }

    const matched = operable ? matchOperator(actual, c.operator, c.value) : false;
    const points = matched ? c.weight : 0;
    // AC4 — non-operable criteria are flagged (operable:false) and excluded from
    // both numerator and denominator; they are never silently scored 0.
    contributions.push({ criterionId: c.id, fieldKey: c.fieldKey, weight: c.weight, operable, matched, points });
    if (operable) {
      denominator += c.weight;
      if (matched) numerator += c.weight;
    }

    if (c.isRequired) {
      if (!operable) requiredNonOperable = c.fieldKey;
      else if (!matched) requiredUnmatched = c.fieldKey;
    }
  }

  // AC2/AC3 — exclusion or a failed required criterion → disqualified.
  if (exclusionReason) return { score: 0, contributions, qualification: "disqualified", reason: exclusionReason, tier: null };
  if (requiredUnmatched) return { score: 0, contributions, qualification: "disqualified", reason: `missing required: ${requiredUnmatched}`, tier: null };

  const score = denominator > 0 ? Math.round((100 * numerator) / denominator) : 0;

  // AC3 — needs-review when a required criterion can't be evaluated, or there's no operable signal at all.
  if (requiredNonOperable || denominator === 0) {
    return {
      score,
      contributions,
      qualification: "needs-review",
      reason: requiredNonOperable ? `required field unavailable: ${requiredNonOperable}` : "insufficient data",
      tier: null,
    };
  }

  // AC5 — tier from the score.
  return { score, contributions, qualification: "qualified", tier: tierFor(score, model.tiers ?? DEFAULT_TIERS) };
}
