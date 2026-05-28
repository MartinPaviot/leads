/**
 * Deep-dive capacity — pure helpers (B7, _specs/pilae-machine/spec-v2.md R9.1, R9.2).
 *
 * Pilae's deep-dive call (the prospect-facing technical deep-dive Paul
 * runs after qualification) is capacity-bound by a real human: Paul.
 * The capacity guardrail prevents the booking flow from over-committing
 * his calendar, and the dashboard badge surfaces the goulot as it
 * tightens so the founder can act before the queue blows up.
 *
 * Two pure functions here, no I/O:
 *   - `getDeepDiveCap(settings)`   — read the per-tenant weekly cap
 *     from `tenants.settings`, with a documented default.
 *   - `decideDeepDiveBooking(...)` — given the current week's count,
 *     the cap, and an override flag, return allow/deny.
 *
 * Plus `getIsoWeekBounds(now)` to give the Inngest cron and the
 * booking endpoint a single source of truth for "what's this week".
 * Week starts Monday 00:00 UTC, ends Monday 00:00 UTC of next week
 * (half-open interval) — the convention every existing weekly cron
 * in this codebase already uses implicitly.
 */

export const DEFAULT_DEEP_DIVE_WEEKLY_CAP = 2;

export function getDeepDiveCap(
  settings: Record<string, unknown> | null | undefined,
): number {
  const raw = settings?.deepDiveWeeklyCap;
  if (typeof raw === "number" && Number.isFinite(raw) && raw >= 0) {
    return Math.floor(raw);
  }
  return DEFAULT_DEEP_DIVE_WEEKLY_CAP;
}

export type CapacityInputs = {
  currentWeekCount: number;
  cap: number;
  hasOverride?: boolean;
};

export type CapacityDecision =
  | { allowed: true; reason: "under_cap" | "override" }
  | { allowed: false; reason: "cap_reached" };

/**
 * Decide whether to allow a new deep-dive booking. The founder can
 * pass `hasOverride: true` to force-book past the cap when a critical
 * deal demands it — the override surfaces in the dashboard so the
 * goulot stays visible.
 */
export function decideDeepDiveBooking(
  i: CapacityInputs,
): CapacityDecision {
  if (i.hasOverride) {
    return { allowed: true, reason: "override" };
  }
  if (i.currentWeekCount < i.cap) {
    return { allowed: true, reason: "under_cap" };
  }
  return { allowed: false, reason: "cap_reached" };
}

/**
 * Compute the load level for the dashboard badge. Three states:
 *   - "ok"       : < 80% of cap
 *   - "tight"    : 80%–100% of cap (warn)
 *   - "saturated": ≥ cap (block colour, "goulot Paul saturé")
 */
export type LoadLevel = "ok" | "tight" | "saturated";

export function classifyDeepDiveLoad(count: number, cap: number): LoadLevel {
  if (cap <= 0) return "saturated"; // pathological config — surface it
  if (count >= cap) return "saturated";
  if (count >= cap * 0.8) return "tight";
  return "ok";
}

/**
 * ISO week bounds (Monday 00:00 UTC inclusive → next Monday 00:00 UTC
 * exclusive) for the given instant. Half-open interval matches what
 * postgres `>=` / `<` expects for the activities scan.
 */
export type WeekBounds = {
  weekStart: Date;
  weekEnd: Date;
};

export function getIsoWeekBounds(now: Date): WeekBounds {
  // getUTCDay: 0 = Sunday, 1 = Monday, ..., 6 = Saturday
  // ISO weeks start Monday. Number of days to roll back to Monday:
  //   Mon (1) → 0, Tue (2) → 1, ..., Sun (0) → 6
  const dow = now.getUTCDay();
  const daysSinceMonday = dow === 0 ? 6 : dow - 1;

  const weekStart = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() - daysSinceMonday,
      0,
      0,
      0,
      0,
    ),
  );
  const weekEnd = new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000);
  return { weekStart, weekEnd };
}

/**
 * Deep-dive activities are tagged via `activities.metadata.meetingType
 * = 'deep_dive'`. The convention is checked in one place so the
 * detector and the booking endpoint can't drift.
 */
export const DEEP_DIVE_METADATA_KEY = "meetingType";
export const DEEP_DIVE_METADATA_VALUE = "deep_dive";

export function isDeepDiveActivity(
  metadata: Record<string, unknown> | null | undefined,
): boolean {
  return metadata?.[DEEP_DIVE_METADATA_KEY] === DEEP_DIVE_METADATA_VALUE;
}
