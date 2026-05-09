import { getAuthContext } from "@/lib/auth/auth-utils";
import { db } from "@/db";
import { companies, contacts, activities, deals } from "@/db/schema";
import { eq, and, desc, isNull } from "drizzle-orm";
import { exploreGraphAroundEntity } from "@/lib/ai/context-graph";
import { anthropic } from "@/lib/ai/ai-provider";
import { tracedGenerateObject } from "@/lib/ai/traced-ai";
import { z } from "zod";

const briefSchema = z.object({
  brief: z.string().describe("3-sentence intelligence brief about this account"),
  keyRelationships: z.array(z.string()).describe("Key people/entities connected to this account"),
  suggestedAction: z.string().describe("One specific recommended next action"),
});

// Simple in-memory cache (1 hour TTL)
const cache = new Map<string, { data: unknown; expiresAt: number }>();

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authCtx = await getAuthContext();
  if (!authCtx) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const cacheKey = `intel-${authCtx.tenantId}-${id}`;

  // Check cache
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return Response.json(cached.data);
  }

  try {
    // Fetch account
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
      return Response.json({ error: "Account not found" }, { status: 404 });
    }

    // Fetch recent activities
    const recentActivities = await db
      .select({
        summary: activities.summary,
        activityType: activities.activityType,
        occurredAt: activities.occurredAt,
        sentiment: activities.sentiment,
      })
      .from(activities)
      .where(
        and(
          eq(activities.tenantId, authCtx.tenantId),
          eq(activities.entityType, "company"),
          eq(activities.entityId, id),
          isNull(activities.deletedAt),
        )
      )
      .orderBy(desc(activities.occurredAt))
      .limit(10);

    // Fetch contacts at this account
    const accountContacts = await db
      .select({ firstName: contacts.firstName, lastName: contacts.lastName, title: contacts.title })
      .from(contacts)
      .where(
        and(
          eq(contacts.companyId, id),
          eq(contacts.tenantId, authCtx.tenantId),
          isNull(contacts.deletedAt),
        ),
      )
      .limit(10);

    // Fetch deals for this account
    const accountDeals = await db
      .select({ name: deals.name, stage: deals.stage, value: deals.value })
      .from(deals)
      .where(
        and(
          eq(deals.companyId, id),
          eq(deals.tenantId, authCtx.tenantId),
          isNull(deals.deletedAt),
        ),
      )
      .limit(5);

    // Explore context graph
    let graphContext = "";
    try {
      const graph = await exploreGraphAroundEntity(account.name, authCtx.tenantId, 1);
      if (graph.nodes.length > 0 || graph.edges.length > 0) {
        const nodesSummary = graph.nodes.map((n) => `${n.name} (${n.type})`).join(", ");
        const edgesSummary = graph.edges
          .filter((e) => e.valid)
          .slice(0, 5)
          .map((e) => e.fact)
          .join("; ");
        graphContext = `\nGraph connections: ${nodesSummary}\nKey facts: ${edgesSummary}`;
      }
    } catch {
      // Graph might not have data for this entity — that's fine
    }

    // If we have no meaningful data, return a fallback
    if (recentActivities.length === 0 && accountContacts.length === 0 && accountDeals.length === 0 && !graphContext) {
      const fallback = {
        brief: "Not enough data yet. Connect your email or add activities to generate insights.",
        keyRelationships: [],
        suggestedAction: "Enrich this account or add your first interaction.",
      };
      cache.set(cacheKey, { data: fallback, expiresAt: Date.now() + 3600000 });
      return Response.json(fallback);
    }

    // Build context for LLM
    const activitiesSummary = recentActivities
      .map((a) => `[${a.activityType}] ${a.summary || "No summary"}${a.sentiment ? ` (${a.sentiment})` : ""}`)
      .join("\n");

    const contactsSummary = accountContacts
      .map((c) => `${c.firstName || ""} ${c.lastName || ""} — ${c.title || "Unknown role"}`.trim())
      .join(", ");

    const dealsSummary = accountDeals
      .map((d) => `${d.name} (${d.stage}${d.value ? `, $${d.value.toLocaleString()}` : ""})`)
      .join(", ");

    const result = await tracedGenerateObject({
      model: anthropic("claude-haiku-4-5-20251001"),
      schema: briefSchema,
      prompt: `Generate a 3-sentence intelligence brief for the sales account "${account.name}" (${account.industry || "unknown industry"}).

Account data:
- Score: ${account.score || "Not scored"}
- Domain: ${account.domain || "Unknown"}
- Contacts: ${contactsSummary || "None"}
- Deals: ${dealsSummary || "None"}

Recent activities:
${activitiesSummary || "None"}
${graphContext}

Be specific — reference names, dates, and amounts. Focus on: relationship status, key risk or opportunity, and the single most impactful next action.`,
      maxTokens: 250,
      _meta: { tenantId: authCtx.tenantId, feature: "entity-intelligence" },
    });

    const data = result.object;
    cache.set(cacheKey, { data, expiresAt: Date.now() + 3600000 }); // 1h cache
    return Response.json(data);
  } catch (error) {
    console.error("Intelligence brief failed:", error);
    return Response.json({
      brief: "Unable to generate intelligence brief at this time.",
      keyRelationships: [],
      suggestedAction: "Try again later.",
    });
  }
}
