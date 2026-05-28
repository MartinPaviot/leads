import { getAuthContext } from "@/lib/auth/auth-utils";
import { db } from "@/db";
import { deals, activities, coachingInsights } from "@/db/schema";
import { and, eq, notInArray, gte, desc, sql, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { ageInStage } from "@/lib/deals/deal-helpers";

/**
 * GET /api/dashboard/alerts
 *
 * Returns risk alerts: stalled deals, SLA breaches, coaching opportunities.
 */
export async function GET() {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { tenantId } = authCtx;
  const alerts: Array<{
    type: "stalled_deal" | "sla_breach" | "coaching_opportunity";
    severity: "low" | "medium" | "high" | "critical";
    title: string;
    description: string;
    entityType: string;
    entityId: string;
    dealName?: string;
    daysStalled?: number;
  }> = [];

  // 1. Stalled deals (>14 days in stage)
  const openDeals = await db
    .select()
    .from(deals)
    .where(
      and(
        eq(deals.tenantId, tenantId),
        notInArray(deals.stage, ["won", "lost"]),
        isNull(deals.deletedAt),
      ),
    );

  for (const deal of openDeals) {
    const age = ageInStage(deal.updatedAt, deal.stage);
    if (!age || age.days <= 14) continue;

    const severity = age.bucket === "frozen" ? "critical" as const
      : age.bucket === "stalled" ? "high" as const
      : "medium" as const;

    alerts.push({
      type: "stalled_deal",
      severity,
      title: `"${deal.name}" stalled for ${age.days} days`,
      description: `Deal at ${deal.stage} stage, no activity in ${age.long}. ${deal.value ? `Value: $${deal.value}` : ""}`,
      entityType: "deal",
      entityId: deal.id,
      dealName: deal.name,
      daysStalled: age.days,
    });
  }

  // 2. SLA breaches — outbound emails with no response in >48h
  const twoDaysAgo = new Date(Date.now() - 48 * 60 * 60 * 1000);
  const unansweredActivities = await db
    .select({
      id: activities.id,
      entityId: activities.entityId,
      entityType: activities.entityType,
      summary: activities.summary,
      occurredAt: activities.occurredAt,
    })
    .from(activities)
    .where(
      and(
        eq(activities.tenantId, tenantId),
        eq(activities.activityType, "email_sent"),
        eq(activities.direction, "outbound"),
        gte(activities.occurredAt, new Date(Date.now() - 7 * 86400000)), // Last 7 days
        isNull(activities.deletedAt),
      ),
    )
    .orderBy(desc(activities.occurredAt))
    .limit(50);

  // Check which of these have no reply activity after them
  for (const sent of unansweredActivities) {
    if (!sent.occurredAt || sent.occurredAt > twoDaysAgo) continue;

    const daysSinceSent = Math.floor(
      (Date.now() - sent.occurredAt.getTime()) / 86400000,
    );

    if (daysSinceSent >= 2 && daysSinceSent <= 7) {
      alerts.push({
        type: "sla_breach",
        severity: daysSinceSent >= 5 ? "high" : "medium",
        title: `No response in ${daysSinceSent} days`,
        description: sent.summary || "Outbound email sent with no reply",
        entityType: sent.entityType,
        entityId: sent.entityId,
      });
    }
  }

  // 3. Coaching opportunities — low-scoring insights
  const lowScoreInsights = await db
    .select()
    .from(coachingInsights)
    .where(
      and(
        eq(coachingInsights.tenantId, tenantId),
        sql`${coachingInsights.score} < 0.5`,
        gte(coachingInsights.createdAt, new Date(Date.now() - 7 * 86400000)),
      ),
    )
    .orderBy(desc(coachingInsights.createdAt))
    .limit(10);

  for (const insight of lowScoreInsights) {
    alerts.push({
      type: "coaching_opportunity",
      severity: (insight.score ?? 0) < 0.3 ? "high" : "medium",
      title: `Coaching: ${insight.category} needs attention`,
      description: insight.summary,
      entityType: insight.entityType,
      entityId: insight.entityId,
    });
  }

  // Sort by severity
  const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
  alerts.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

  return NextResponse.json({
    totalAlerts: alerts.length,
    bySeverity: {
      critical: alerts.filter((a) => a.severity === "critical").length,
      high: alerts.filter((a) => a.severity === "high").length,
      medium: alerts.filter((a) => a.severity === "medium").length,
      low: alerts.filter((a) => a.severity === "low").length,
    },
    alerts: alerts.slice(0, 30),
  });
}
