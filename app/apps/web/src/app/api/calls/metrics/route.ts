/**
 * GET /api/calls/metrics?scope=me|team&tz=Europe/Zurich
 *
 * The cold-call performance dashboard — the rates the experts track that the
 * funnel bar can't fit: the full outcome distribution (connect rate, NRP,
 * voicemail, busy, bad-number, gatekeeper, not-interested), conversion
 * efficiency (dials per meeting / per connect), conversation quality (avg
 * connected duration, talk time, talk ratio), and the best time to call
 * (connect rate by hour and by day-of-week, in the rep's local timezone).
 *
 * Window: trailing 30 days — rates need volume to be stable, so a thin week is
 * not enough. Scope "me" is the calling rep's own dials; "team" the workspace.
 * All math lives in the pure lib/voice/call-metrics module (tested); this route
 * only feeds it SQL aggregates and shapes the JSON.
 */

import { withAuthRLS } from "@/lib/auth/auth-utils";
import { db } from "@/db";
import { sql } from "drizzle-orm";
import {
  CONNECT_OUTCOMES,
  computeCallMetrics,
  bestWindows,
  type OutcomeCounts,
  type TimeBucket,
} from "@/lib/voice/call-metrics";

const WINDOW_DAYS = 30;

/**
 * Resolve to a real IANA zone or UTC. The tz comes from the browser
 * (Intl … resolvedOptions().timeZone) and is interpolated into AT TIME ZONE,
 * where a bad value makes Postgres throw — so we validate against the actual
 * IANA database via Intl (not just the string shape: a syntactically valid but
 * non-existent zone like "Mars/Phobos" must not reach the SQL), and normalise
 * to the canonical name. Anything unresolvable → UTC.
 */
function safeTz(raw: string | null): string {
  if (!raw) return "UTC";
  try {
    return new Intl.DateTimeFormat("en-US", { timeZone: raw }).resolvedOptions().timeZone;
  } catch {
    return "UTC";
  }
}

export async function GET(req: Request) {
  return withAuthRLS(async (authCtx) => {
    const tenantId = authCtx.tenantId;
    const userId = authCtx.appUserId;
    const url = new URL(req.url);
    const scope = url.searchParams.get("scope") === "team" ? "team" : "me";
    const tz = safeTz(url.searchParams.get("tz"));

    const since = sql`now() - ${`${WINDOW_DAYS} days`}::interval`;
    const scopeClause = scope === "me" ? sql` AND user_id = ${userId}` : sql``;
    const connectList = sql.join(CONNECT_OUTCOMES.map((o) => sql`${o}`), sql`, `);

    // ── Outcome distribution + talk/quality, one pass over the window ──
    const distRows = (await db.execute(sql`
      SELECT
        count(*)::int AS dials,
        count(*) FILTER (WHERE outcome = 'connected')::int AS connected,
        count(*) FILTER (WHERE outcome = 'meeting_booked')::int AS meeting_booked,
        count(*) FILTER (WHERE outcome = 'callback_requested')::int AS callback_requested,
        count(*) FILTER (WHERE outcome = 'not_interested')::int AS not_interested,
        count(*) FILTER (WHERE outcome = 'voicemail_left')::int AS voicemail_left,
        count(*) FILTER (WHERE outcome = 'no_answer')::int AS no_answer,
        count(*) FILTER (WHERE outcome = 'busy')::int AS busy,
        count(*) FILTER (WHERE outcome = 'gatekeeper')::int AS gatekeeper,
        count(*) FILTER (WHERE outcome = 'wrong_number')::int AS wrong_number,
        count(*) FILTER (WHERE outcome = 'do_not_call')::int AS do_not_call,
        count(*) FILTER (WHERE outcome = 'failed')::int AS failed,
        avg(duration_sec) FILTER (WHERE outcome IN (${connectList}) AND duration_sec IS NOT NULL)::float AS avg_connected_sec,
        coalesce(sum(duration_sec) FILTER (WHERE outcome IN (${connectList}) AND duration_sec IS NOT NULL), 0)::int AS total_sec,
        avg((lever_scores->>'talkRatioPct')::numeric) FILTER (WHERE (lever_scores->>'talkRatioPct') IS NOT NULL)::float AS avg_talk_ratio,
        count(DISTINCT date_trunc('day', started_at AT TIME ZONE ${tz})) FILTER (WHERE outcome IN (${connectList}) AND duration_sec > 0)::int AS active_days
      FROM calls
      WHERE tenant_id = ${tenantId} AND started_at >= ${since}${scopeClause}
    `)) as unknown as Array<Record<string, number | null>>;
    const d = distRows[0] ?? {};

    const oc: OutcomeCounts = {
      dials: Number(d.dials ?? 0),
      connected: Number(d.connected ?? 0),
      meeting_booked: Number(d.meeting_booked ?? 0),
      callback_requested: Number(d.callback_requested ?? 0),
      not_interested: Number(d.not_interested ?? 0),
      voicemail_left: Number(d.voicemail_left ?? 0),
      no_answer: Number(d.no_answer ?? 0),
      busy: Number(d.busy ?? 0),
      gatekeeper: Number(d.gatekeeper ?? 0),
      wrong_number: Number(d.wrong_number ?? 0),
      do_not_call: Number(d.do_not_call ?? 0),
      failed: Number(d.failed ?? 0),
    };

    const metrics = computeCallMetrics(oc);

    // ── Best time to call: connect rate by hour and by day-of-week, rep-local ──
    const bucketSql = (part: "hour" | "dow") => sql`
      SELECT EXTRACT(${sql.raw(part)} FROM started_at AT TIME ZONE ${tz})::int AS key,
             count(*)::int AS dials,
             count(*) FILTER (WHERE outcome IN (${connectList}))::int AS connects
      FROM calls
      WHERE tenant_id = ${tenantId} AND started_at >= ${since}${scopeClause}
      GROUP BY 1 ORDER BY 1
    `;
    const hourRows = (await db.execute(bucketSql("hour"))) as unknown as Array<Record<string, number>>;
    const dowRows = (await db.execute(bucketSql("dow"))) as unknown as Array<Record<string, number>>;

    const toBuckets = (rows: Array<Record<string, number>>): TimeBucket[] =>
      rows.map((r) => ({ key: Number(r.key), dials: Number(r.dials), connects: Number(r.connects) }));
    const hours = toBuckets(hourRows);
    const dows = toBuckets(dowRows);

    const totalSec = Number(d.total_sec ?? 0);
    const activeDays = Number(d.active_days ?? 0);

    return Response.json({
      scope,
      tz,
      windowDays: WINDOW_DAYS,
      counts: oc,
      metrics,
      quality: {
        avgConnectedSec: d.avg_connected_sec != null ? Math.round(Number(d.avg_connected_sec)) : null,
        totalTalkMin: Math.round(totalSec / 60),
        avgTalkMinPerActiveDay: activeDays > 0 ? Math.round(totalSec / 60 / activeDays) : null,
        avgTalkRatioPct: d.avg_talk_ratio != null ? Math.round(Number(d.avg_talk_ratio)) : null,
        activeDays,
      },
      timing: {
        bestHours: bestWindows(hours, 3),
        bestDows: bestWindows(dows, 2),
        hours,
        dows,
      },
    });
  });
}
