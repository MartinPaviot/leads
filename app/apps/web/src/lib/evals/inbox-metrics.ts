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

/** One scored noise case (B4): predicted demote vs the hand label. */
export interface NoiseEvalCase {
  predicted: boolean;
  expected: boolean;
}

export interface NoiseMetrics extends PrecisionRecall {
  /** The cardinal sin: of the mail that should be KEPT, the fraction wrongly demoted. */
  falseDemoteRate: number;
  /** Count of mail that should be kept (expected noise = false). */
  keptTotal: number;
}

/**
 * Noise demotion metrics (positive class = noise). The load-bearing bar is
 * falseDemoteRate (a kept thread wrongly demoted = the founder loses real mail);
 * precision guards against demoting too aggressively. Vacuous-1/0 on empty
 * denominators; the gate asserts a minimum support so that can't mask a gap.
 */
export function noiseMetrics(cases: NoiseEvalCase[]): NoiseMetrics {
  let tp = 0;
  let fp = 0;
  let fn = 0;
  let tn = 0;
  for (const c of cases) {
    if (c.predicted && c.expected) tp++;
    else if (c.predicted && !c.expected) fp++; // a false demote (cardinal sin)
    else if (!c.predicted && c.expected) fn++;
    else tn++;
  }
  const keptTotal = fp + tn; // expected-keep cases
  const precision = tp + fp === 0 ? 1 : tp / (tp + fp);
  const recall = tp + fn === 0 ? 1 : tp / (tp + fn);
  const falseDemoteRate = keptTotal === 0 ? 0 : fp / keptTotal;
  return { precision, recall, tp, fp, fn, tn, support: cases.length, falseDemoteRate, keptTotal };
}

/** One scored multi-class case: a predicted label vs the hand label (B3 splits). */
export interface LabelEvalCase {
  predicted: string;
  expected: string;
}

/* ------------------------------------------------------------------ */
/*  C1 draft / refine / summary metrics (pure, no LLM)                 */
/* ------------------------------------------------------------------ */

/** Raw Levenshtein edit distance between two strings. */
export function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur: number[] = [i];
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
    }
    prev = cur;
  }
  return prev[n];
}

/** Normalized edit distance in [0,1]: 0 = identical, 1 = fully different. */
export function editDistance(a: string, b: string): number {
  const max = Math.max(a.length, b.length);
  return max === 0 ? 0 : levenshtein(a, b) / max;
}

/**
 * Normalize for fact matching: lowercase + strip `$` and thousands commas so a
 * fact is counted as preserved whether the model wrote "40000" or "$40,000".
 */
function normalizeFact(s: string): string {
  return (s || "").toLowerCase().replace(/[$,]/g, "");
}

/**
 * Fraction of required facts present in the text (case-insensitive, number-format
 * insensitive). Serves both refine fact-preservation (>= 0.95) and summary
 * required-fact coverage (>= 0.85). Empty fact list scores 1.
 */
export function factCoverage(text: string, facts: string[]): number {
  if (facts.length === 0) return 1;
  const t = normalizeFact(text);
  const kept = facts.filter((f) => t.includes(normalizeFact(f))).length;
  return kept / facts.length;
}

/** Count of forbidden "trap" facts that leaked into the text (summary bar: == 0). */
export function trapFactHits(text: string, trapFacts: string[]): number {
  const t = normalizeFact(text);
  return trapFacts.filter((f) => f && t.includes(normalizeFact(f))).length;
}

/**
 * Monetary amounts asserted in `text`, normalized to their digit core. Catches
 * "$4,800/month", "€1.200", "4800 USD", "12k". Used to detect NOVEL fabrications
 * (a draft inventing a price the model was never given) — which trapFactHits
 * can't, since it only matches a pre-listed set. ≥2 digits so "8 seats" / "a day
 * or two" never register as money.
 */
export function moneyTokens(text: string): string[] {
  const matches =
    (text || "").match(
      /(?:[$€£]\s?\d[\d.,]*\s?k?)|(?:\b\d[\d.,]*\s?(?:k|usd|eur|gbp|chf|dollars?|euros?)\b)/gi,
    ) || [];
  return [...new Set(matches.map((m) => {
    const k = /k\b/i.test(m); // "12k" → 12000
    const digits = m.replace(/[^\d]/g, "");
    return k && digits ? `${digits}000` : digits;
  }).filter((d) => d.length >= 2))];
}

/**
 * Money amounts asserted in the DRAFT whose digits do not appear anywhere in the
 * SOURCE — i.e. a fabricated price/figure (the cardinal sales-draft sin: a founder
 * could send a wrong quote). The 2026-06-20 live finding (a draft inventing
 * "$4,800/month" for an 8-seat ask with no price in the thread) is exactly this.
 * Returns the fabricated digit cores; empty = grounded.
 *
 * The source is ALSO passed through moneyTokens so k-normalization is symmetric:
 * a draft echoing the thread's "$40k" (normalized "40000") must match a source
 * whose raw digits are only "40" — found live 2026-07-02, where a grounded echo
 * false-flagged as fabricating "40000".
 */
