/**
 * P0-6 — rejection feedback loop: turn the per-sequence dominant rejection
 * reason (written by sequence-draft-rejection-learner into
 * campaignConfig.rejectionInsights) into a counter-instruction prefixed to the
 * generation prompt. Single source of truth for the mapping, imported by both
 * the route (load/guard) and the generator (render). Pure + deterministic.
 */

import type { RejectionCategory } from "./rejection-classifier";

export interface DominantInsight {
  category: RejectionCategory;
  count: number;
}

/** Floor shared with the learner's dominantInsight default — only act on a
 *  reason rejected at least this many times (the keyword classifier is noisy). */
export const REJECTION_INSIGHT_FLOOR = 3;

/**
 * 5 of the 6 RejectionCategory values map to a counter-instruction.
 * "other" is intentionally absent → null → no counter-instruction (we don't
 * steer the model on an un-actionable bucket).
 */
const COUNTER_INSTRUCTIONS: Partial<Record<RejectionCategory, string>> = {
  tone: "tone — soften it, be less direct/aggressive, use a more measured register",
  timing: "timing — rework or drop the time-based justification; do not assume the trigger implies urgency",
  personalization:
    "personalization that was too generic — anchor every email on a concrete, verifiable fact from the dossier, never a placeholder",
  trigger: "a weak trigger signal — do not lean on it; pick another angle or use only a fresh, verified signal",
  content: "content (accuracy / professionalism) — verify every fact, no broken links, keep a professional register",
};

/**
 * Read an untyped campaignConfig.rejectionInsights jsonb blob and extract a
 * valid DominantInsight, or null. Robust to forged / older-shaped blobs
 * (non-numeric count, unknown category, "other"). Applies the floor (R4).
 */
export function extractDominantInsight(campaignConfig: unknown): DominantInsight | null {
  const ri = (campaignConfig as { rejectionInsights?: unknown } | null)
    ?.rejectionInsights as { dominantInsight?: unknown } | undefined;
  const di = ri?.dominantInsight as { category?: unknown; count?: unknown } | null | undefined;
  if (!di || typeof di.count !== "number") return null;
  if (di.count < REJECTION_INSIGHT_FLOOR) return null;
  if (typeof di.category !== "string") return null;
  if (!(di.category in COUNTER_INSTRUCTIONS)) return null; // excludes "other" + unknowns
  return { category: di.category as RejectionCategory, count: di.count };
}

/** Text block to prefix to the generation prompt. "" when no usable insight. */
export function buildRejectionCounterPrompt(insight: DominantInsight | null): string {
  if (!insight) return "";
  const reason = COUNTER_INSTRUCTIONS[insight.category];
  if (!reason) return "";
  return `FOUNDER FEEDBACK — TOP PRIORITY: previous drafts in this sequence were rejected ${insight.count} times for ${reason}. Fix this in EVERY email before anything else.`;
}
