import { getAuthContext } from "@/lib/auth/auth-utils";
import { db } from "@/db";
import { deals, outboundEmails } from "@/db/schema";
import { sql, eq, and, gte, isNotNull } from "drizzle-orm";
import { getTenantSettings } from "@/lib/config/tenant-settings";
import { computeRevEquation } from "@/lib/analytics/rev-equation";

/**
 * GET /api/analytics/forecast
 *
 * The honest revenue read for the trailing 90 days: feeds real funnel counts
 * into lib/analytics/rev-equation.ts and returns the diagnosis (run-rate with
 * a range, the bottleneck, demand-vs-conversion). Read-only, tenant-scoped.
 *
 * This is a run-rate, not a future projection: contactedForecast is the
 * trailing-window volume, so expectedDeals reads "what this volume yields at
 * current rates". The point is the bottleneck and the range, never a single
 * flattering number (The Method, steps 1 and 8).
 */
const WINDOW_DAYS = 90;

export async function GET() {
  const authCtx = await getAuthContext();
  if (!authCtx) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const tenantId = authCtx.tenantId;
  const windowStart = new Date(Date.now() - WINDOW_DAYS * 86400000);

  try {
    const [emailAgg, dealRows, settings] = await Promise.all([
      // Outbound volume + replies over the window (the cold-email funnel head).
      db
        .select({
          contacted: sql<number>`count(*) filter (where ${outboundEmails.sentAt} is not null)::int`,
          replied: sql<number>`count(*) filter (where ${outboundEmails.repliedAt} is not null)::int`,
        })
        .from(outboundEmails)
        .where(
          and(
            eq(outboundEmails.tenantId, tenantId),
            gte(outboundEmails.sentAt, windowStart),
          ),
        ),
      // Deals by stage, with the split amounts (bookings are not ARR — sum
      // project + platform per deal for an ACV proxy).
      db
        .select({
          stage: deals.stage,
          n: sql<number>`count(*)::int`,
          value: sql<number>`coalesce(sum(coalesce(${deals.projectAmount},0) + coalesce(${deals.platformArr},0)),0)::int`,
        })
        .from(deals)
        .where(and(eq(deals.tenantId, tenantId), isNotNull(deals.stage)))
        .groupBy(deals.stage),
      getTenantSettings(tenantId),
    ]);

    const emails = emailAgg[0] ?? { contacted: 0, replied: 0 };
    const byStage: Record<string, { n: number; value: number }> = {};
    for (const r of dealRows) byStage[r.stage ?? "lead"] = { n: r.n, value: r.value };

    const stageN = (s: string) => byStage[s]?.n ?? 0;
    const wonN = stageN("won");
    const wonValue = byStage["won"]?.value ?? 0;
    // In-play opportunities for the coverage read.
    const qualified = stageN("qualification") + stageN("demo") + stageN("trial");
    const proposal = stageN("proposal") + stageN("negotiation");
    const activeDeals = qualified + proposal; // open, non-lead, non-closed

    // ACV: average won-deal value (split summed); fall back to open-deal
    // average, else 0 (engine flags an unset ACV honestly).
    const openValue = Object.entries(byStage)
      .filter(([s]) => s !== "won" && s !== "lost")
      .reduce((sum, [, v]) => sum + v.value, 0);
    const openN = Object.entries(byStage)
      .filter(([s]) => s !== "won" && s !== "lost")
      .reduce((sum, [, v]) => sum + v.n, 0);
    const acv = wonN > 0 ? Math.round(wonValue / wonN) : openN > 0 ? Math.round(openValue / openN) : 0;

    // Optional revenue goal from tenant settings (jsonb, no migration). Shape
    // tolerated loosely: { revenueGoal: { monthly?: number, amount?: number } }.
    const rawGoal = (settings as unknown as { revenueGoal?: { monthly?: number; amount?: number } })
      ?.revenueGoal;
    const monthly = rawGoal?.monthly ?? rawGoal?.amount ?? null;
    // Scale a monthly goal to the 90-day window so it matches the run-rate.
    const goal = monthly && monthly > 0 ? Math.round((monthly * WINDOW_DAYS) / 30) : null;

    const result = computeRevEquation({
      contactedForecast: emails.contacted,
      observed: {
        contacted: emails.contacted,
        replied: emails.replied,
        qualified,
        proposal,
        won: wonN,
      },
      acv,
      goal,
      activeDeals,
    });

    return Response.json({
      windowDays: WINDOW_DAYS,
      goalSet: goal != null,
      inputs: { contacted: emails.contacted, replied: emails.replied, qualified, proposal, won: wonN, acv, activeDeals },
      ...result,
    });
  } catch (err) {
    console.error("[analytics/forecast] failed:", err instanceof Error ? err.message : err);
    return Response.json({ error: "Failed to compute forecast" }, { status: 500 });
  }
}
