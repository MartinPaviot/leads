/**
 * Collision awareness — pure core ("who else touched this prospect recently").
 *
 * Slice 1 of the multi-user-attribution chantier. Assignment is MANUAL ONLY, so
 * `ownerId` is frequently null — a collision check keyed on the owner field
 * would be silent on exactly the shared prospects two reps both pick up. So the
 * signal is the REAL, already-stamped activity: who actually called/emailed,
 * and when (calls.userId, activities.actorId, outbound mailbox→user).
 *
 * Everything here is PURE (no DB, no network) and unit-tested without a DB,
 * mirroring lib/inbox/user-scope.ts. The thin DB fetch lives in
 * lib/collision/contact-touches.ts; the route is glue.
 *
 * Every id here is APP-space (`users.id`): calls.userId and activities.actorId
 * already are, and outbound touches are bridged to app-space before they reach
 * this module (see contact-touches.ts §8 of the design). `currentUserId` is
 * `authCtx.appUserId`, and `memberNames` is keyed by `users.id`.
 */

export type TouchChannel = "call" | "email" | "other";

/** One attributed touch on a contact, normalised across calls/activities/email. */
export interface TouchRow {
  /** App-space `users.id` of the actor, or null when unattributable. */
  userId: string | null;
  channel: TouchChannel;
  /** Call outcome / activity label, for the warning copy. May be null. */
  outcome: string | null;
  occurredAt: Date;
}

/** The most-recent touch by a user OTHER than the current one (or null). */
export interface LastTouchByOthers {
  userId: string;
  /** Resolved display name, or a non-empty fallback when unknown. */
  userName: string;
  channel: TouchChannel;
  outcome: string | null;
  occurredAt: Date;
  daysAgo: number;
  /** Distinct OTHER users who touched the contact within the window. */
  otherUserCount: number;
}

export const RECENT_TOUCH_WINDOW_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;
/** Non-empty fallback when an actor id resolves to no member name. */
export const UNKNOWN_TEAMMATE = "a teammate";

function toMs(d: Date | string | number): number {
  const ms = d instanceof Date ? d.getTime() : new Date(d).getTime();
  return ms;
}

/**
 * Classify an `activities` row into a touch channel from its activityType /
 * channel. Calls and outbound emails set their channel directly; this is for
 * the generic activity stream. Email-ish wins over call-ish wins over other.
 */
export function classifyChannel(
  activityType: string | null | undefined,
  channel: string | null | undefined,
): TouchChannel {
  const t = `${activityType ?? ""} ${channel ?? ""}`.toLowerCase();
  if (t.includes("email") || t.includes("mail")) return "email";
  if (t.includes("call") || t.includes("phone") || t.includes("dial")) return "call";
  return "other";
}

/**
 * The most-recent touch by a user OTHER than `currentUserId`, within the
 * recency window. Pure + order-independent: given the same rows in any order it
 * returns the same result (ties on timestamp break deterministically by userId
 * then channel). Self-only / empty / all-stale → null.
 */
export function computeLastTouchByOthers(
  rows: TouchRow[],
  currentUserId: string,
  memberNames: ReadonlyMap<string, string>,
  now: Date = new Date(),
  windowDays: number = RECENT_TOUCH_WINDOW_DAYS,
): LastTouchByOthers | null {
  const nowMs = now.getTime();
  const cutoff = nowMs - windowDays * DAY_MS;

  // Attributed touches by OTHER users, inside the window.
  const qualifying = rows.filter((r) => {
    if (!r.userId || r.userId === currentUserId) return false;
    const ms = toMs(r.occurredAt);
    return Number.isFinite(ms) && ms >= cutoff && ms <= nowMs;
  });
  if (qualifying.length === 0) return null;

  const distinctUsers = new Set<string>();
  let best = qualifying[0];
  let bestMs = toMs(best.occurredAt);
  for (const r of qualifying) {
    distinctUsers.add(r.userId as string);
    const ms = toMs(r.occurredAt);
    if (ms > bestMs) {
      best = r;
      bestMs = ms;
    } else if (ms === bestMs && r !== best) {
      // Deterministic tie-break so the result is order-independent.
      const ru = r.userId as string;
      const bu = best.userId as string;
      if (ru < bu || (ru === bu && r.channel < best.channel)) {
        best = r;
        bestMs = ms;
      }
    }
  }

  const userId = best.userId as string;
  const occurredAt = new Date(toMs(best.occurredAt));
  const daysAgo = Math.max(0, Math.floor((nowMs - occurredAt.getTime()) / DAY_MS));
  const userName = memberNames.get(userId)?.trim() || UNKNOWN_TEAMMATE;

  return {
    userId,
    userName,
    channel: best.channel,
    outcome: best.outcome,
    occurredAt,
    daysAgo,
    otherUserCount: distinctUsers.size,
  };
}

/**
 * Map many contacts → their `LastTouchByOthers` (or null). Pure; the route
 * passes the per-contact touch rows it fetched once. Contacts with no
 * qualifying touch are present with a null value so callers can render "clear".
 */
export function assembleContactCollisions(
  touchesByContact: ReadonlyMap<string, TouchRow[]>,
  currentUserId: string,
  memberNames: ReadonlyMap<string, string>,
  now: Date = new Date(),
  windowDays: number = RECENT_TOUCH_WINDOW_DAYS,
): Record<string, LastTouchByOthers | null> {
  const out: Record<string, LastTouchByOthers | null> = {};
  for (const [contactId, rows] of touchesByContact) {
    out[contactId] = computeLastTouchByOthers(rows, currentUserId, memberNames, now, windowDays);
  }
  return out;
}
