/**
 * GET /api/calls/campaign/stats
 *
 * The funnel made visible so the rep trusts the autopilot:
 *   - goal progress  : calls today vs daily quota, calls/connects/meetings
 *                      this week vs the goal target
 *   - cadence state  : how many targets are due, in retry, reached, exhausted
 *   - coverage       : how many targets are actually callable (have a phone)
 *
 * Call Mode is individualised per user, but the numbers can be shared at the
 * team level: `?scope=team` aggregates across every rep's active campaign in
 * the workspace (summed quota/target, tenant-wide calls + cadence + coverage).
 * Default scope is the calling rep's own campaign.
 */

import { withAuthRLS } from "@/lib/auth/auth-utils";
import { db } from "@/db";
import { callCampaigns } from "@/db/schema";
import { and, eq, desc, sql } from "drizzle-orm";
import { segmentImpact } from "@/lib/voice/script-context";
import { CONNECT_OUTCOMES } from "@/lib/voice/call-metrics";

function startOfTodayUTC(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}
function startOfWeekUTC(now = new Date()): Date {
  const d = startOfTodayUTC(now);
  const dow = (d.getUTCDay() + 6) % 7; // Mon=0
  d.setUTCDate(d.getUTCDate() - dow);
  return d;
}

export async function GET(req: Request) {
  return withAuthRLS(async (authCtx) => {
    const tenantId = authCtx.tenantId;
    const userId = authCtx.appUserId;
    const scope = new URL(req.url).searchParams.get("scope") === "team" ? "team" : "me";

    // Active campaign(s) in scope: the rep's own (me) or every rep's (team).
    let campaigns = await db
      .select()
      .from(callCampaigns)
      .where(
        and(
          eq(callCampaigns.tenantId, tenantId),
          eq(callCampaigns.status, "active"),
          ...(scope === "me" ? [eq(callCampaigns.ownerId, userId)] : []),
        ),
      )
      .orderBy(desc(callCampaigns.createdAt));

    // A member without their own campaign works the shared workspace
    // campaign (same fallback as GET /api/calls/campaign) — their "me"
    // funnel mirrors it instead of rendering empty next to a live queue.
    if (campaigns.length === 0 && scope === "me") {
      campaigns = await db
        .select()
        .from(callCampaigns)
        .where(and(eq(callCampaigns.tenantId, tenantId), eq(callCampaigns.status, "active")))
        .orderBy(desc(callCampaigns.createdAt))
        .limit(1);
    }

    if (campaigns.length === 0) return Response.json({ campaign: null, scope });

    const today = startOfTodayUTC();
    const weekStart = startOfWeekUTC();
    const endOfToday = new Date(today.getTime() + 86_400_000);

    const dailyQuota = campaigns.reduce((a, c) => a + (c.dailyQuota ?? 0), 0);
    const weeklyTarget = campaigns.reduce((a, c) => a + (c.weeklyTarget ?? 0), 0);
    const idList = sql.join(campaigns.map((c) => sql`${c.id}`), sql`, `);
    // Connect = reached the target human (SSOT, shared with /api/calls/metrics).
    const connectList = sql.join(CONNECT_OUTCOMES.map((o) => sql`${o}`), sql`, `);

    // Calls progress — this rep's own (me) or the whole team (team).
    const progressRows = (await db.execute(sql`
      SELECT
        count(*) FILTER (WHERE started_at >= ${today.toISOString()})::int AS calls_today,
        count(*) FILTER (WHERE started_at >= ${weekStart.toISOString()})::int AS calls_week,
        count(*) FILTER (WHERE started_at >= ${weekStart.toISOString()} AND outcome IN (${connectList}))::int AS connects_week,
        count(*) FILTER (WHERE started_at >= ${weekStart.toISOString()} AND outcome = 'no_answer')::int AS no_answer_week,
        count(*) FILTER (WHERE started_at >= ${weekStart.toISOString()} AND outcome = 'meeting_booked')::int AS meetings_week,
        count(*) FILTER (WHERE started_at >= ${weekStart.toISOString()} AND script_context->>'reasonSource' IS NOT NULL)::int AS reason_calls_week,
        count(*) FILTER (WHERE started_at >= ${weekStart.toISOString()} AND script_context->>'reasonSource' IS NOT NULL AND outcome = 'meeting_booked')::int AS reason_meetings_week
      FROM calls
      WHERE tenant_id = ${tenantId}${scope === "me" ? sql` AND user_id = ${userId}` : sql``}
    `)) as unknown as Array<{ calls_today: number; calls_week: number; connects_week: number; no_answer_week: number; meetings_week: number; reason_calls_week: number; reason_meetings_week: number }>;
    const p = progressRows[0] ?? { calls_today: 0, calls_week: 0, connects_week: 0, no_answer_week: 0, meetings_week: 0, reason_calls_week: 0, reason_meetings_week: 0 };

    // Cadence breakdown by target status (+ due today), across the in-scope campaigns.
    const cadenceRows = (await db.execute(sql`
      SELECT status, count(*)::int AS n FROM call_campaign_targets
      WHERE campaign_id IN (${idList}) GROUP BY status
    `)) as unknown as Array<{ status: string; n: number }>;
    const cadence: Record<string, number> = { queued: 0, in_progress: 0, connected: 0, converted: 0, exhausted: 0, dnc: 0 };
    for (const r of cadenceRows) cadence[r.status] = r.n;

    const dueRows = (await db.execute(sql`
      SELECT count(*)::int AS n FROM call_campaign_targets
      WHERE campaign_id IN (${idList}) AND status = 'queued' AND next_attempt_at <= ${endOfToday.toISOString()}
    `)) as unknown as Array<{ n: number }>;
    const dueToday = dueRows[0]?.n ?? 0;

    // Enrichment coverage of the campaign pool.
    const covRows = (await db.execute(sql`
      SELECT count(*)::int AS total,
             count(*) FILTER (WHERE c.phone IS NOT NULL AND c.phone <> '')::int AS with_phone
      FROM call_campaign_targets t
      JOIN contacts c ON c.id = t.contact_id
      WHERE t.campaign_id IN (${idList}) AND c.deleted_at IS NULL
    `)) as unknown as Array<{ total: number; with_phone: number }>;
    const cov = covRows[0] ?? { total: 0, with_phone: 0 };

    // A single rep keeps their stated goal + noun; the team view aggregates
    // mixed goals into a calls-based weekly figure (goal = null -> "calls").
    const goal =
      scope === "me"
        ? (((campaigns[0].targetFilter as Record<string, unknown>)?.goal ?? null) as
            | { type: "calls" | "connects" | "meetings"; target: number; window: string }
            | null)
        : null;
    const goalDone = goal
      ? goal.type === "meetings"
        ? p.meetings_week
        : goal.type === "connects"
          ? p.connects_week
          : p.calls_week
      : p.calls_week;

    return Response.json({
      scope,
      campaign:
        scope === "me"
          ? { id: campaigns[0].id, name: campaigns[0].name, dailyQuota, weeklyTarget }
          : { id: "team", name: `Team · ${campaigns.length} rep${campaigns.length === 1 ? "" : "s"}`, dailyQuota, weeklyTarget },
      goal,
      goalDone,
      progress: {
        callsToday: p.calls_today,
        callsWeek: p.calls_week,
        connectsWeek: p.connects_week,
        noAnswerWeek: p.no_answer_week,
        meetingsWeek: p.meetings_week,
        dailyQuota,
      },
      cadence: { ...cadence, dueToday, total: Object.values(cadence).reduce((a, b) => a + b, 0) },
      coverage: { targets: cov.total, withPhone: cov.with_phone },
      // Outcomes segmented by script variant: calls dialled with a grounded
      // reason line showing vs without (the Living Script measurement seed).
      scriptImpact: segmentImpact(p.calls_week, p.meetings_week, p.reason_calls_week, p.reason_meetings_week),
    });
  });
}
