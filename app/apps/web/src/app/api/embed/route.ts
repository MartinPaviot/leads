import { getAuthContext } from "@/lib/auth/auth-utils";
import { checkRateLimit } from "@/lib/infra/rate-limit";
import { db } from "@/db";
import { contacts, companies, activities, deals } from "@/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import {
  embedEntity,
  contactToText,
  companyToText,
  activityToText,
  dealToText,
  cleanupDuplicateEmbeddings,
  getEmbeddingStats,
} from "@/lib/ai/embeddings";

/**
 * GET /api/embed — returns embedding stats and health info
 */
export async function GET() {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const stats = await getEmbeddingStats(authCtx.tenantId);

    // Count CRM entities for coverage calculation
    const companyCnt = await db.select().from(companies).where(and(eq(companies.tenantId, authCtx.tenantId), isNull(companies.deletedAt)));
    const contactCnt = await db.select().from(contacts).where(and(eq(contacts.tenantId, authCtx.tenantId), isNull(contacts.deletedAt)));
    const dealCnt = await db.select().from(deals).where(and(eq(deals.tenantId, authCtx.tenantId), isNull(deals.deletedAt)));
    const activityCnt = await db.select().from(activities).where(and(eq(activities.tenantId, authCtx.tenantId), isNull(activities.deletedAt)));

    const crmCounts = {
      companies: companyCnt.length,
      contacts: contactCnt.length,
      deals: dealCnt.length,
      activities: activityCnt.length,
    };

    const embeddedCounts = stats.byType;
    const coverage = {
      companies: crmCounts.companies > 0
        ? Math.round(((embeddedCounts.company || 0) / crmCounts.companies) * 100)
        : 100,
      contacts: crmCounts.contacts > 0
        ? Math.round(((embeddedCounts.contact || 0) / crmCounts.contacts) * 100)
        : 100,
      deals: crmCounts.deals > 0
        ? Math.round(((embeddedCounts.deal || 0) / crmCounts.deals) * 100)
        : 100,
      activities: crmCounts.activities > 0
        ? Math.round(((embeddedCounts.activity || 0) / crmCounts.activities) * 100)
        : 100,
    };

    return Response.json({
      stats,
      crmCounts,
      coverage,
      healthy: stats.duplicates === 0 && stats.indexType === "hnsw",
    });
  } catch (error) {
    console.error("Stats failed:", error);
    return Response.json({ error: "Failed to get stats" }, { status: 500 });
  }
}

/**
 * POST /api/embed — embed CRM entities
 *
 * Body: { scope: "all" | "contacts" | "companies" | "activities" | "deals" | "cleanup" }
 *
 * scope="cleanup" removes duplicate embeddings without re-embedding.
 * All other scopes re-embed the specified entities (with dedup built in).
 */
export async function POST(req: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rlResponse = await checkRateLimit("bulk", authCtx.userId);
  if (rlResponse) return rlResponse;

  try {
    const body = await req.json();
    const { scope } = body; // "all", "contacts", "companies", "activities", "deals", "cleanup"

    // Cleanup mode: just remove duplicates
    if (scope === "cleanup") {
      const removed = await cleanupDuplicateEmbeddings();
      const stats = await getEmbeddingStats(authCtx.tenantId);
      return Response.json({ success: true, duplicatesRemoved: removed, stats });
    }

    let embedded = 0;
    let skipped = 0;
    const errors: string[] = [];
    const tenantId = authCtx.tenantId;

    // Build company name lookup for enriching contacts and deals
    const allCompanies = await db.select().from(companies).where(and(eq(companies.tenantId, tenantId), isNull(companies.deletedAt)));
    const companyMap = new Map(allCompanies.map((c) => [c.id, c]));

    // Build contact name lookup for enriching deals
    const allContacts = await db.select().from(contacts).where(and(eq(contacts.tenantId, tenantId), isNull(contacts.deletedAt)));
    const contactMap = new Map(allContacts.map((c) => [c.id, c]));

    if (scope === "all" || scope === "contacts") {
      for (const contact of allContacts) {
        try {
          const company = contact.companyId ? companyMap.get(contact.companyId) : null;
          const text = contactToText({
            firstName: contact.firstName,
            lastName: contact.lastName,
            title: contact.title,
            email: contact.email,
            phone: contact.phone,
            properties: contact.properties as Record<string, unknown> | null,
            companyName: company?.name || null,
          });
          if (text.trim()) {
            await embedEntity(tenantId, "contact", contact.id, text);
            embedded++;
          } else {
            skipped++;
          }
        } catch (err) {
          errors.push(`contact:${contact.id}: ${err instanceof Error ? err.message : "unknown"}`);
        }
      }
    }

    if (scope === "all" || scope === "companies") {
      for (const company of allCompanies) {
        try {
          const text = companyToText({
            name: company.name,
            domain: company.domain,
            industry: company.industry,
            revenue: company.revenue,
            size: company.size,
            description: company.description,
          });
          if (text.trim()) {
            await embedEntity(tenantId, "company", company.id, text);
            embedded++;
          } else {
            skipped++;
          }
        } catch (err) {
          errors.push(`company:${company.id}: ${err instanceof Error ? err.message : "unknown"}`);
        }
      }
    }

    if (scope === "all" || scope === "deals") {
      const allDeals = await db.select().from(deals).where(and(eq(deals.tenantId, tenantId), isNull(deals.deletedAt)));
      for (const deal of allDeals) {
        try {
          const company = deal.companyId ? companyMap.get(deal.companyId) : null;
          const contact = deal.contactId ? contactMap.get(deal.contactId) : null;
          const contactName = contact ? [contact.firstName, contact.lastName].filter(Boolean).join(" ") : null;
          const text = dealToText({
            name: deal.name,
            stage: deal.stage,
            value: deal.value,
            currency: deal.currency,
            expectedCloseDate: deal.expectedCloseDate,
            summary: deal.summary,
            companyName: company?.name || null,
            contactName,
          });
          if (text.trim()) {
            await embedEntity(tenantId, "deal", deal.id, text);
            embedded++;
          } else {
            skipped++;
          }
        } catch (err) {
          errors.push(`deal:${deal.id}: ${err instanceof Error ? err.message : "unknown"}`);
        }
      }
    }

    if (scope === "all" || scope === "activities") {
      const allActivities = await db.select().from(activities).where(and(eq(activities.tenantId, tenantId), isNull(activities.deletedAt)));
      for (const activity of allActivities) {
        try {
          const text = activityToText({
            activityType: activity.activityType,
            summary: activity.summary,
            rawContent: activity.rawContent,
            channel: activity.channel,
            direction: activity.direction,
            occurredAt: activity.occurredAt,
          });
          if (text.trim()) {
            await embedEntity(tenantId, "activity", activity.id, text);
            embedded++;
          } else {
            skipped++;
          }
        } catch (err) {
          errors.push(`activity:${activity.id}: ${err instanceof Error ? err.message : "unknown"}`);
        }
      }
    }

    const stats = await getEmbeddingStats(tenantId);

    return Response.json({
      success: true,
      embedded,
      skipped,
      errors: errors.length > 0 ? errors.slice(0, 10) : undefined,
      errorCount: errors.length,
      stats,
    });
  } catch (error) {
    console.error("Embedding failed:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ error: `Embedding failed: ${message}` }, { status: 500 });
  }
}
