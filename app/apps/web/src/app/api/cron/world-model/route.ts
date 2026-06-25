import { db } from "@/db";
import { activities, companies, contacts, deals, tenants, knowledgeEntries, users } from "@/db/schema";
import { eq, desc, sql, gte, and } from "drizzle-orm";
import { createHash } from "crypto";
import { verifyCronRequest } from "@/lib/auth/cron-auth";
import { embedKnowledgeEntry } from "@/lib/knowledge/retrieval";
import { isFeatureEnabled } from "@/lib/config/feature-gate";

/**
 * World Model Generator — analyzes accumulated interactions to auto-build
 * knowledge about the business. Runs as a cron job or on-demand.
 *
 * Extracts: product positioning, common objections, competitor mentions,
 * buyer personas, deal patterns, communication style.
 */
export async function GET(req: Request) {
  const unauthorized = verifyCronRequest(req);
  if (unauthorized) return unauthorized;

  if (!isFeatureEnabled(process.env.WORLD_MODEL_ENABLED)) {
    return Response.json({ skipped: "WORLD_MODEL_ENABLED=off" });
  }

  // Also support per-tenant generation via query param
  const url = new URL(req.url);
  const targetTenantId = url.searchParams.get("tenantId");

  try {
    const allTenants = targetTenantId
      ? await db.select().from(tenants).where(eq(tenants.id, targetTenantId))
      : await db.select().from(tenants);

    const results = [];

    for (const tenant of allTenants) {
      const result = await generateWorldModel(tenant.id);
      results.push({ tenantId: tenant.id, ...result });
    }

    return Response.json({ success: true, results });
  } catch (error) {
    return Response.json({ error: String(error) }, { status: 500 });
  }
}

// Also allow POST for manual trigger with auth
export async function POST(req: Request) {
  // Import auth at call time to avoid circular deps
  const { getAuthContext } = await import("@/lib/auth/auth-utils");
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await generateWorldModel(authCtx.tenantId);
  return Response.json(result);
}

