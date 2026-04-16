/**
 * Performance Aggregator (C7)
 *
 * Aggregates AE performance metrics over a period:
 * - Activity counts (emails, meetings, deals)
 * - Average coaching scores per dimension
 * - Trend detection (improving/declining)
 */

import { db } from "@/db";
import {
  activities,
  deals,
  coachingInsights,
  aePerformanceSnapshots,
  outboundEmails,
} from "@/db/schema";
import { and, eq, gte, lte, sql, desc, count } from "drizzle-orm";

export interface PerformanceMetrics {
  emailsSent: number;
  emailsReplied: number;
  meetingsBooked: number;
  meetingsCompleted: number;
  dealsCreated: number;
  dealsAdvanced: number;
  dealsWon: number;
  dealsLost: number;
  avgToneScore: number | null;
  avgCompletenessScore: number | null;
  avgObjectionHandlingScore: number | null;
  avgProcessAdherenceScore: number | null;
  avgResponseTimeMinutes: number | null;
  winRate: number | null;
  overallScore: number | null;
}

export interface PerformanceTrend {
  metric: string;
  direction: "improving" | "declining" | "stable";
  currentValue: number;
  previousValue: number;
  changePercent: number;
}

/**
 * Aggregate performance metrics for a user over a date range.
 */
export async function aggregatePerformance(
  tenantId: string,
  userId: string,
  periodStart: Date,
  periodEnd: Date,
): Promise<PerformanceMetrics> {
  // Count outbound emails sent
  const [emailStats] = await db
    .select({
      sent: count(),
    })
    .from(outboundEmails)
    .where(
      and(
        eq(outboundEmails.tenantId, tenantId),
        gte(outboundEmails.sentAt, periodStart),
        lte(outboundEmails.sentAt, periodEnd),
      ),
    );

  // Count replies
  const [replyStats] = await db
    .select({
      replied: count(),
    })
    .from(outboundEmails)
    .where(
      and(
        eq(outboundEmails.tenantId, tenantId),
        eq(outboundEmails.status, "replied" as any),
        gte(outboundEmails.sentAt, periodStart),
        lte(outboundEmails.sentAt, periodEnd),
      ),
    );

  // Count activities by type
  const activityCounts = await db
    .select({
      type: activities.activityType,
      count: count(),
    })
    .from(activities)
    .where(
      and(
        eq(activities.tenantId, tenantId),
        gte(activities.occurredAt, periodStart),
        lte(activities.occurredAt, periodEnd),
      ),
    )
    .groupBy(activities.activityType);

  const typeCounts = new Map(activityCounts.map((r) => [r.type, Number(r.count)]));

  // Count deal changes
  const dealStats = await db
    .select({
      stage: deals.stage,
      count: count(),
    })
    .from(deals)
    .where(
      and(
        eq(deals.tenantId, tenantId),
        gte(deals.createdAt, periodStart),
        lte(deals.createdAt, periodEnd),
      ),
    )
    .groupBy(deals.stage);

  const dealCounts = new Map(dealStats.map((r) => [r.stage, Number(r.count)]));

  // Average coaching scores per category
  const coachingAvgs = await db
    .select({
      category: coachingInsights.category,
      avgScore: sql<number>`avg(${coachingInsights.score})`,
    })
    .from(coachingInsights)
    .where(
      and(
        eq(coachingInsights.tenantId, tenantId),
        eq(coachingInsights.userId, userId),
        gte(coachingInsights.createdAt, periodStart),
        lte(coachingInsights.createdAt, periodEnd),
      ),
    )
    .groupBy(coachingInsights.category);

  const scoreMap = new Map(coachingAvgs.map((r) => [r.category, r.avgScore]));

  const won = dealCounts.get("won") ?? 0;
  const lost = dealCounts.get("lost") ?? 0;
  const winRate = won + lost > 0 ? won / (won + lost) : null;

  const toneScore = scoreMap.get("tone") ?? null;
  const completenessScore = scoreMap.get("completeness") ?? null;
  const objectionScore = scoreMap.get("objection_handling") ?? null;
  const processScore = scoreMap.get("process_adherence") ?? null;

  const scores = [toneScore, completenessScore, objectionScore, processScore].filter(
    (s): s is number => s !== null,
  );
  const overallScore = scores.length > 0
    ? scores.reduce((a, b) => a + b, 0) / scores.length
    : null;

  return {
    emailsSent: Number(emailStats?.sent ?? 0),
    emailsReplied: Number(replyStats?.replied ?? 0),
    meetingsBooked: typeCounts.get("meeting_scheduled") ?? 0,
    meetingsCompleted: typeCounts.get("meeting_completed") ?? 0,
    dealsCreated: typeCounts.get("deal_created") ?? 0,
    dealsAdvanced: typeCounts.get("deal_stage_changed") ?? 0,
    dealsWon: won,
    dealsLost: lost,
    avgToneScore: toneScore,
    avgCompletenessScore: completenessScore,
    avgObjectionHandlingScore: objectionScore,
    avgProcessAdherenceScore: processScore,
    avgResponseTimeMinutes: null, // Computed separately if needed
    winRate,
    overallScore,
  };
}

/**
 * Detect trends by comparing current period to previous period.
 */
export async function detectTrends(
  tenantId: string,
  userId: string,
): Promise<PerformanceTrend[]> {
  // Get the two most recent snapshots
  const snapshots = await db
    .select()
    .from(aePerformanceSnapshots)
    .where(
      and(
        eq(aePerformanceSnapshots.tenantId, tenantId),
        eq(aePerformanceSnapshots.userId, userId),
      ),
    )
    .orderBy(desc(aePerformanceSnapshots.periodEnd))
    .limit(2);

  if (snapshots.length < 2) return [];

  const [current, previous] = snapshots;
  const trends: PerformanceTrend[] = [];

  const comparisons: Array<[string, number | null, number | null]> = [
    ["emailsSent", current.emailsSent, previous.emailsSent],
    ["meetingsCompleted", current.meetingsCompleted, previous.meetingsCompleted],
    ["dealsWon", current.dealsWon, previous.dealsWon],
    ["overallScore", current.overallScore, previous.overallScore],
    ["avgToneScore", current.avgToneScore, previous.avgToneScore],
    ["avgCompletenessScore", current.avgCompletenessScore, previous.avgCompletenessScore],
  ];

  for (const [metric, curr, prev] of comparisons) {
    if (curr === null || prev === null) continue;
    const changePercent = prev !== 0 ? ((curr - prev) / prev) * 100 : 0;
    const direction: PerformanceTrend["direction"] =
      changePercent > 5 ? "improving" : changePercent < -5 ? "declining" : "stable";
    trends.push({
      metric,
      direction,
      currentValue: curr,
      previousValue: prev,
      changePercent: Math.round(changePercent * 10) / 10,
    });
  }

  return trends;
}
