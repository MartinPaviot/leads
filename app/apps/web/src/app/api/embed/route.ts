import { getAuthContext } from "@/lib/auth-utils";
import { db } from "@/db";
import { contacts, companies, activities } from "@/db/schema";
import { eq } from "drizzle-orm";
import { embedEntity, contactToText, companyToText, activityToText } from "@/lib/embeddings";

export async function POST(req: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { scope } = body; // "all", "contacts", "companies", "activities"

    let embedded = 0;

    if (scope === "all" || scope === "contacts") {
      const allContacts = await db.select().from(contacts).where(eq(contacts.tenantId, authCtx.tenantId));
      for (const contact of allContacts) {
        const text = contactToText({
          firstName: contact.firstName,
          lastName: contact.lastName,
          title: contact.title,
          email: contact.email,
          phone: contact.phone,
          properties: contact.properties as Record<string, unknown> | null,
          companyName: null,
        });
        if (text.trim()) {
          await embedEntity(authCtx.tenantId, "contact", contact.id, text);
          embedded++;
        }
      }
    }

    if (scope === "all" || scope === "companies") {
      const allCompanies = await db.select().from(companies).where(eq(companies.tenantId, authCtx.tenantId));
      for (const company of allCompanies) {
        const text = companyToText({
          name: company.name,
          domain: company.domain,
          industry: company.industry,
          revenue: company.revenue,
          size: company.size,
          description: company.description,
        });
        if (text.trim()) {
          await embedEntity(authCtx.tenantId, "company", company.id, text);
          embedded++;
        }
      }
    }

    if (scope === "all" || scope === "activities") {
      const allActivities = await db.select().from(activities).where(eq(activities.tenantId, authCtx.tenantId));
      for (const activity of allActivities) {
        const text = activityToText({
          activityType: activity.activityType,
          summary: activity.summary,
          rawContent: activity.rawContent,
          channel: activity.channel,
          direction: activity.direction,
          occurredAt: activity.occurredAt,
        });
        if (text.trim()) {
          await embedEntity(authCtx.tenantId, "activity", activity.id, text);
          embedded++;
        }
      }
    }

    return Response.json({ success: true, embedded });
  } catch (error) {
    console.error("Embedding failed:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ error: `Embedding failed: ${message}` }, { status: 500 });
  }
}
