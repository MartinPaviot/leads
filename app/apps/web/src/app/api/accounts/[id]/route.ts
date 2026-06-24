import { getAuthContext } from "@/lib/auth/auth-utils";
import { db } from "@/db";
import { companies, deals, contacts, activities, suppression } from "@/db/schema";
import { and, eq, desc, sql, isNull, or, inArray } from "drizzle-orm";
import { requirePermission } from "@/lib/auth/permissions";
import { logAudit } from "@/lib/infra/audit-log";
import { cascadeSoftDeleteCompany, CASCADE_TYPES, type CascadeType } from "@/lib/accounts/cascade-delete";
import { normalizeDomain } from "@/lib/suppression/suppression";

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

  // Spec 35 — active account/domain-scope suppressions for the read-only badge.
  // Account scope is keyed by identity_key (fallback id); domain scope by the
  // normalized domain. Global (NULL tenant) rows are visible to every workspace.
  const acctKeys = [account.identityKey, account.id].filter((x): x is string => !!x);
  const dom = normalizeDomain(account.domain);
  const supConds = [
    acctKeys.length ? and(eq(suppression.level, "account"), inArray(suppression.value, acctKeys)) : undefined,
    dom ? and(eq(suppression.level, "domain"), eq(suppression.value, dom)) : undefined,
  ].filter(Boolean);
  const accountSuppressions = supConds.length
    ? await db
        .select({
          type: suppression.type,
          level: suppression.level,
          value: suppression.value,
          reason: suppression.reason,
          source: suppression.source,
          createdAt: suppression.createdAt,
        })
        .from(suppression)
        .where(
          and(
            or(isNull(suppression.tenantId), eq(suppression.tenantId, authCtx.tenantId)),
            eq(suppression.status, "active"),
            or(...supConds),
          ),
        )
    : [];

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
      // Spec 35 — reversible targeting state + irreversible suppression badge.
      targetingStatus: account.targetingStatus,
      suppressions: accountSuppressions,
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
  if (body.ownerId !== undefined) updateData.ownerId = body.ownerId || null;

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

  // Optional cascade: also soft-delete selected related sets (the delete
  // modal sends the checked types). Body is absent for a plain account delete.
  const body = (await req.json().catch(() => ({}))) as { cascade?: unknown };
  const cascade: CascadeType[] = Array.isArray(body.cascade)
    ? (body.cascade.filter(
        (t): t is CascadeType => typeof t === "string" && (CASCADE_TYPES as readonly string[]).includes(t),
      ))
    : [];

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

  // Cascade the selected related sets first (soft-delete, recoverable), then
  // the account itself. Without a cascade, only the company row is removed —
  // its contacts/deals keep their rows (may be re-pointed to another account).
  // One shared timestamp for the company AND its cascade so a later restore
  // brings back exactly the set deleted together (symmetric cascade-restore).
  const deletedAt = new Date();
  const cascaded = cascade.length
    ? await cascadeSoftDeleteCompany(authCtx.tenantId, id, cascade, deletedAt)
    : {};

  await db
    .update(companies)
    .set({ deletedAt })
    .where(and(eq(companies.id, id), eq(companies.tenantId, authCtx.tenantId), isNull(companies.deletedAt)));

  await logAudit({
    tenantId: authCtx.tenantId,
    userId: authCtx.appUserId,
    action: "delete",
    entityType: "company",
    entityId: id,
    metadata: { name: existing.name, softDeleted: true, cascaded },
  });

  return Response.json({ success: true, id, cascaded });
}
