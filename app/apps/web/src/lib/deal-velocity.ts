import { db } from "@/db";
import { deals, activities } from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";

interface VelocityResult {
  dealId: string;
  daysInCurrentStage: number;
  avgDaysPerStage: number;
  activityTrend: "increasing" | "stable" | "decreasing";
  sentimentTrend: "improving" | "stable" | "worsening";
  estimatedCloseDate: string | null;
  confidence: "high" | "medium" | "low";
  risk: "on_track" | "slowing" | "stalled";
  reasoning: string;
}

export async function predictDealVelocity(dealId: string, tenantId: string): Promise<VelocityResult> {
  // Fetch deal
  const [deal] = await db
    .select()
    .from(deals)
    .where(and(eq(deals.id, dealId), eq(deals.tenantId, tenantId)))
    .limit(1);

  if (!deal) throw new Error("Deal not found");

  // Days in current stage
  const lastUpdate = deal.updatedAt || deal.createdAt;
  const daysInCurrentStage = Math.floor(
    (Date.now() - new Date(lastUpdate!).getTime()) / (1000 * 60 * 60 * 24)
  );

  // Average days per stage from won deals (benchmark)
  const [wonStats] = await db
    .select({
      avgDays: sql<number>`COALESCE(AVG(EXTRACT(EPOCH FROM (${deals.updatedAt} - ${deals.createdAt})) / 86400), 30)`,
      wonCount: sql<number>`count(*)`,
    })
    .from(deals)
    .where(and(eq(deals.tenantId, tenantId), eq(deals.stage, "won")));

  const wonCount = Number(wonStats?.wonCount || 0);
  // 8 stages in pipeline — estimate avg days per stage from won deal lifecycle
  const totalStages = 8;
  const avgDaysPerStage =
    wonCount > 0
      ? Math.round(Number(wonStats?.avgDays || 30) / totalStages)
      : 30;

  // Activity trend: compare last 14 days vs previous 14 days
  const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
  const twentyEightDaysAgo = new Date(Date.now() - 28 * 24 * 60 * 60 * 1000);

  // Get company ID from deal for activity lookup
  const companyId = deal.companyId;

  const [recentCount] = await db
    .select({ count: sql<number>`count(*)` })
    .from(activities)
    .where(
      and(
        eq(activities.tenantId, tenantId),
        ...(companyId ? [eq(activities.entityId, companyId)] : []),
        sql`${activities.occurredAt} > ${fourteenDaysAgo.toISOString()}::timestamp`
      )
    );

  const [previousCount] = await db
    .select({ count: sql<number>`count(*)` })
    .from(activities)
    .where(
      and(
        eq(activities.tenantId, tenantId),
        ...(companyId ? [eq(activities.entityId, companyId)] : []),
        sql`${activities.occurredAt} > ${twentyEightDaysAgo.toISOString()}::timestamp`,
        sql`${activities.occurredAt} <= ${fourteenDaysAgo.toISOString()}::timestamp`
      )
    );

  const recent = Number(recentCount?.count || 0);
  const previous = Number(previousCount?.count || 0);

  let activityTrend: "increasing" | "stable" | "decreasing";
  if (recent > previous * 1.3) activityTrend = "increasing";
  else if (recent < previous * 0.7) activityTrend = "decreasing";
  else activityTrend = "stable";

  // Sentiment trend: compare recent positive ratio vs previous
  const [recentPositive] = await db
    .select({ count: sql<number>`count(*)` })
    .from(activities)
    .where(
      and(
        eq(activities.tenantId, tenantId),
        ...(companyId ? [eq(activities.entityId, companyId)] : []),
        eq(activities.sentiment, "positive"),
        sql`${activities.occurredAt} > ${fourteenDaysAgo.toISOString()}::timestamp`
      )
    );

  const [previousPositive] = await db
    .select({ count: sql<number>`count(*)` })
    .from(activities)
    .where(
      and(
        eq(activities.tenantId, tenantId),
        ...(companyId ? [eq(activities.entityId, companyId)] : []),
        eq(activities.sentiment, "positive"),
        sql`${activities.occurredAt} > ${twentyEightDaysAgo.toISOString()}::timestamp`,
        sql`${activities.occurredAt} <= ${fourteenDaysAgo.toISOString()}::timestamp`
      )
    );

  const recentPos = Number(recentPositive?.count || 0);
  const previousPos = Number(previousPositive?.count || 0);
  const recentRatio = recent > 0 ? recentPos / recent : 0;
  const previousRatio = previous > 0 ? previousPos / previous : 0;

  let sentimentTrend: "improving" | "stable" | "worsening";
  if (recentRatio > previousRatio + 0.15) sentimentTrend = "improving";
  else if (recentRatio < previousRatio - 0.15) sentimentTrend = "worsening";
  else sentimentTrend = "stable";

  // Risk assessment
  let risk: "on_track" | "slowing" | "stalled";
  if (daysInCurrentStage > avgDaysPerStage * 2) risk = "stalled";
  else if (
    activityTrend === "decreasing" ||
    daysInCurrentStage > avgDaysPerStage * 1.5
  )
    risk = "slowing";
  else risk = "on_track";

  // Velocity factor — adjusts estimated close date based on momentum
  let velocityFactor = 1.0;
  if (activityTrend === "increasing" && sentimentTrend === "improving")
    velocityFactor = 0.8;
  else if (activityTrend === "increasing") velocityFactor = 0.9;
  else if (activityTrend === "decreasing" && sentimentTrend === "worsening")
    velocityFactor = 1.8;
  else if (activityTrend === "decreasing") velocityFactor = 1.5;

  // Estimated remaining stages (simplified: assume 2 remaining stages for active deals)
  const remainingStages = 2;
  const estimatedDaysLeft = Math.round(
    remainingStages * avgDaysPerStage * velocityFactor
  );
  const estimatedCloseDate = new Date(
    Date.now() + estimatedDaysLeft * 24 * 60 * 60 * 1000
  )
    .toISOString()
    .split("T")[0];

  // Confidence based on data quality
  let confidence: "high" | "medium" | "low";
  if (wonCount >= 5 && recent >= 3) confidence = "high";
  else if (wonCount >= 2 || recent >= 2) confidence = "medium";
  else confidence = "low";

  // Human-readable reasoning
  const parts: string[] = [];
  parts.push(
    `${daysInCurrentStage}d in ${deal.stage} stage (avg ${avgDaysPerStage}d)`
  );
  parts.push(
    `Activity ${activityTrend} (${recent} recent vs ${previous} previous)`
  );
  if (sentimentTrend !== "stable")
    parts.push(`Sentiment ${sentimentTrend}`);
  parts.push(`Risk: ${risk}`);

  return {
    dealId,
    daysInCurrentStage,
    avgDaysPerStage,
    activityTrend,
    sentimentTrend,
    estimatedCloseDate,
    confidence,
    risk,
    reasoning: parts.join(". "),
  };
}
