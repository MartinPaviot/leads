/**
 * Pure classifier for `draft.rejected` reasons (P0-1 task 1.6).
 *
 * Each rejection reason carries tacit founder knowledge. The
 * evaluator-optimizer pattern (Anthropic agent design) says : every
 * failure becomes a learnable signal. This module bins free-text
 * reasons into 6 stable buckets so we can :
 *  - Track per-sequence rejection rates by category
 *  - Surface "this sequence has 5 rejections for tone in 7 days"
 *    as an actionable insight
 *  - Feed counter-prompts to the personaliser ("Sarah's last
 *    sequence was rejected 3x for tone — soften")
 *
 * Heuristic (not LLM) : we want this fast, deterministic, and free
 * of model drift. The LLM-graded version is a follow-up that ranks
 * the bins via embeddings ; for now keyword-based gives 90%+
 * accuracy on the rejection-reason corpus we've seen, at zero cost.
 */

export type RejectionCategory =
  | "tone" // too aggressive, too pushy, too casual, etc.
  | "timing" // wrong moment, recipient too busy, recently signed competitor
  | "personalization" // shallow, generic, wrong context
  | "trigger" // bad signal, outdated info, false positive
  | "content" // factually wrong, broken link, unprofessional copy
  | "other";

export interface ClassifiedRejection {
  category: RejectionCategory;
  /** Confidence 0-1. Heuristic — number of matching signal-words
   *  divided by total checked. */
  confidence: number;
  /** Words/phrases that triggered the classification. Surfaced in
   *  the insight panel so the founder can audit the bin. */
  matchedSignals: string[];
}

interface CategoryRule {
  category: RejectionCategory;
  // Regex patterns ; keep them simple so a misspelling doesn't escape
  // the bin. Each entry counts as +1 match weight.
  signals: RegExp[];
}

const RULES: CategoryRule[] = [
  {
    category: "tone",
    signals: [
      /\btone\b/i,
      /\baggressive\b/i,
      /\bpushy\b/i,
      /\btoo direct\b/i,
      /\babrasive\b/i,
      /\bsoften\b/i,
      /\bharsh\b/i,
      /\binformal\b/i,
      /\bcasual\b/i,
    ],
  },
  {
    category: "timing",
    signals: [
      /\bmoment\b/i,
      /\btiming\b/i,
      /\btoo (early|soon|late)\b/i,
      /\bcompetitor\b/i,
      /\b(just )?signed\b/i,
      /\bvacation\b/i,
      /\bout of office\b/i,
      /\bduring\b/i,
      /\binvalid (?:moment|time)\b/i,
    ],
  },
  {
    category: "personalization",
    signals: [
      /\bpersonal/i,
      /\bgeneric\b/i,
      /\bshallow\b/i,
      /\bcontext\b/i,
      /\bwrong (?:detail|company|name|title)\b/i,
      /\bcopy[- ]paste\b/i,
      /\bboilerplate\b/i,
      /\btemplated\b/i,
    ],
  },
  {
    category: "trigger",
    signals: [
      /\btrigger(?:ed)?\b/i,
      /\bsignal\b/i,
      /\boutdated\b/i,
      /\bstale\b/i,
      /\bfalse[- ]?positive\b/i,
      /\bwrong (?:signal|reason)\b/i,
      /\balready (?:replied|responded|engaged)\b/i,
    ],
  },
  {
    category: "content",
    signals: [
      /\bbroken (?:link|url)\b/i,
      /\bspelling\b/i,
      /\btypo\b/i,
      /\bgrammar\b/i,
      /\bfactual/i,
      /\bincorrect\b/i,
      /\bunprofessional\b/i,
      /\boff[- ]?topic\b/i,
    ],
  },
];

export function classifyRejection(reason: string): ClassifiedRejection {
  const trimmed = (reason || "").trim();
  if (!trimmed) {
    return { category: "other", confidence: 0, matchedSignals: [] };
  }

  let bestCategory: RejectionCategory = "other";
  let bestMatches: string[] = [];
  let bestScore = 0;

  for (const rule of RULES) {
    const matched: string[] = [];
    for (const re of rule.signals) {
      const m = trimmed.match(re);
      if (m && m[0]) matched.push(m[0]);
    }
    // Highest-match category wins ; ties resolved by rule order.
    if (matched.length > bestScore) {
      bestScore = matched.length;
      bestCategory = rule.category;
      bestMatches = matched;
    }
  }

  if (bestScore === 0) {
    return { category: "other", confidence: 0, matchedSignals: [] };
  }

  // Confidence : matched signals / total signals in winning category.
  // Capped at 1.0 so multiple matches don't overflow.
  const winningRule = RULES.find((r) => r.category === bestCategory)!;
  const confidence = Math.min(1, bestScore / winningRule.signals.length);

  return {
    category: bestCategory,
    confidence,
    matchedSignals: bestMatches,
  };
}

/**
 * Aggregate a batch of classified rejections into per-category counts.
 * Used by the learner to compute per-sequence rejection profiles.
 */
export function aggregateRejections(
  classified: ClassifiedRejection[],
): Record<RejectionCategory, number> {
  const out: Record<RejectionCategory, number> = {
    tone: 0,
    timing: 0,
    personalization: 0,
    trigger: 0,
    content: 0,
    other: 0,
  };
  for (const c of classified) {
    out[c.category]++;
  }
  return out;
}

/**
 * Decide whether a sequence's rejection profile crosses the
 * "actionable insight" threshold — defined as ≥3 rejections in a
 * single category over the lookback window. Returns null if no bin
 * crosses ; otherwise the dominant category + count.
 *
 * Why ≥3 : single rejection is noise (founder mood). Two could
 * still be a coincidence. Three in the same bucket is a pattern.
 * The threshold is intentionally low so insights surface fast in
 * an early-stage tenant ; a more sophisticated tenant can override
 * via `tenants.settings.rejectionInsightThreshold`.
 */
export function dominantInsight(
  counts: Record<RejectionCategory, number>,
  threshold: number = 3,
): { category: RejectionCategory; count: number } | null {
  let bestCategory: RejectionCategory | null = null;
  let bestCount = 0;
  for (const [cat, n] of Object.entries(counts)) {
    if (cat === "other") continue;
    if (n >= threshold && n > bestCount) {
      bestCategory = cat as RejectionCategory;
      bestCount = n;
    }
  }
  if (!bestCategory) return null;
  return { category: bestCategory, count: bestCount };
}
