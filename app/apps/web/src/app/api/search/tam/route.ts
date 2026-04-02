import { getAuthContext } from "@/lib/auth-utils";
import { searchSimilar } from "@/lib/embeddings";
import { db } from "@/db";
import { companies, contacts, deals } from "@/db/schema";
import { and, eq, inArray } from "drizzle-orm";

export async function POST(req: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { query, entityType, limit } = body;

    if (!query || typeof query !== "string" || query.trim().length === 0) {
      return Response.json({ error: "Query is required" }, { status: 400 });
    }

    const searchLimit = Math.min(limit || 20, 50);
    const rawResults = await searchSimilar(query.trim(), searchLimit, authCtx.tenantId);

    // Filter by entity type if specified
    const filtered = entityType
      ? rawResults.filter((r) => r.entityType === entityType)
      : rawResults;

    // Batch hydrate results by entity type to avoid N+1 queries
    const companyIds = filtered.filter((r) => r.entityType === "company").map((r) => r.entityId);
    const contactIds = filtered.filter((r) => r.entityType === "contact").map((r) => r.entityId);
    const dealIds = filtered.filter((r) => r.entityType === "deal").map((r) => r.entityId);

    const [companyRows, contactRows, dealRows] = await Promise.all([
      companyIds.length > 0
        ? db.select().from(companies).where(and(eq(companies.tenantId, authCtx.tenantId), inArray(companies.id, companyIds)))
        : Promise.resolve([]),
      contactIds.length > 0
        ? db.select().from(contacts).where(and(eq(contacts.tenantId, authCtx.tenantId), inArray(contacts.id, contactIds)))
        : Promise.resolve([]),
      dealIds.length > 0
        ? db.select().from(deals).where(and(eq(deals.tenantId, authCtx.tenantId), inArray(deals.id, dealIds)))
        : Promise.resolve([]),
    ]);

    const companyMap = new Map(companyRows.map((c) => [c.id, c]));
    const contactMap = new Map(contactRows.map((c) => [c.id, c]));
    const dealMap = new Map(dealRows.map((d) => [d.id, d]));

    const hydrated = filtered.map((result) => {
      let entity: Record<string, unknown> | null = null;

      if (result.entityType === "company") {
        const c = companyMap.get(result.entityId);
        if (c) entity = { name: c.name, domain: c.domain, industry: c.industry, size: c.size, revenue: c.revenue, score: c.score, description: c.description };
      } else if (result.entityType === "contact") {
        const c = contactMap.get(result.entityId);
        if (c) entity = { name: [c.firstName, c.lastName].filter(Boolean).join(" "), email: c.email, title: c.title, score: c.score };
      } else if (result.entityType === "deal") {
        const d = dealMap.get(result.entityId);
        if (d) entity = { name: d.name, stage: d.stage, value: d.value, score: d.score };
      }

      return {
        entityType: result.entityType,
        entityId: result.entityId,
        content: result.content,
        similarity: result.similarity,
        entity,
      };
    });

    return Response.json({ results: hydrated });
  } catch (error) {
    console.error("TAM search failed:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ error: `Search failed: ${message}` }, { status: 500 });
  }
}
