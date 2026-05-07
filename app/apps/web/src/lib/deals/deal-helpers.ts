/**
 * Pure deal helpers — pull derived signals out of the page so they can
 * be tested without a full React tree.
 *
 * `stageProbability` is the calibration most reps in our cohort already
 * use mentally for forecasting (Lead 10% → Won 100%). Surfacing the
 * number explicitly keeps weighted-pipeline math honest and removes a
 * bunch of "what does Demo really mean?" questions in deal reviews.
 *
 * `ageInStage` is a coarse stall detector. The deals table doesn't
 * carry a `stageChangedAt` column today, so the caller passes the best
 * available timestamp (typically `deal.updatedAt`) and we treat it as
 * "approximate days since last activity on this deal". Cheap, useful,
 * and honest about the precision limit.
 */

export type DealStageKey =
  | "lead"
  | "qualification"
  | "demo"
  | "trial"
  | "proposal"
  | "negotiation"
  | "won"
  | "lost";

const STAGE_PROBABILITY: Record<DealStageKey, number> = {
  lead: 10,
  qualification: 25,
  demo: 40,
  trial: 55,
  proposal: 70,
  negotiation: 85,
  won: 100,
  lost: 0,
};

/**
 * Default % chance of close used when we project pipeline. Returns
 * `null` for unknown stage strings so callers can render "—" rather
 * than a misleading 0.
 */
export function stageProbability(stage: string | null | undefined): number | null {
  if (!stage) return null;
  const key = stage.toLowerCase() as DealStageKey;
  if (key in STAGE_PROBABILITY) return STAGE_PROBABILITY[key];
  return null;
}

export type AgeBucket = "fresh" | "watch" | "stalled" | "frozen";

export interface AgeInStage {
  days: number;
  bucket: AgeBucket;
  /** "3d", "9d", "21d" — short form for table cells. */
  short: string;
  /** "3 days", "1 week", "3 weeks" — friendlier for tooltips/banners. */
  long: string;
}

/**
 * Translate a timestamp into days + a colour bucket. Won/Lost deals
 * are intentionally excluded — they're closed, not stalled.
 *
 * Buckets mirror the pipeline-hygiene defaults most CROs run:
 *   - fresh   : < 7  days   (green)
 *   - watch   : 7–14 days   (amber)
 *   - stalled : 14–30 days  (orange)
 *   - frozen  : > 30 days   (red)
 *
 * Returns `null` when the input is missing or the stage is closed,
 * so the column collapses to "—" instead of broadcasting noise.
 */
export function ageInStage(
  lastChangedAt: Date | string | null | undefined,
  stage?: string | null
): AgeInStage | null {
  if (stage && (stage.toLowerCase() === "won" || stage.toLowerCase() === "lost")) {
    return null;
  }
  if (!lastChangedAt) return null;
  const ts =
    lastChangedAt instanceof Date
      ? lastChangedAt.getTime()
      : new Date(lastChangedAt).getTime();
  if (Number.isNaN(ts)) return null;
  const days = Math.max(0, Math.floor((Date.now() - ts) / (24 * 60 * 60 * 1000)));
  const bucket: AgeBucket =
    days < 7 ? "fresh" : days < 14 ? "watch" : days < 30 ? "stalled" : "frozen";
  return {
    days,
    bucket,
    short: `${days}d`,
    long: formatLong(days),
  };
}

function formatLong(days: number): string {
  if (days <= 0) return "today";
  if (days === 1) return "1 day";
  if (days < 7) return `${days} days`;
  if (days < 14) return "1 week";
  if (days < 21) return "2 weeks";
  if (days < 30) return "3 weeks";
  if (days < 60) return "1 month";
  if (days < 90) return `${Math.floor(days / 30)} months`;
  return `${Math.floor(days / 30)} months`;
}

/**
 * CSS-var color tokens for each bucket. Kept in this lib so the table
 * cell + any future card badge use exactly the same palette.
 */
export const AGE_BUCKET_COLORS: Record<AgeBucket, { bg: string; text: string }> = {
  fresh: { bg: "var(--color-success-soft)", text: "var(--color-success)" },
  watch: { bg: "var(--color-warning-soft)", text: "var(--color-warning)" },
  stalled: { bg: "rgba(234,88,12,0.10)", text: "#9a3412" },
  frozen: { bg: "var(--color-error-soft)", text: "var(--color-error)" },
};
