import { getAuthContext } from "@/lib/auth-utils";
import { db } from "@/db";
import { companies, deals, contacts, activities } from "@/db/schema";
import { and, eq, desc } from "drizzle-orm";

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
    .where(and(eq(companies.id, id), eq(companies.tenantId, authCtx.tenantId)))
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
      .where(and(eq(deals.companyId, id), eq(deals.tenantId, authCtx.tenantId))),
    db
      .select({
        id: contacts.id,
        firstName: contacts.firstName,
        lastName: contacts.lastName,
        email: contacts.email,
        title: contacts.title,
      })
      .from(contacts)
      .where(and(eq(contacts.companyId, id), eq(contacts.tenantId, authCtx.tenantId))),
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
      .where(and(eq(activities.tenantId, authCtx.tenantId), eq(activities.entityType, "company"), eq(activities.entityId, id)))
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
        .where(and(eq(activities.tenantId, authCtx.tenantId), eq(activities.entityType, "contact"), eq(activities.entityId, cId)))
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
