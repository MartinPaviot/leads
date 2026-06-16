/**
 * Explainable importance / priority score (INBOX-T04). Pure + unit-tested.
 *
 * Importance = revenue relevance: reply intent, open-deal stage, urgency,
 * sentiment, sender seniority, recency — each an explainable, cited factor, NOT
 * an opaque ML number. Automated/bulk senders are pinned to the bottom. Callers
 * pass only FRESH signals (freshness gating happens upstream via
 * lib/signals/freshness.ts), so a stale signal simply isn't supplied and never
 * contributes. Reuses the coarse 1–4 tier the inbox already sorts on.
 */

export interface ImportanceInput {
  /** Reply intent/label (meeting_request, pricing_inquiry, thank_you, …). */
  intentLabel?: string | null;
  hasOpenDeal?: boolean;
  /** 0 = early, higher = later stage (proposal/negotiation worth more). */
  dealStageRank?: number;
  urgencyLevel?: "none" | "low" | "medium" | "high" | null;
  sentimentTrend?: "improving" | "declining" | "stable" | null;
  /** Sender is exec/lead seniority. */
  senioritySenior?: boolean;
  /** Bulk/automated sender → never high importance. */
  isAutomated?: boolean;
  /** Age of the latest message, hours. */
  ageHours?: number;
}

export interface ImportanceFactor {
  label: string;
  weight: number;
}

export interface ImportanceResult {
  score: number; // 0..100
  tier: 1 | 2 | 3 | 4; // coarse bucket, 1 = hottest
  factors: ImportanceFactor[];
}

const INTENT_BASE: Record<string, number> = {
  meeting_request: 42, demo_request: 42, calendar_scheduling: 40, interested: 36,
  pricing_inquiry: 28, budget_mention: 28, question: 24, timeline_mention: 24, referral: 26,
  objection: 20, objection_price: 20, not_interested: 8, thank_you: 6, introduction: 14,
};

function tierFor(score: number): 1 | 2 | 3 | 4 {
  if (score >= 60) return 1;
  if (score >= 35) return 2;
  if (score >= 15) return 3;
  return 4;
}

export function scoreImportance(i: ImportanceInput): ImportanceResult {
  if (i.isAutomated) {
    return { score: 0, tier: 4, factors: [{ label: "automated sender", weight: 0 }] };
  }

  const factors: ImportanceFactor[] = [];
  const add = (label: string, weight: number) => {
    if (weight !== 0) factors.push({ label, weight });
  };

  const intent = i.intentLabel ? INTENT_BASE[i.intentLabel] ?? 5 : 5;
  add(i.intentLabel ? `intent: ${i.intentLabel}` : "no classified intent", intent);

  if (i.hasOpenDeal) {
    add("open deal", 18);
    const stage = Math.max(0, i.dealStageRank ?? 0) * 5;
    add(stage > 0 ? "advanced deal stage" : "early deal stage", stage);
  }
  if (i.urgencyLevel === "high") add("high urgency", 18);
  else if (i.urgencyLevel === "medium") add("medium urgency", 9);
  else if (i.urgencyLevel === "low") add("low urgency", 3);

  if (i.sentimentTrend === "declining") add("sentiment declining", 8);
  if (i.senioritySenior) add("senior sender", 10);

  if (i.ageHours != null) {
    const recency = Math.max(0, Math.round(8 - (i.ageHours / 24) * 2));
    add(recency > 0 ? "recent" : "ageing", recency);
  }

  const raw = factors.reduce((s, f) => s + f.weight, 0);
  const score = Math.max(0, Math.min(100, raw));
  return { score, tier: tierFor(score), factors };
}
