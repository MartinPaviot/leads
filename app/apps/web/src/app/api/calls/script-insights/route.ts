/**
 * GET /api/calls/script-insights
 *
 * The learning loop's read side: per sector, which enjeu books best (from the
 * dial-time scriptContext stamped on each call). Floored — returns `best: null`
 * for a sector until it has enough dials, so we never reorder on noise. Until
 * call volume accrues this is mostly empty by design; the value is that the
 * data is being captured so the flywheel can spin.
 */

import { withAuthRLS } from "@/lib/auth/auth-utils";
import { db } from "@/db";
import { calls } from "@/db/schema";
import { and, eq, gte } from "drizzle-orm";
import { enjeuWinRates, type CallEnjeuRow } from "@/lib/voice/script-learning";

export async function GET() {
  return withAuthRLS(async (authCtx) => {
    const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const rows = await db
      .select({ scriptContext: calls.scriptContext, outcome: calls.outcome })
      .from(calls)
      .where(and(eq(calls.tenantId, authCtx.tenantId), gte(calls.createdAt, since)));

    const callRows: CallEnjeuRow[] = rows.map((r) => {
      const sc = (r.scriptContext ?? {}) as Record<string, unknown>;
      return {
        sector: typeof sc.sector === "string" ? sc.sector : null,
        enjeuKey: typeof sc.enjeuKey === "string" ? sc.enjeuKey : null,
        booked: r.outcome === "meeting_booked",
      };
    });

    return Response.json({ insights: enjeuWinRates(callRows) });
  });
}
