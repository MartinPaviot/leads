/**
 * Per-seat DAILY LinkedIn profile-view budget — the cross-call quota cap the
 * hydration route/cron need. Unipile does NOT enforce LinkedIn's ~100 views/day;
 * exceeding it gets the underlying account restricted, so we cap it ourselves.
 *
 * Stored in linkedin_account.healthDetail.viewBudget {day, spent} (migration-free,
 * reuses the existing JSONB column). The reserve is a single atomic UPDATE so
 * concurrent route + cron calls can't race past the cap; it resets on a new UTC
 * day automatically.
 */
import { db } from "@/db";
import { sql } from "drizzle-orm";

const DEFAULT_DAILY_VIEW_CAP = 80; // headroom under LinkedIn's ~100/day

/** The per-seat daily ceiling (env LINKEDIN_DAILY_VIEW_CAP, clamped to [1,100]). */
export function dailyViewCap(): number {
  const v = Math.floor(Number(process.env.LINKEDIN_DAILY_VIEW_CAP));
  if (!Number.isFinite(v) || v <= 0) return DEFAULT_DAILY_VIEW_CAP;
  return Math.min(100, Math.max(1, v));
}

/** Today's UTC date as YYYY-MM-DD (the budget bucket key). */
function utcDay(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Atomically reserve `amount` profile views against the seat's UTC-day budget.
 * Returns true if reserved (still under cap), false if the day's budget is
 * exhausted — the caller stops spending. Single UPDATE = race-safe; a new UTC
 * day resets `spent`. A non-existent seat returns false (fail-closed: don't
 * spend against an unknown seat).
 */
export async function reserveDailyViews(
  unipileAccountId: string,
  amount: number,
  cap: number = dailyViewCap(),
): Promise<boolean> {
  const today = utcDay();
  // Set the WHOLE viewBudget object in one jsonb_set — jsonb_set does NOT create
  // intermediate keys, so a nested '{viewBudget,spent}' path is a no-op until
  // viewBudget exists (which would silently defeat the cap).
  const rows = (await db.execute(sql`
    update linkedin_account
    set health_detail = jsonb_set(
      coalesce(health_detail, '{}'::jsonb),
      '{viewBudget}',
      jsonb_build_object(
        'day', ${today}::text,
        'spent', (
          case when health_detail->'viewBudget'->>'day' = ${today}
               then coalesce((health_detail->'viewBudget'->>'spent')::int, 0) + ${amount}
               else ${amount} end
        )
      )
    )
    where unipile_account_id = ${unipileAccountId}
      and (
        -- effective spent today (0 on a fresh UTC day) + this reservation ≤ cap.
        -- The CASE handles the day reset, so the cap applies even on the first probe.
        (case when health_detail->'viewBudget'->>'day' = ${today}
              then coalesce((health_detail->'viewBudget'->>'spent')::int, 0)
              else 0 end) + ${amount} <= ${cap}
      )
    returning id
  `)) as unknown as Array<{ id: string }>;
  return rows.length > 0;
}
