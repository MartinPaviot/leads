/**
 * GET /api/cs/today
 *
 * Sprint-2 audit follow-up — Customer Success daily priority queue.
 * Returns the accounts a Founding CS would actually look at today,
 * ranked by `risk_level` × ARR exposure × snapshot age.
 *
 * Sources today's snapshots from `account_health_snapshots`. The
 * cron in `inngest/cs-health-cron.ts` populates one row per active
 * account per day. The endpoint reads the latest snapshot per
 * account and joins back to `companies` for display fields.
 *
 * The page consumes this directly. Empty result is a real signal —
 * if the cron hasn't run yet the page renders an empty-state hint
 * pointing the founder to trigger it manually from settings.
 */

import { db } from "@/db";
import {
  accountHealthSnapshots,
  companies,
} from "@/db/schema";
import { and, desc, eq, sql } from "drizzle-orm";
import { getAuthContext } from "@/lib/auth/auth-utils";

const RISK_RANK: Record<string, number> = {
  high: 0,
  medium: 1,
  low: 2,
  thriving: 3,
};

export async function GET(req: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const limit = Math.min(50, Math.max(1, Number(url.searchParams.get("limit") ?? 20)));

  // Subquery — latest snapshot per account.
  // Uses DISTINCT ON (account_id) which is Postgres-specific and the
  // canonical way to grab "the most recent row per group".
  const latestPerAccount = sql`
    SELECT DISTINCT ON (account_id) *
    FROM account_health_snapshots
    WHERE tenant_id = ${authCtx.tenantId}
    ORDER BY account_id, computed_at DESC
  `;

  const rows = await db.execute(sql`
    SELECT
      h.id              AS h_id,
      h.account_id      AS h_account_id,
      h.health_score    AS h_health_score,
      h.components      AS h_components,
      h.risk_level      AS h_risk_level,
      h.suggested_action AS h_suggested_action,
      h.suggested_action_reason AS h_suggested_action_reason,
      h.arr_exposure_usd AS h_arr_exposure_usd,
      h.computed_at     AS h_computed_at,
      c.id              AS c_id,
      c.name            AS c_name,
      c.domain          AS c_domain,
      c.score           AS c_score
    FROM (${latestPerAccount}) h
    LEFT JOIN ${companies} c
      ON c.id = h.account_id
     AND c.tenant_id = ${authCtx.tenantId}
    WHERE c.id IS NOT NULL
    LIMIT ${limit * 4}
  `);

  // Sort in app code so the secondary tie-break (ARR × age) is
  // explicit and easy to test, rather than buried in SQL.
  const list = (rows as unknown as Array<Record<string, unknown>>).map((r) => ({
    snapshotId: String(r.h_id),
    accountId: String(r.h_account_id),
    accountName: r.c_name ? String(r.c_name) : "",
    accountDomain: r.c_domain ? String(r.c_domain) : null,
    accountScore:
      r.c_score === null || r.c_score === undefined ? null : Number(r.c_score),
    healthScore: Number(r.h_health_score ?? 0),
    components: r.h_components as Record<string, number>,
    riskLevel: String(r.h_risk_level ?? "medium"),
    suggestedAction: r.h_suggested_action ? String(r.h_suggested_action) : null,
    suggestedActionReason: r.h_suggested_action_reason
      ? String(r.h_suggested_action_reason)
      : null,
    arrExposureUsd:
      r.h_arr_exposure_usd === null || r.h_arr_exposure_usd === undefined
        ? null
        : Number(r.h_arr_exposure_usd),
    computedAt:
      r.h_computed_at instanceof Date
        ? r.h_computed_at.toISOString()
        : new Date(String(r.h_computed_at)).toISOString(),
  }));

  list.sort((a, b) => {
    const r = (RISK_RANK[a.riskLevel] ?? 9) - (RISK_RANK[b.riskLevel] ?? 9);
    if (r !== 0) return r;
    // Higher ARR first within risk tier.
    const arrDelta = (b.arrExposureUsd ?? 0) - (a.arrExposureUsd ?? 0);
    if (arrDelta !== 0) return arrDelta;
    // Then lower health (more urgent) first.
    return a.healthScore - b.healthScore;
  });

  return Response.json({
    items: list.slice(0, limit),
    asOf: new Date().toISOString(),
  });
}
