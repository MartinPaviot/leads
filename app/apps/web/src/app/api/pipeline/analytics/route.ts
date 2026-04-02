import { getAuthContext } from "@/lib/auth-utils";
import { db } from "@/db";
import { deals } from "@/db/schema";
import { eq, sql } from "drizzle-orm";

export async function GET() {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const allDeals = await db.select().from(deals).where(eq(deals.tenantId, authCtx.tenantId));

    const activeStages = ["lead", "qualification", "demo", "trial", "proposal", "negotiation"];
    const wonDeals = allDeals.filter((d) => d.stage === "won");
    const lostDeals = allDeals.filter((d) => d.stage === "lost");
    const closedDeals = wonDeals.length + lostDeals.length;
    const activeDeals = allDeals.filter((d) => activeStages.includes(d.stage!));

    // Value by stage
    const valueByStage: Record<string, { count: number; value: number }> = {};
    for (const stage of activeStages) {
      const stageDeals = allDeals.filter((d) => d.stage === stage);
      valueByStage[stage] = {
        count: stageDeals.length,
        value: stageDeals.reduce((sum, d) => sum + (d.value || 0), 0),
      };
    }

    // Win rate
    const winRate = closedDeals > 0 ? wonDeals.length / closedDeals : 0;

    // Average deal value (active + won, excluding lost)
    const valuedDeals = allDeals.filter((d) => d.stage !== "lost" && d.value && d.value > 0);
    const avgDealValue =
      valuedDeals.length > 0
        ? valuedDeals.reduce((sum, d) => sum + (d.value || 0), 0) / valuedDeals.length
        : 0;

    // Pipeline velocity: average days from creation to won
    let avgVelocityDays = 0;
    if (wonDeals.length > 0) {
      const totalDays = wonDeals.reduce((sum, d) => {
        const created = new Date(d.createdAt!).getTime();
        const updated = new Date(d.updatedAt!).getTime();
        return sum + (updated - created) / (1000 * 60 * 60 * 24);
      }, 0);
      avgVelocityDays = Math.round(totalDays / wonDeals.length);
    }

    // Stage conversion funnel (cumulative from lead → negotiation)
    const funnel = activeStages.map((stage) => ({
      stage,
      count: allDeals.filter((d) => d.stage === stage).length,
    }));

    // Risk summary
    const riskSummary = { high: 0, medium: 0, low: 0, none: 0 };
    for (const deal of activeDeals) {
      const risk = (deal.properties as Record<string, unknown>)?.riskLevel as string;
      if (risk === "high") riskSummary.high++;
      else if (risk === "medium") riskSummary.medium++;
      else if (risk === "low") riskSummary.low++;
      else riskSummary.none++;
    }

    // Total pipeline value
    const totalPipelineValue = activeDeals.reduce((sum, d) => sum + (d.value || 0), 0);

    // Won value
    const wonValue = wonDeals.reduce((sum, d) => sum + (d.value || 0), 0);

    return Response.json({
      totalDeals: allDeals.length,
      activeDeals: activeDeals.length,
      totalPipelineValue,
      wonValue,
      wonCount: wonDeals.length,
      lostCount: lostDeals.length,
      winRate: Math.round(winRate * 100),
      avgDealValue: Math.round(avgDealValue),
      avgVelocityDays,
      valueByStage,
      funnel,
      riskSummary,
    });
  } catch (error) {
    console.error("Pipeline analytics failed:", error);
    return Response.json({ error: "Failed to compute analytics" }, { status: 500 });
  }
}
