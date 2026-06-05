import { getAuthContext } from "@/lib/auth/auth-utils";
import { db } from "@/db";
import { companies, deals, contacts, activities } from "@/db/schema";
import { and, eq, desc, sql, isNull } from "drizzle-orm";
import { requirePermission } from "@/lib/auth/permissions";
import { softDelete } from "@/lib/infra/soft-delete";
import { logAudit } from "@/lib/infra/audit-log";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const [account] = await db
    .select()
    .from(companies)
    .where(
      and(
        eq(companies.id, id),
        eq(companies.tenantId, authCtx.tenantId),
        isNull(companies.deletedAt),
      ),
    )
    .limit(1);

  if (!account) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  // Fetch deals, contacts, and activities in parallel
  const [accountDeals, accountContacts, accountActivities] = await Promise.all([
    db
      .select({
        id: deals.id,
        name: deals.name,
        stage: deals.stage,
        value: deals.value,
      })
      .from(deals)
      .where(
        and(
          eq(deals.companyId, id),
          eq(deals.tenantId, authCtx.tenantId),
          isNull(deals.deletedAt),
        ),
      ),
    db
      .select({
        id: contacts.id,
        firstName: contacts.firstName,
        lastName: contacts.lastName,
        email: contacts.email,
        title: contacts.title,
      })
      .from(contacts)
      .where(
        and(
          eq(contacts.companyId, id),
          eq(contacts.tenantId, authCtx.tenantId),
          isNull(contacts.deletedAt),
        ),
      ),
    db
      .select({
        id: activities.id,
        activityType: activities.activityType,
        channel: activities.channel,
        direction: activities.direction,
        summary: activities.summary,
        occurredAt: activities.occurredAt,
        entityType: activities.entityType,
        entityId: activities.entityId,
      })
      .from(activities)
      .where(
        and(
          eq(activities.tenantId, authCtx.tenantId),
          eq(activities.entityType, "company"),
          eq(activities.entityId, id),
          isNull(activities.deletedAt),
        ),
      )
      .orderBy(desc(activities.occurredAt))
      .limit(50),
  ]);

  // Also fetch activities for all contacts at this company
  const contactIds = accountContacts.map((c) => c.id);
  let contactActivities: typeof accountActivities = [];
  if (contactIds.length > 0) {
    // Fetch recent activities for contacts at this company
    const allContactActivities = [];
    for (const cId of contactIds.slice(0, 20)) {
      const cActivities = await db
        .select({
          id: activities.id,
          activityType: activities.activityType,
          channel: activities.channel,
          direction: activities.direction,
          summary: activities.summary,
          occurredAt: activities.occurredAt,
          entityType: activities.entityType,
          entityId: activities.entityId,
        })
        .from(activities)
        .where(
          and(
            eq(activities.tenantId, authCtx.tenantId),
            eq(activities.entityType, "contact"),
            eq(activities.entityId, cId),
            isNull(activities.deletedAt),
          ),
        )
        .orderBy(desc(activities.occurredAt))
        .limit(10);
      allContactActivities.push(...cActivities);
    }
    contactActivities = allContactActivities;
  }

  // Merge and sort all activities
  const allActivities = [...accountActivities, ...contactActivities]
    .sort((a, b) => {
      const dateA = a.occurredAt ? new Date(a.occurredAt).getTime() : 0;
      const dateB = b.occurredAt ? new Date(b.occurredAt).getTime() : 0;
      return dateB - dateA;
    })
    .slice(0, 50);

  return Response.json({
    account: {
      id: account.id,
      name: account.name,
      domain: account.domain,
      industry: account.industry,
      size: account.size,
      revenue: account.revenue,
      description: account.description,
      score: account.score,
      scoreReasons: account.scoreReasons,
      properties: account.properties,
    },
    deals: accountDeals,
    contacts: accountContacts,
    timeline: allActivities,
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

  // Verify the account exists and belongs to this tenant
  const [existing] = await db
    .select({ id: companies.id })
    .from(companies)
    .where(
      and(
        eq(companies.id, id),
        eq(companies.tenantId, authCtx.tenantId),
        isNull(companies.deletedAt),
      ),
    )
    .limit(1);

  if (!existing) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const body = await req.json();

  const updateData: Record<string, unknown> = {};
  if (body.name !== undefined) updateData.name = body.name;
  if (body.domain !== undefined) updateData.domain = body.domain;
  if (body.industry !== undefined) updateData.industry = body.industry;
  if (body.size !== undefined) updateData.size = body.size;
  if (body.revenue !== undefined) updateData.revenue = body.revenue;
  if (body.description !== undefined) updateData.description = body.description;
  if (body.score !== undefined) updateData.score = body.score;
  if (body.scoreReasons !== undefined) updateData.scoreReasons = body.scoreReasons;

  if (Object.keys(updateData).length === 0) {
    return Response.json({ error: "No valid fields to update" }, { status: 400 });
  }

  updateData.updatedAt = sql`now()`;

  const [updated] = await db
    .update(companies)
    .set(updateData)
    .where(and(eq(companies.id, id), eq(companies.tenantId, authCtx.tenantId)))
    .returning();

  return Response.json({ account: updated });
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const denied = requirePermission(authCtx.role, "companies:delete");
  if (denied) return denied;

  const { id } = await params;

  // Verify the account exists and belongs to this tenant before deleting.
  const [existing] = await db
    .select({ id: companies.id, name: companies.name })
    .from(companies)
    .where(
      and(
        eq(companies.id, id),
        eq(companies.tenantId, authCtx.tenantId),
        isNull(companies.deletedAt),
      ),
    )
    .limit(1);

  if (!existing) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  // Soft-delete the account itself. Its contacts/deals keep their own
  // rows (they may be re-pointed to another account) — we only remove
  // the company from the Accounts list.
  await softDelete("companies", id, authCtx.tenantId);

  await logAudit({
    tenantId: authCtx.tenantId,
    userId: authCtx.appUserId,
    action: "delete",
    entityType: "company",
    entityId: id,
    metadata: { name: existing.name, softDeleted: true },
  });

  return Response.json({ success: true, id });
}
