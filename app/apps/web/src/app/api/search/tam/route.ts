import { auth } from "@/auth";
import { searchSimilar } from "@/lib/embeddings";
import { db } from "@/db";
import { companies, contacts, deals } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { query, entityType, limit } = body;

    if (!query || typeof query !== "string" || query.trim().length === 0) {
      return Response.json({ error: "Query is required" }, { status: 400 });
    }

    const searchLimit = Math.min(limit || 20, 50);
    const rawResults = await searchSimilar(query.trim(), searchLimit);

    // Filter by entity type if specified
    const filtered = entityType
      ? rawResults.filter((r) => r.entityType === entityType)
      : rawResults;

    // Hydrate results with entity data
    const hydrated = await Promise.all(
      filtered.map(async (result) => {
        let entity: Record<string, unknown> | null = null;

        try {
          if (result.entityType === "company") {
            const [company] = await db
              .select()
              .from(companies)
              .where(eq(companies.id, result.entityId))
              .limit(1);
            if (company) {
              entity = {
                name: company.name,
                domain: company.domain,
                industry: company.industry,
                size: company.size,
                revenue: company.revenue,
                score: company.score,
                description: company.description,
              };
            }
          } else if (result.entityType === "contact") {
            const [contact] = await db
              .select()
              .from(contacts)
              .where(eq(contacts.id, result.entityId))
              .limit(1);
            if (contact) {
              entity = {
                name: [contact.firstName, contact.lastName].filter(Boolean).join(" "),
                email: contact.email,
                title: contact.title,
                score: contact.score,
              };
            }
          } else if (result.entityType === "deal") {
            const [deal] = await db
              .select()
              .from(deals)
              .where(eq(deals.id, result.entityId))
              .limit(1);
            if (deal) {
              entity = {
                name: deal.name,
                stage: deal.stage,
                value: deal.value,
                score: deal.score,
              };
            }
          }
        } catch (err) {
          console.warn(`Failed to hydrate ${result.entityType} ${result.entityId}:`, err);
        }

        return {
          entityType: result.entityType,
          entityId: result.entityId,
          content: result.content,
          similarity: result.similarity,
          entity,
        };
      })
    );

    return Response.json({ results: hydrated });
  } catch (error) {
    console.error("TAM search failed:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ error: `Search failed: ${message}` }, { status: 500 });
  }
}
