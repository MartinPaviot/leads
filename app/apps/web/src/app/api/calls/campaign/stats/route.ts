/**
 * GET /api/calls/campaign/stats
 *
 * The funnel made visible so the rep trusts the autopilot:
 *   - goal progress  : calls today vs daily quota, calls/connects/meetings
 *                      this week vs the goal target
 *   - cadence state  : how many targets are due, in retry, reached, exhausted
 *   - coverage       : how many targets are actually callable (have a phone)
 */

import { withAuthRLS } from "@/lib/auth/auth-utils";
import { db } from "@/db";
import { callCampaigns } from "@/db/schema";
import { and, eq, desc, sql } from "drizzle-orm";

function startOfTodayUTC(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}
function startOfWeekUTC(now = new Date()): Date {
  const d = startOfTodayUTC(now);
  const dow = (d.getUTCDay() + 6) % 7; // Mon=0
  d.setUTCDate(d.getUTCDate() - dow);
  return d;
}

export async function GET() {
  return withAuthRLS(async (authCtx) => {
    const tenantId = authCtx.tenantId;
    const [campaign] = await db
      .select()
      .from(callCampaigns)
      .where(and(eq(callCampaigns.tenantId, tenantId), eq(callCampaigns.status, "active")))
      .orderBy(desc(callCampaigns.createdAt))
      .limit(1);

    if (!campaign) return Response.json({ campaign: null });

    const today = startOfTodayUTC();
    const weekStart = startOfWeekUTC();
    const endOfToday = new Date(today.getTime() + 86_400_000);

    // Calls progress (tenant-wide proxy for the active campaign).
    const progressRows = (await db.execute(sql`
      SELECT
        count(*) FILTER (WHERE started_at >= ${today.toISOString()})::int AS calls_today,
        count(*) FILTER (WHERE started_at >= ${weekStart.toISOString()})::int AS calls_week,
        count(*) FILTER (WHERE started_at >= ${weekStart.toISOString()} AND outcome IN ('connected','meeting_booked','callback_requested'))::int AS connects_week,
        count(*) FILTER (WHERE started_at >= ${weekStart.toISOString()} AND outcome = 'meeting_booked')::int AS meetings_week
      FROM calls WHERE tenant_id = ${tenantId}
    `)) as unknown as Array<{ calls_today: number; calls_week: number; connects_week: number; meetings_week: number }>;
    const p = progressRows[0] ?? { calls_today: 0, calls_week: 0, connects_week: 0, meetings_week: 0 };

    // Cadence breakdown by target status (+ due today).
    const cadenceRows = (await db.execute(sql`
      SELECT status, count(*)::int AS n FROM call_campaign_targets
      WHERE campaign_id = ${campaign.id} GROUP BY status
    `)) as unknown as Array<{ status: string; n: number }>;
    const cadence: Record<string, number> = { queued: 0, in_progress: 0, connected: 0, converted: 0, exhausted: 0, dnc: 0 };
    for (const r of cadenceRows) cadence[r.status] = r.n;

    const dueRows = (await db.execute(sql`
      SELECT count(*)::int AS n FROM call_campaign_targets
      WHERE campaign_id = ${campaign.id} AND status = 'queued' AND next_attempt_at <= ${endOfToday.toISOString()}
    `)) as unknown as Array<{ n: number }>;
    const dueToday = dueRows[0]?.n ?? 0;

    // Enrichment coverage of the campaign pool.
    const covRows = (await db.execute(sql`
      SELECT count(*)::int AS total,
             count(*) FILTER (WHERE c.phone IS NOT NULL AND c.phone <> '')::int AS with_phone
      FROM call_campaign_targets t
      JOIN contacts c ON c.id = t.contact_id
      WHERE t.campaign_id = ${campaign.id} AND c.deleted_at IS NULL
    `)) as unknown as Array<{ total: number; with_phone: number }>;
    const cov = covRows[0] ?? { total: 0, with_phone: 0 };

    const goal = ((campaign.targetFilter as Record<string, unknown>)?.goal ?? null) as
      | { type: "calls" | "connects" | "meetings"; target: number; window: string }
      | null;
    // Progress toward the stated goal (this week).
    const goalDone = goal
      ? goal.type === "meetings"
        ? p.meetings_week
        : goal.type === "connects"
          ? p.connects_week
          : p.calls_week
      : p.calls_week;

    return Response.json({
      campaign: { id: campaign.id, name: campaign.name, dailyQuota: campaign.dailyQuota, weeklyTarget: campaign.weeklyTarget },
      goal,
      goalDone,
      progress: {
        callsToday: p.calls_today,
        callsWeek: p.calls_week,
        connectsWeek: p.connects_week,
        meetingsWeek: p.meetings_week,
        dailyQuota: campaign.dailyQuota,
      },
      cadence: { ...cadence, dueToday, total: Object.values(cadence).reduce((a, b) => a + b, 0) },
      coverage: { targets: cov.total, withPhone: cov.with_phone },
    });
  });
}
