import { getAuthContext } from "@/lib/auth-utils";
import { db } from "@/db";
import { deals, companies, activities } from "@/db/schema";
import { eq, desc, and } from "drizzle-orm";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const [deal] = await db
    .select()
    .from(deals)
    .where(and(eq(deals.id, id), eq(deals.tenantId, authCtx.tenantId)))
    .limit(1);

  if (!deal) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  // Get company name
  let companyName = null;
  if (deal.companyId) {
    const [company] = await db
      .select({ name: companies.name })
      .from(companies)
      .where(and(eq(companies.id, deal.companyId), eq(companies.tenantId, authCtx.tenantId)))
      .limit(1);
    companyName = company?.name || null;
  }

  // G8: Get activity timeline for this deal
  const timeline = await db
    .select({
      id: activities.id,
      activityType: activities.activityType,
      channel: activities.channel,
      direction: activities.direction,
      summary: activities.summary,
      occurredAt: activities.occurredAt,
    })
    .from(activities)
    .where(and(eq(activities.entityId, id), eq(activities.tenantId, authCtx.tenantId)))
    .orderBy(desc(activities.occurredAt))
    .limit(50);

  return Response.json({
    deal: {
      id: deal.id,
      name: deal.name,
      stage: deal.stage,
      value: deal.value,
      summary: deal.summary,
      expectedCloseDate: deal.expectedCloseDate?.toISOString() || null,
      properties: deal.properties,
      companyName,
      // Y2 — expose updatedAt so the detail page can compute
      // age-in-stage and render a stall banner without a second fetch.
      updatedAt: deal.updatedAt?.toISOString() || null,
    },
    timeline: timeline.map((a) => ({
      id: a.id,
      activityType: a.activityType,
      channel: a.channel,
      direction: a.direction,
      summary: a.summary,
      occurredAt: a.occurredAt?.toISOString() || "",
    })),
  });
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await req.json();

  const [existing] = await db
    .select()
    .from(deals)
    .where(and(eq(deals.id, id), eq(deals.tenantId, authCtx.tenantId)))
    .limit(1);

  if (!existing) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const updates: Record<string, unknown> = {};
  if (body.name !== undefined) updates.name = body.name;
  if (body.stage !== undefined) updates.stage = body.stage;
  if (body.value !== undefined) updates.value = body.value ? parseInt(body.value) : null;
  if (body.summary !== undefined) updates.summary = body.summary;
  if (body.expectedCloseDate !== undefined || body.closeDate !== undefined) {
    const dateStr = body.expectedCloseDate || body.closeDate;
    updates.expectedCloseDate = dateStr ? new Date(dateStr) : null;
  }
  if (body.companyId !== undefined) updates.companyId = body.companyId;
  if (body.contactId !== undefined) updates.contactId = body.contactId;

  if (Object.keys(updates).length === 0) {
    return Response.json({ error: "No fields to update" }, { status: 400 });
  }

  const [updated] = await db
    .update(deals)
    .set(updates)
    .where(and(eq(deals.id, id), eq(deals.tenantId, authCtx.tenantId)))
    .returning();

  return Response.json({ deal: updated });
}
