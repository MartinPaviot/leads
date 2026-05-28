import { getAuthContext } from "@/lib/auth/auth-utils";
import { db } from "@/db";
import { activities, outboundEmails } from "@/db/schema";
import { and, eq, gte, count, desc, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";

/**
 * GET /api/dashboard/activity?period=7
 *
 * Returns activity metrics: volume by type, recent activity feed.
 */
export async function GET(req: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url, "http://localhost");
  const periodDays = Math.min(Number(searchParams.get("period") || 7), 90);
  const periodStart = new Date(Date.now() - periodDays * 86400000);

  const { tenantId } = authCtx;

  // Activity counts by type
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
        isNull(activities.deletedAt),
      ),
    )
    .groupBy(activities.activityType);

  // Recent activity feed
  const recentFeed = await db
    .select({
      id: activities.id,
      activityType: activities.activityType,
      channel: activities.channel,
      direction: activities.direction,
      summary: activities.summary,
      occurredAt: activities.occurredAt,
      entityType: activities.entityType,
      entityId: activities.entityId,
      sentiment: activities.sentiment,
    })
    .from(activities)
    .where(
      and(
        eq(activities.tenantId, tenantId),
        gte(activities.occurredAt, periodStart),
        isNull(activities.deletedAt),
      ),
    )
    .orderBy(desc(activities.occurredAt))
    .limit(50);

  // Email response time (avg time between outbound sent and inbound reply)
  const [emailStats] = await db
    .select({
      totalSent: count(),
    })
    .from(outboundEmails)
    .where(
      and(
        eq(outboundEmails.tenantId, tenantId),
        gte(outboundEmails.sentAt, periodStart),
      ),
    );

  return NextResponse.json({
    volumeByType: activityCounts.map((r) => ({
      type: r.type,
      count: Number(r.count),
    })),
    totalActivities: activityCounts.reduce((sum, r) => sum + Number(r.count), 0),
    emailsSent: Number(emailStats?.totalSent ?? 0),
    feed: recentFeed.map((a) => ({
      id: a.id,
      type: a.activityType,
      channel: a.channel,
      direction: a.direction,
      summary: a.summary,
      date: a.occurredAt?.toISOString() ?? null,
      entity: `${a.entityType}:${a.entityId}`,
      sentiment: a.sentiment,
    })),
    periodDays,
  });
}
