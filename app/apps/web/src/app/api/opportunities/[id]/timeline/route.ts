import { NextResponse } from "next/server";
import { and, desc, eq, or, isNull } from "drizzle-orm";
import { db } from "@/db";
import { activities, deals } from "@/db/schema";
import { getAuthContext } from "@/lib/auth/auth-utils";
import { logger } from "@/lib/observability/logger";
import { buildNarrative } from "@/lib/deals/opportunity-health";

/**
 * GET /api/opportunities/:id/timeline — Y1.
 *
 * Pulls every activity tied to the deal OR to its primary contact/company
 * and returns both the raw rows and a narrative summary keyed off the
 * activity type. The narrative is a short human sentence ("Emailed
 * Alice 5 days ago · last reply was warm") — deliberately templated
 * rather than LLM-generated so the endpoint stays cheap to call and
 * the output is deterministic for testing.
 */

type RouteCtx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: RouteCtx) {
  const authCtx = await getAuthContext();
  if (!authCtx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  try {
    // Load the deal so we can cross-reference its contact + company.
    const [deal] = await db
      .select()
      .from(deals)
      .where(and(eq(deals.id, id), eq(deals.tenantId, authCtx.tenantId), isNull(deals.deletedAt)))
      .limit(1);
    if (!deal) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const rows = await db
      .select({
        id: activities.id,
        type: activities.activityType,
        summary: activities.summary,
        direction: activities.direction,
        sentiment: activities.sentiment,
        occurredAt: activities.occurredAt,
        entityType: activities.entityType,
        entityId: activities.entityId,
      })
      .from(activities)
      .where(
        and(
          eq(activities.tenantId, authCtx.tenantId),
          isNull(activities.deletedAt),
          or(
            and(
              eq(activities.entityType, "deal"),
              eq(activities.entityId, id)
            ),
            deal.contactId
              ? and(
                  eq(activities.entityType, "contact"),
                  eq(activities.entityId, deal.contactId)
                )
              : undefined,
            deal.companyId
              ? and(
                  eq(activities.entityType, "company"),
                  eq(activities.entityId, deal.companyId)
                )
              : undefined
          )
        )
      )
      .orderBy(desc(activities.occurredAt))
      .limit(100);

    const narrative = buildNarrative(rows);

    return NextResponse.json({
      dealId: id,
      narrative,
      timeline: rows,
    });
  } catch (err) {
    logger.error("opps: timeline failed", { err, dealId: id });
    return NextResponse.json(
      { error: "Failed to build timeline." },
      { status: 500 }
    );
  }
}

