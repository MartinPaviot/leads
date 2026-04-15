import { NextResponse } from "next/server";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { db } from "@/db";
import { activities, deals } from "@/db/schema";
import { getAuthContext } from "@/lib/auth-utils";
import { logger } from "@/lib/logger";
import { computeHealthScore } from "@/lib/opportunity-health";

/**
 * GET /api/opportunities/:id/health — Y2.
 *
 * Computes a 0-100 health score from three dimensions:
 *   - engagement: meetings + replies in the last 30 days
 *   - freshness: days since last touchpoint (decays linearly past 7d)
 *   - completeness: whether the deal has a close date, value, contact
 *
 * Returns the score plus the three component scores and a short
 * rationale per component so the UI can show "why 62?". Pure
 * arithmetic — no LLM call.
 */

type RouteCtx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: RouteCtx) {
  const authCtx = await getAuthContext();
  if (!authCtx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  try {
    const [deal] = await db
      .select()
      .from(deals)
      .where(and(eq(deals.id, id), eq(deals.tenantId, authCtx.tenantId)))
      .limit(1);
    if (!deal) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000);
    const [replyCountRow] = await db
      .select({ count: sql<number>`count(*)` })
      .from(activities)
      .where(
        and(
          eq(activities.tenantId, authCtx.tenantId),
          eq(activities.entityType, "deal"),
          eq(activities.entityId, id),
          eq(activities.activityType, "email_replied"),
          gte(activities.occurredAt, thirtyDaysAgo)
        )
      );
    const [meetingCountRow] = await db
      .select({ count: sql<number>`count(*)` })
      .from(activities)
      .where(
        and(
          eq(activities.tenantId, authCtx.tenantId),
          eq(activities.entityType, "deal"),
          eq(activities.entityId, id),
          eq(activities.activityType, "meeting_completed"),
          gte(activities.occurredAt, thirtyDaysAgo)
        )
      );
    const [latest] = await db
      .select({ occurredAt: activities.occurredAt })
      .from(activities)
      .where(
        and(
          eq(activities.tenantId, authCtx.tenantId),
          eq(activities.entityType, "deal"),
          eq(activities.entityId, id)
        )
      )
      .orderBy(desc(activities.occurredAt))
      .limit(1);

    const replies = Number(replyCountRow?.count ?? 0);
    const meetings = Number(meetingCountRow?.count ?? 0);
    const lastTouchAt = latest?.occurredAt ?? null;

    const score = computeHealthScore({
      replies,
      meetings,
      daysSinceLastTouch: lastTouchAt
        ? Math.round((Date.now() - lastTouchAt.getTime()) / 86400000)
        : Number.POSITIVE_INFINITY,
      hasCloseDate: !!deal.expectedCloseDate,
      hasValue: !!deal.value,
      hasContact: !!deal.contactId,
    });

    return NextResponse.json({
      dealId: id,
      score: score.total,
      band: score.band,
      components: score.components,
    });
  } catch (err) {
    logger.error("opps: health failed", { err, dealId: id });
    return NextResponse.json(
      { error: "Failed to compute health." },
      { status: 500 }
    );
  }
}

// `computeHealthScore` + its types live in `@/lib/opportunity-health`
// so tests can import them without the `@/auth` graph pulling next-auth
// into vitest's module loader.
