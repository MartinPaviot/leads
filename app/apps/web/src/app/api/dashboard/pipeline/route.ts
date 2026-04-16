import { getAuthContext } from "@/lib/auth-utils";
import { db } from "@/db";
import { deals, activities } from "@/db/schema";
import { and, eq, notInArray, sql, count, avg, gte, desc } from "drizzle-orm";
import { NextResponse } from "next/server";
import { stageProbability, ageInStage } from "@/lib/deal-helpers";

/**
 * GET /api/dashboard/pipeline?period=30
 *
 * Returns pipeline breakdown: stages, totals, velocity, risks.
 */
export async function GET(req: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url, "http://localhost");
  const periodDays = Math.min(Number(searchParams.get("period") || 30), 365);
  const periodStart = new Date(Date.now() - periodDays * 86400000);

  const { tenantId } = authCtx;

  // Fetch all open deals
  const openDeals = await db
    .select()
    .from(deals)
    .where(
      and(
        eq(deals.tenantId, tenantId),
        notInArray(deals.stage, ["won", "lost"]),
      ),
    );

  // Stage breakdown
  const stageMap = new Map<string, { count: number; totalValue: number; ages: number[] }>();
  for (const deal of openDeals) {
    const stage = deal.stage ?? "unknown";
    const entry = stageMap.get(stage) || { count: 0, totalValue: 0, ages: [] };
    entry.count++;
    entry.totalValue += deal.value ? Number(deal.value) : 0;
    const age = ageInStage(deal.updatedAt, deal.stage);
    if (age) entry.ages.push(age.days);
    stageMap.set(stage, entry);
  }

  const stages = Array.from(stageMap.entries()).map(([name, data]) => ({
    name,
    count: data.count,
    totalValue: data.totalValue,
    avgAge: data.ages.length > 0 ? Math.round(data.ages.reduce((a, b) => a + b, 0) / data.ages.length) : 0,
  }));

  // Totals
  const totalValue = openDeals.reduce((sum, d) => sum + (d.value ? Number(d.value) : 0), 0);
  const weightedValue = openDeals.reduce((sum, d) => {
    const prob = stageProbability(d.stage) ?? 0;
    return sum + (d.value ? Number(d.value) : 0) * (prob / 100);
  }, 0);

  // Velocity: deals won/lost in period
  const closedDeals = await db
    .select()
    .from(deals)
    .where(
      and(
        eq(deals.tenantId, tenantId),
        gte(deals.updatedAt, periodStart),
      ),
    );

  const wonInPeriod = closedDeals.filter((d) => d.stage === "won");
  const lostInPeriod = closedDeals.filter((d) => d.stage === "lost");
  const newInPeriod = closedDeals.filter((d) => d.createdAt && d.createdAt >= periodStart);

  // Risk deals (stalled > 14 days)
  const risks = openDeals
    .map((d) => {
      const age = ageInStage(d.updatedAt, d.stage);
      if (!age || age.days <= 14) return null;
      return {
        dealId: d.id,
        name: d.name,
        stage: d.stage,
        daysStalled: age.days,
        bucket: age.bucket,
        value: d.value ? Number(d.value) : null,
      };
    })
    .filter((r) => r !== null)
    .sort((a, b) => b!.daysStalled - a!.daysStalled);

  return NextResponse.json({
    stages,
    totals: {
      openDeals: openDeals.length,
      totalValue,
      weightedValue: Math.round(weightedValue),
      avgDealSize: openDeals.length > 0 ? Math.round(totalValue / openDeals.length) : 0,
    },
    velocity: {
      newDealsThisPeriod: newInPeriod.length,
      closedWonThisPeriod: wonInPeriod.length,
      closedLostThisPeriod: lostInPeriod.length,
      conversionRate: wonInPeriod.length + lostInPeriod.length > 0
        ? Math.round((wonInPeriod.length / (wonInPeriod.length + lostInPeriod.length)) * 100) / 100
        : null,
    },
    risks,
    periodDays,
  });
}
