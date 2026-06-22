/**
 * Spec 27 — deliverability threshold config (the SSOT; no methodology.md exists
 * in-repo to reference, so these named constants are the single place the 2026
 * norms live — not duplicated across call sites). Spam is provider-specific:
 * Microsoft is stricter than Gmail.
 */

export type MailboxProvider = "google" | "microsoft" | "smtp" | (string & {});

export interface DeliverabilityThresholds {
  /** Bounce rate at/above which we pause (5%). */
  bouncePause: number;
  /** Bounce rate considered safe for resume (3%). */
  bounceWarn: number;
  /** Spam-complaint pause threshold per provider (and a default). */
  spamPause: Record<string, number>;
  /** Don't pause until at least this many sends in the window (avoid 1/1 = 100%). */
  minSampleForPause: number;
  /** Recovery cool-off before a resume is considered. */
  coolOffMs: number;
  /** Ramp-back level a resume starts at (fraction of full volume). */
  resumeRampLevel: number;
}

export const DEFAULT_THRESHOLDS: DeliverabilityThresholds = {
  bouncePause: 0.05,
  bounceWarn: 0.03,
  spamPause: {
    google: 0.003, // Gmail/Yahoo bulk-sender norm
    microsoft: 0.001, // stricter
    default: 0.003,
  },
  minSampleForPause: 20,
  coolOffMs: 24 * 60 * 60 * 1000, // 24h
  resumeRampLevel: 0.25,
};

/** Provider-specific spam threshold, falling back to the default. */
export function spamThreshold(provider: string, t: DeliverabilityThresholds = DEFAULT_THRESHOLDS): number {
  return t.spamPause[provider] ?? t.spamPause.default;
}
