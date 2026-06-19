/**
 * Per-mailbox sync health (A4) — a pure, deterministic verdict for one connected
 * mailbox from the signals already maintained (status, healthScore, needs_reauth)
 * plus the A4 per-box sync timing (lastSyncAt / lastSyncError). No DB, no LLM, no
 * ambient clock (the clock is injected), so it is fully unit-testable and the rail
 * + settings read ONE verdict that cannot drift.
 */

export interface MailboxHealthInput {
  /** connected_mailboxes.status (warming_up | active | paused | disabled | error). */
  status: string | null;
  /** connected_mailboxes.health_score (0-100). */
  healthScore: number | null;
  /** Resolved from the per-connection needs_reauth flag. */
  needsReauth: boolean;
  /** settings.syncHealth["mb:"+id].lastSyncAt (ISO) or null. */
  lastSyncAt: string | null;
  /** Last transient sync error string, or null. */
  lastSyncError: string | null;
  /** Injected clock (epoch ms). */
  now: number;
}

export interface MailboxHealthSummary {
  status: string;
  healthScore: number;
  lastSyncAt: string | null;
  lastSyncError: string | null;
  needsReauth: boolean;
  health: "ok" | "warning" | "error";
}

/** A box that hasn't synced in this long is "warning" (stale). */
export const STALE_MINUTES = 60;
/** Below this health score, the box is "warning". */
export const SCORE_FLOOR = 70;

function toMs(at: string | null): number | null {
  if (!at) return null;
  const ms = new Date(at).getTime();
  return Number.isFinite(ms) ? ms : null;
}

/**
 * Verdict (deterministic, total, first-match):
 *   1. needs_reauth OR status==="error"           → "error"
 *   2. lastSyncError, OR stale (no sync in STALE_MINUTES), OR healthScore<SCORE_FLOOR → "warning"
 *   3. otherwise                                   → "ok"
 */
export function healthSummary(i: MailboxHealthInput): MailboxHealthSummary {
  const status = i.status ?? "unknown";
  const healthScore = typeof i.healthScore === "number" ? i.healthScore : 100;

  let health: MailboxHealthSummary["health"];
  if (i.needsReauth === true || status === "error") {
    health = "error";
  } else {
    const lastMs = toMs(i.lastSyncAt);
    const stale = lastMs === null ? false : i.now - lastMs > STALE_MINUTES * 60_000;
    const lowScore = healthScore < SCORE_FLOOR;
    health = i.lastSyncError != null || stale || lowScore ? "warning" : "ok";
  }

  return {
    status,
    healthScore,
    lastSyncAt: i.lastSyncAt,
    lastSyncError: i.lastSyncError,
    needsReauth: i.needsReauth === true,
    health,
  };
}
