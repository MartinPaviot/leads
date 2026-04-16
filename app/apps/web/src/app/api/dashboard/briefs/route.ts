import { getAuthContext } from "@/lib/auth-utils";
import { NextResponse } from "next/server";
import { briefAllOpenDeals } from "@/lib/deal-briefing";

/**
 * GET /api/dashboard/briefs?max=10
 *
 * Returns latest deal briefs for the dashboard. Generates fresh briefs
 * on each request (cached by the LLM tracing layer).
 */
export async function GET(req: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url, "http://localhost");
  const maxDeals = Math.min(Number(searchParams.get("max") || 10), 20);

  const briefs = await briefAllOpenDeals(authCtx.tenantId, { maxDeals });

  const critical = briefs.filter((b) => b.riskLevel === "critical" || b.riskLevel === "high");

  return NextResponse.json({
    totalDeals: briefs.length,
    needsAttention: critical.length,
    briefs: briefs.map((b) => ({
      dealId: b.dealId,
      dealName: b.dealName,
      stage: b.stage,
      value: b.value,
      companyName: b.companyName,
      contactName: b.contactName,
      daysInStage: b.daysInStage,
      riskLevel: b.riskLevel,
      healthScore: b.healthScore,
      summary: b.summary,
      nextAction: b.nextAction,
      objectionsCount: b.objectionsRaised.length,
      promisesCount: b.promisesMade.length,
    })),
  });
}
