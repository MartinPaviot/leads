import { getAuthContext } from "@/lib/auth-utils";
import { db } from "@/db";
import { aePerformanceSnapshots } from "@/db/schema";
import { and, eq, desc } from "drizzle-orm";
import { NextResponse } from "next/server";
import { detectTrends } from "@/lib/coaching/performance-aggregator";

/**
 * GET /api/dashboard/performance?periods=8
 *
 * Returns AE performance snapshots with trends.
 */
export async function GET(req: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url, "http://localhost");
  const periods = Math.min(Number(searchParams.get("periods") || 8), 52);

  const { tenantId, appUserId } = authCtx;

  const snapshots = await db
    .select()
    .from(aePerformanceSnapshots)
    .where(
      and(
        eq(aePerformanceSnapshots.tenantId, tenantId),
        eq(aePerformanceSnapshots.userId, appUserId),
      ),
    )
    .orderBy(desc(aePerformanceSnapshots.periodEnd))
    .limit(periods);

  const trends = await detectTrends(tenantId, appUserId);

  return NextResponse.json({
    snapshots: snapshots.map((s) => ({
      period: {
        start: s.periodStart.toISOString().split("T")[0],
        end: s.periodEnd.toISOString().split("T")[0],
      },
      activity: {
        emailsSent: s.emailsSent,
        emailsReplied: s.emailsReplied,
        meetingsBooked: s.meetingsBooked,
        meetingsCompleted: s.meetingsCompleted,
      },
      deals: {
        created: s.dealsCreated,
        advanced: s.dealsAdvanced,
        won: s.dealsWon,
        lost: s.dealsLost,
        winRate: s.winRate,
      },
      coaching: {
        toneScore: s.avgToneScore,
        completenessScore: s.avgCompletenessScore,
        objectionHandlingScore: s.avgObjectionHandlingScore,
        processAdherenceScore: s.avgProcessAdherenceScore,
        overallScore: s.overallScore,
      },
    })),
    trends: trends.map((t) => ({
      metric: t.metric,
      direction: t.direction,
      change: `${t.changePercent > 0 ? "+" : ""}${t.changePercent}%`,
      current: t.currentValue,
      previous: t.previousValue,
    })),
    totalPeriods: snapshots.length,
  });
}
