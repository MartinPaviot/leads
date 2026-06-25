/**
 * Spec 37 (B1.1) — daily-autopilot prospect selection. PURE: given the candidate
 * rows + a budget + injected exclusion predicates, return the top-`budget` prospects
 * to enroll today. No IO, no clock — so a same-day re-run over the same candidates is
 * byte-identical (R5.1 idempotency rides on this determinism).
 *
 * Ranking is NOT re-implemented here: `priorityScore` is already computed daily
 * (companies.priority_score, signal-score-daily.ts) as signal×fit×accessibility with
 * stale signals dropped. This module only ORDERS by it + applies the cut.
 *
 * Blast radius: lib/autopilot/* only.
 */

export interface ProspectCandidate {
  contactId: string;
  companyId: string;
  /** companies.priority_score — null = unscored (ranked last). */
  priorityScore: number | null;
  /** priority_score_computed_at as epoch ms — tie-break (stalest first). null = stalest. */
  priorityScoreComputedAt: number | null;
  /** Has a usable channel identifier (email/linkedin) for today's channel. */
  reachable: boolean;
}

export interface SelectOptions {
  /** Already in an active sequence — never re-enroll (de-dup + idempotency). */
  isAlreadyEnrolled?: (c: ProspectCandidate) => boolean;
  /** Anti-collision lock held by another active enrollment. */
  isLocked?: (c: ProspectCandidate) => boolean;
  /** Opt-out / suppression (spec 22/35) — excluded at selection too, not just transport. */
  isSuppressed?: (c: ProspectCandidate) => boolean;
}

/**
 * Deterministic order: highest priorityScore first (nulls last), ties broken by the
 * STALEST priority_score_computed_at (oldest = most due), then contactId asc.
 */
export function compareProspects(a: ProspectCandidate, b: ProspectCandidate): number {
  const sa = a.priorityScore;
  const sb = b.priorityScore;
  if (sa == null && sb != null) return 1; // a unscored -> after b
  if (sb == null && sa != null) return -1; // b unscored -> after a
  if (sa != null && sb != null && sa !== sb) return sb - sa; // higher score first
  const ca = a.priorityScoreComputedAt ?? Number.NEGATIVE_INFINITY; // null = stalest -> first
  const cb = b.priorityScoreComputedAt ?? Number.NEGATIVE_INFINITY;
  if (ca !== cb) return ca - cb; // stalest (smallest ts) first
  return a.contactId < b.contactId ? -1 : a.contactId > b.contactId ? 1 : 0;
}

/**
 * Select up to `budget` prospects: drop the unreachable / already-enrolled / locked /
 * suppressed (injected predicates), order by `compareProspects`, take the first
 * `budget`. Budget <= 0 (no capacity / exhausted) selects nothing.
 */
export function selectProspects(
  candidates: ProspectCandidate[],
  budget: number,
  opts: SelectOptions = {},
): ProspectCandidate[] {
  if (!Number.isFinite(budget) || budget <= 0) return [];
  const eligible = candidates.filter(
    (c) =>
      c.reachable &&
      !opts.isAlreadyEnrolled?.(c) &&
      !opts.isLocked?.(c) &&
      !opts.isSuppressed?.(c),
  );
  // Copy before sort — never mutate the caller's array.
  return [...eligible].sort(compareProspects).slice(0, Math.floor(budget));
}