export function unsourcedAmounts(draft: string, source: string): string[] {
  const srcDigits = (source || "").replace(/[^\d]/g, "");
  const srcTokens = new Set(moneyTokens(source));
  return moneyTokens(draft).filter((d) => !srcDigits.includes(d) && !srcTokens.has(d));
}

export type RefineInstruction =
  | { kind: "shorter" }
  | { kind: "longer" }
  | { kind: "contains"; value: string }
  | { kind: "excludes"; value: string };

/** Deterministic instruction-adherence check for measurable instruction kinds. */
export function instructionAdherence(input: string, output: string, instruction: RefineInstruction): boolean {
  const o = (output || "").toLowerCase();
  switch (instruction.kind) {
    case "shorter":
      return output.length < input.length;
    case "longer":
      return output.length > input.length;
    case "contains":
      return o.includes((instruction.value || "").toLowerCase());
    case "excludes":
      return !o.includes((instruction.value || "").toLowerCase());
  }
}

/** Fraction of cited indices that are valid (in [0, msgCount)). Empty cites → 1. */
export function summaryCitationAccuracy(citations: number[], msgCount: number): number {
  if (citations.length === 0) return 1;
  const valid = citations.filter((c) => Number.isInteger(c) && c >= 0 && c < msgCount).length;
  return valid / citations.length;
}

/* ------------------------------------------------------------------ */
/*  B5 ask-agent floor metrics (pure, no LLM)                          */
/* ------------------------------------------------------------------ */

/**
 * Retrieval recall: the fraction of cases (with a gold-relevant thread) whose
 * ALL relevant keys appear in the retrieved set. Negatives (no relevant key)
 * are not counted. The load-bearing bar that the right thread is found at all.
 */
export function retrievalRecall(
  cases: Array<{ relevantKeys: string[]; retrievedKeys: string[] }>,
): { recall: number; evaluated: number; hits: number } {
  let hits = 0;
  let evaluated = 0;
  for (const c of cases) {
    if (c.relevantKeys.length === 0) continue;
    evaluated++;
    const got = new Set(c.retrievedKeys);
    if (c.relevantKeys.every((k) => got.has(k))) hits++;
  }
  return { recall: evaluated === 0 ? 1 : hits / evaluated, evaluated, hits };
}

/**
 * Abstention correctness: of the negative cases (answer not in the corpus), the
 * fraction where the agent correctly returned answered=false. The cardinal bar
 * is == 1.0 — a single hallucinated answer on a negative fails the suite.
 */
export function abstentionCorrectness(
  cases: Array<{ expectedAnswered: boolean; predictedAnswered: boolean }>,
): { correctness: number; negatives: number; misses: number } {
  let negatives = 0;
  let correct = 0;
  for (const c of cases) {
    if (c.expectedAnswered) continue;
    negatives++;
    if (c.predictedAnswered === false) correct++;
  }
  return { correctness: negatives === 0 ? 1 : correct / negatives, negatives, misses: negatives - correct };
}

/** True when every citation references a known key with an in-range message index. */
export function citationInRange(
  citations: Array<{ key: string; messageIdx?: number }>,
  corpus: { keys: Set<string>; msgCount: Map<string, number> },
): boolean {
  for (const c of citations) {
    if (!corpus.keys.has(c.key)) return false;
    if (c.messageIdx != null) {
      const n = corpus.msgCount.get(c.key) ?? 0;
      if (!(Number.isInteger(c.messageIdx) && c.messageIdx >= 0 && c.messageIdx < n)) return false;
    }
  }
  return true;
}

/**
 * Grounded-answer rate (LLM tier): of the positive cases, the fraction whose
 * answer contains every required fact AND whose citations are all in-range.
 */
export function groundedAnswerRate(
  cases: Array<{ expectedAnswered: boolean; answer: string; requiredFacts: string[]; citationsValid: boolean }>,
): { rate: number; positives: number } {
  let positives = 0;
  let grounded = 0;
  for (const c of cases) {
    if (!c.expectedAnswered) continue;
    positives++;
    const a = (c.answer || "").toLowerCase();
    const hasFacts = c.requiredFacts.every((f) => a.includes(f.toLowerCase()));
    if (hasFacts && c.citationsValid) grounded++;
  }
  return { rate: positives === 0 ? 1 : grounded / positives, positives };
}

/**
 * One-vs-rest precision/recall for a single `target` label (positive class =
 * predicted === target). Generalizes replyWorthyPR to the multi-class split
 * taxonomy; same confusion-matrix + vacuous-1 semantics.
 */
export function splitPR(cases: LabelEvalCase[], target: string): PrecisionRecall {
  let tp = 0;
  let fp = 0;
  let fn = 0;
  let tn = 0;
  for (const c of cases) {
    const pPos = c.predicted === target;
    const ePos = c.expected === target;
    if (pPos && ePos) tp++;
    else if (pPos && !ePos) fp++;
    else if (!pPos && ePos) fn++;
    else tn++;
  }
  const precision = tp + fp === 0 ? 1 : tp / (tp + fp);
  const recall = tp + fn === 0 ? 1 : tp / (tp + fn);
  return { precision, recall, tp, fp, fn, tn, support: cases.length };
}