async function generateWorldModel(tenantId: string) {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  // Gather data for analysis
  const [
    recentActivities,
    allCompanies,
    allDeals,
    allContacts,
  ] = await Promise.all([
    db.select({
      activityType: activities.activityType,
      summary: activities.summary,
      metadata: activities.metadata,
      channel: activities.channel,
      direction: activities.direction,
      occurredAt: activities.occurredAt,
    }).from(activities)
      .where(eq(activities.tenantId, tenantId))
      .orderBy(desc(activities.occurredAt))
      .limit(200),

    db.select({
      name: companies.name,
      industry: companies.industry,
      size: companies.size,
      score: companies.score,
      properties: companies.properties,
    }).from(companies)
      .where(eq(companies.tenantId, tenantId)),

    db.select({
      name: deals.name,
      stage: deals.stage,
      value: deals.value,
    }).from(deals)
      .where(eq(deals.tenantId, tenantId)),

    db.select({ count: sql<number>`count(*)` }).from(contacts)
      .where(eq(contacts.tenantId, tenantId)),
  ]);

  // Extract email bodies for content analysis
  const emailBodies = recentActivities
    .filter((a) => a.activityType === "email_sent" || a.activityType === "email_received")
    .map((a) => {
      const meta = (a.metadata || {}) as Record<string, unknown>;
      return (meta.body as string)?.slice(0, 500) || (meta.snippet as string) || a.summary || "";
    })
    .filter(Boolean)
    .slice(0, 50);

  // Build world model topics using LLM
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;

  if (!anthropicKey && !openaiKey) {
    return { error: "No LLM API key configured", topics: [] };
  }

  // Prepare context summary for the LLM
  const industries = [...new Set(allCompanies.map((c) => c.industry).filter(Boolean))];
  const sizes = [...new Set(allCompanies.map((c) => c.size).filter(Boolean))];
  const dealStages = allDeals.reduce((acc, d) => {
    const stage = d.stage || "unknown";
    acc[stage] = (acc[stage] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  const totalPipelineValue = allDeals.reduce((sum, d) => sum + (d.value || 0), 0);

  const analysisPrompt = `Analyze this CRM data and generate a "world model" — a structured understanding of this business. Output JSON with an array of knowledge topics.

## CRM Stats
- ${allCompanies.length} accounts across industries: ${industries.join(", ") || "unknown"}
- Company sizes: ${sizes.join(", ") || "unknown"}
- ${allContacts[0]?.count || 0} contacts
- ${allDeals.length} deals (pipeline value: $${totalPipelineValue.toLocaleString()})
- Deal stages: ${JSON.stringify(dealStages)}
- ${recentActivities.length} recent activities

## Recent email content samples (for tone/topic analysis)
${emailBodies.slice(0, 20).map((b, i) => `${i + 1}. ${b.slice(0, 300)}`).join("\n")}

## Activity patterns
- Emails sent: ${recentActivities.filter((a) => a.activityType === "email_sent").length}
- Emails received: ${recentActivities.filter((a) => a.activityType === "email_received").length}
- Meetings: ${recentActivities.filter((a) => a.activityType === "meeting_completed" || a.activityType === "meeting_scheduled").length}

Generate 3-7 knowledge topics covering:
1. **ICP Profile** — who are the ideal customers based on the accounts in the CRM
2. **Product Positioning** — what the business seems to sell/do based on emails
3. **Common Objections** — patterns of pushback seen in emails
4. **Deal Patterns** — what makes deals progress or stall
5. **Buyer Personas** — types of contacts and their roles
6. **Competitive Landscape** — any competitors mentioned
7. **Communication Style** — tone and approach used in outreach

Only include topics where you have sufficient data. Skip topics with no evidence.

Return JSON: { "topics": [{ "topic": "title", "content": "detailed insight (2-4 sentences)" }] }`;

  try {
    let topics: Array<{ topic: string; content: string }> = [];

    if (anthropicKey) {
      const { anthropic } = await import("@ai-sdk/anthropic");
      const { tracedGenerateText } = await import("@/lib/ai/traced-ai");
      const result = await tracedGenerateText({
        model: anthropic("claude-sonnet-4-6"),
        prompt: analysisPrompt,
        _trace: { agentId: "world-model", tenantId },
      });
      const parsed = JSON.parse(result.text.replace(/```json\n?/g, "").replace(/```\n?/g, ""));
      topics = parsed.topics || [];
    } else if (openaiKey) {
      const { openai } = await import("@ai-sdk/openai");
      const { tracedGenerateText } = await import("@/lib/ai/traced-ai");
      const result = await tracedGenerateText({
        model: openai("gpt-4o-mini"),
        prompt: analysisPrompt,
        _trace: { agentId: "world-model", tenantId },
      });
      const parsed = JSON.parse(result.text.replace(/```json\n?/g, "").replace(/```\n?/g, ""));
      topics = parsed.topics || [];
    }

    if (topics.length === 0) {
      return { success: true, message: "Not enough data to generate world model", topics: [] };
    }

    // Find a user ID for createdBy (FK constraint on knowledge_entries)
    const [tenantUser] = await db
      .select({ clerkId: users.clerkId })
      .from(users)
      .where(eq(users.tenantId, tenantId))
      .limit(1);
    const createdBy = tenantUser?.clerkId ?? "system";

    // Deactivate old auto-generated knowledge entries (category "world-model")
    await db
      .update(knowledgeEntries)
      .set({ isActive: false, updatedAt: new Date() })
      .where(
        and(
          eq(knowledgeEntries.tenantId, tenantId),
          eq(knowledgeEntries.category, "world-model"),
          eq(knowledgeEntries.isActive, true),
        ),
      );

    // Insert new auto-generated topics into knowledge_entries table
    let created = 0;
    for (const t of topics) {
      const contentHash = createHash("sha256")
        .update(t.content.trim())
        .digest("hex");

      const [inserted] = await db
        .insert(knowledgeEntries)
        .values({
          tenantId,
          createdBy,
          scope: "workspace",
          title: t.topic,
          category: "world-model",
          content: t.content.trim(),
          contentHash,
        })
        .returning();

      if (inserted) {
        embedKnowledgeEntry(tenantId, inserted.id, inserted.title, inserted.content)
          .catch(() => {});
        created++;
      }
    }

    // Update the worldModelUpdatedAt timestamp in tenant settings
    const [tenant] = await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1);
    const settings = ((tenant?.settings || {}) as Record<string, unknown>);
    await db.update(tenants).set({
      settings: { ...settings, worldModelUpdatedAt: new Date().toISOString() },
    }).where(eq(tenants.id, tenantId));

    return { success: true, topicsGenerated: created, totalTopics: topics.length };
  } catch (error) {
    return { error: `World model generation failed: ${String(error)}`, topics: [] };
  }
}
