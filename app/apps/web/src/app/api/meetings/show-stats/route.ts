/**
 * GET /api/meetings/show-stats?scope=me|team&days=90
 *
 * The meeting show rate, tallied in Postgres over the stored meeting activities
 * so it's cheap (no live calendar call) and shareable by the Call Mode metrics
 * dashboard and the meetings page alike. A meeting counts as held when the rep
 * marked it so OR it was recorded; no-show only when the rep marked it; anything
 * else past stays "unknown" (to qualify) and never enters the denominator. The
 * rate + sample floor live in lib/meetings/attendance (one source of truth).
 *
 * Window defaults to 90 days — meetings are sparser than dials, so a 30-day
 * show rate rarely clears the floor. Scope "me" filters by the calendar owner
 * stamped on the activity; "team" is the whole workspace.
 */

import { getAuthContext } from "@/lib/auth/auth-utils";
import { db } from "@/db";
import { sql } from "drizzle-orm";
import { showStatsFromCounts } from "@/lib/meetings/attendance";

const DEFAULT_DAYS = 90;

export async function GET(req: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const scope = url.searchParams.get("scope") === "team" ? "team" : "me";
  const days = Math.min(365, Math.max(7, Number(url.searchParams.get("days")) || DEFAULT_DAYS));

  // Per-user attribution uses metadata.calendarUserId, stamped by /api/meetings
  // when it materialises an activity from the rep's calendar. Older rows lack
  // it, so "me" can under-count until the next sync — "team" is always complete.
  const meClause =
    scope === "me" ? sql` AND metadata->>'calendarUserId' = ${authCtx.userId}` : sql``;

  const rows = (await db.execute(sql`
    SELECT
      count(*) FILTER (WHERE att = 'held')::int AS explicit_held,
      count(*) FILTER (WHERE att = 'no_show')::int AS no_show,
      count(*) FILTER (WHERE att IS NULL AND is_past AND recorded)::int AS auto_held,
      count(*) FILTER (WHERE att IS NULL AND is_past AND NOT recorded)::int AS unknown,
      count(*) FILTER (WHERE att IS NULL AND NOT is_past)::int AS scheduled
    FROM (
      SELECT
        metadata->>'attendance' AS att,
        (occurred_at < now()) AS is_past,
        (
          metadata->>'recordingUrl' IS NOT NULL
          OR metadata->>'structuredNotes' IS NOT NULL
          OR metadata->>'hasTranscript' = 'true'
        ) AS recorded
      FROM activities
      WHERE tenant_id = ${authCtx.tenantId}
        AND entity_type = 'meeting'
        AND deleted_at IS NULL
        AND occurred_at >= now() - ${`${days} days`}::interval${meClause}
    ) t
  `)) as unknown as Array<Record<string, number | null>>;
  const r = rows[0] ?? {};

  const stats = showStatsFromCounts({
    held: Number(r.explicit_held ?? 0) + Number(r.auto_held ?? 0),
    noShow: Number(r.no_show ?? 0),
    unknown: Number(r.unknown ?? 0),
    scheduled: Number(r.scheduled ?? 0),
  });

  return Response.json({ scope, days, stats });
}
