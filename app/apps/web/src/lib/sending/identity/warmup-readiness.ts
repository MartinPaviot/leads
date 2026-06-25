/**
 * Spec 21 — Instantly-warmup readiness gate (pure). Maps a mailbox's LIVE Instantly
 * warmup signal to a cold-send decision, then composes it with the existing warmup
 * VOLUME ramp (campaign-engine/deliverability/warmup.ts) for the allowed cold volume
 * today.
 *
 * Division of labour (see _specs/21): INSTANTLY owns the reputation warmup pool
 * (POST /api/v2/accounts/warmup/enable) + its native slow-ramp; OUR engine reads the
 * signal — `warmup_status` (GET /api/v2/accounts/{email}) + `stat_warmup_score` +
 * landed-inbox rate (POST .../warmup-analytics) — and GATES real cold campaign sends
 * on it. We do NOT reimplement the warmup pool; we consume its readiness.
 *
 * Doctrine: FAIL-CLOSED. Any unhealthy/unknown warmup state → canSendCold:false. A
 * mailbox we can't confirm is warm never blasts cold (deliverability > velocity).
 *
 * Blast radius: sending/identity/* only. No provider SDK imported — the Instantly
 * client maps its HTTP response into a WarmupSignal.
 */

import { getWarmupDailyTarget, isWarmupComplete } from "@/lib/campaign-engine/deliverability/warmup";

/** Instantly `warmup_status` (GET /api/v2/accounts/{email}). */
export const WARMUP_STATUS = {
  paused: 0,
  active: 1,
  banned: -1,
  spamFolder: -2,
  suspended: -3,
} as const;

export interface WarmupSignal {
  /** Instantly warmup_status. */
  status: number;
  /** Instantly stat_warmup_score, 0..100. */
  score: number;
  /** landed_inbox / sent over the analytics window, 0..1 (richer than score; optional). */
  inboxRate?: number | null;
}

export interface WarmupReadinessConfig {
  /** Min stat_warmup_score to open cold sends. */
  minScore?: number;
  /** Min inbox-placement rate, applied only when inboxRate is known. */
  minInboxRate?: number;
}

export const DEFAULT_MIN_WARMUP_SCORE = 90;
export const DEFAULT_MIN_INBOX_RATE = 0.9;

export type WarmupBlockCode =
  | "warmup_banned"
  | "warmup_in_spam"
  | "warmup_suspended"
  | "warmup_paused"
  | "warmup_unknown_status"
  | "warmup_immature"
  | "warmup_low_inbox_rate";

export type WarmupReadiness =
  | { canSendCold: true; reason: string }
  | { canSendCold: false; code: WarmupBlockCode; reason: string };

/** Map the live Instantly warmup signal to a cold-send gate. Fail-closed. */
export function evaluateWarmupReadiness(
  signal: WarmupSignal,
  config: WarmupReadinessConfig = {},
): WarmupReadiness {
  const minScore = config.minScore ?? DEFAULT_MIN_WARMUP_SCORE;
  const minInbox = config.minInboxRate ?? DEFAULT_MIN_INBOX_RATE;

  // Hard-unhealthy states first — these never send cold regardless of score.
  switch (signal.status) {
    case WARMUP_STATUS.banned:
      return { canSendCold: false, code: "warmup_banned", reason: "Mailbox banned by the provider — never send" };
    case WARMUP_STATUS.spamFolder:
      return { canSendCold: false, code: "warmup_in_spam", reason: "Warmup landing in spam — cold sends would compound it" };
    case WARMUP_STATUS.suspended:
      return { canSendCold: false, code: "warmup_suspended", reason: "Mailbox permanently suspended" };
    case WARMUP_STATUS.paused:
      return { canSendCold: false, code: "warmup_paused", reason: "Warmup is paused — reputation not building" };
    case WARMUP_STATUS.active:
      break;
    default:
      return { canSendCold: false, code: "warmup_unknown_status", reason: `Unknown warmup status ${signal.status}` };
  }

  // Active: gate on the health score, then the inbox-placement rate when known.
  // `!(x >= min)` (not `x < min`) so a NaN score fails closed.
  if (!(signal.score >= minScore)) {
    return { canSendCold: false, code: "warmup_immature", reason: `Warmup score ${signal.score} < ${minScore}` };
  }
  if (signal.inboxRate != null && !(signal.inboxRate >= minInbox)) {
    return {
      canSendCold: false,
      code: "warmup_low_inbox_rate",
      reason: `Inbox-placement ${(signal.inboxRate * 100).toFixed(0)}% < ${(minInbox * 100).toFixed(0)}%`,
    };
  }
  return { canSendCold: true, reason: `Warmup active, score ${signal.score}` };
}

/**
 * The allowed COLD sends for a mailbox today: 0 unless the Instantly warmup gate
 * passes, then the volume ramp ceiling (warmup.ts) minus what's already sent today.
 * Mirrors capacity.ts's ramp-vs-cap composition, gated on Instantly readiness.
 */
export function allowedColdSendsToday(args: {
  signal: WarmupSignal;
  /** null = not in a tracked ramp (fully warmed / pre-launch) → steady cap applies. */
  warmupStartedAt: Date | null;
  steadyDailyCap: number;
  sentToday: number;
  config?: WarmupReadinessConfig;
}): { allowed: number; gate: WarmupReadiness } {
  const gate = evaluateWarmupReadiness(args.signal, args.config);
  if (!gate.canSendCold) return { allowed: 0, gate };
  const ceiling =
    !args.warmupStartedAt || isWarmupComplete(args.warmupStartedAt)
      ? args.steadyDailyCap
      : Math.min(getWarmupDailyTarget(args.warmupStartedAt), args.steadyDailyCap);
  return { allowed: Math.max(0, ceiling - Math.max(0, args.sentToday)), gate };
}

/**
 * Derive a WarmupSignal from one email's POST /warmup-analytics aggregate row plus
 * the account's warmup_status (the two live reads the cron joins). inboxRate is
 * landed_inbox/sent when sent>0, else null (no data → score-only gate).
 */
export function signalFromAnalytics(
  agg: { health_score?: number; sent?: number; landed_inbox?: number } | undefined,
  warmupStatus: number,
): WarmupSignal {
  const sent = agg?.sent ?? 0;
  const inboxRate = sent > 0 && agg?.landed_inbox != null ? agg.landed_inbox / sent : null;
  return { status: warmupStatus, score: agg?.health_score ?? 0, inboxRate };
}
