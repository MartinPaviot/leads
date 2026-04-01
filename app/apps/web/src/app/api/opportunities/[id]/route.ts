import { auth } from "@/auth";
import { db } from "@/db";
import { deals, companies, activities } from "@/db/schema";
import { eq, desc } from "drizzle-orm";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const [deal] = await db
    .select()
    .from(deals)
    .where(eq(deals.id, id))
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
      .where(eq(companies.id, deal.companyId))
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
    .where(eq(activities.entityId, id))
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
