/**
 * C1 inbox-quality-evals — pure metric helpers the eval suites import.
 *
 * No LLM, no DB, no clock: these are the deterministic FLOOR that gates CI
 * without an ANTHROPIC_API_KEY. Each is unit-tested. (Levenshtein and the other
 * graders land here as the remaining C1 surfaces are built; this file currently
 * carries the reply-worthy selectivity metric that locks B1's bar.)
 */

/** One scored selectivity case: the resolver's prediction vs the hand label. */
export interface ReplyWorthyEvalCase {
  predicted: boolean;
  expected: boolean;
}

export interface PrecisionRecall {
  precision: number;
  recall: number;
  /** Confusion-matrix counts (positive class = reply-worthy true). */
  tp: number;
  fp: number;
  fn: number;
  tn: number;
  /** Total cases scored. */
  support: number;
}

/**
 * Precision/recall for the reply-worthy OFFER (positive class = reply-worthy).
 *
 * - precision = TP / (TP + FP): of the threads we OFFER a draft on, how many
 *   genuinely warrant one (guards against drafting on machine/bulk/no-reply mail).
 * - recall    = TP / (TP + FN): of the threads that genuinely warrant a draft,
 *   how many we OFFER on. A false NOT-worthy on real mail is the cardinal sin
 *   (QUALITY-BENCH section 2 trust bias), so recall is the load-bearing bar.
 *
 * An empty denominator scores 1 (vacuously perfect) so a fixture with no
 * positives/negatives never fails by divide-by-zero — the gate test asserts a
 * minimum support so that can't mask a real gap.
 */
export function replyWorthyPR(cases: ReplyWorthyEvalCase[]): PrecisionRecall {
  let tp = 0;
  let fp = 0;
  let fn = 0;
  let tn = 0;
  for (const c of cases) {
    if (c.predicted && c.expected) tp++;
    else if (c.predicted && !c.expected) fp++;
    else if (!c.predicted && c.expected) fn++;
    else tn++;
  }
  const precision = tp + fp === 0 ? 1 : tp / (tp + fp);
  const recall = tp + fn === 0 ? 1 : tp / (tp + fn);
  return { precision, recall, tp, fp, fn, tn, support: cases.length };
}
