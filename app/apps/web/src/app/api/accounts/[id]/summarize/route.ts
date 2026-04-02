import { getAuthContext } from "@/lib/auth-utils";
import { db } from "@/db";
import { companies, contacts, activities } from "@/db/schema";
import { and, eq, desc } from "drizzle-orm";
import { anthropic } from "@ai-sdk/anthropic";
import { openai } from "@ai-sdk/openai";
import { generateText } from "ai";

/**
 * Auto-generate "Account summary" and "About their business" from
 * conversations + enrichment data. Lightfield-style AI-derived structure.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  try {
    // Fetch account + all related data
    const [company] = await db.select().from(companies)
      .where(and(eq(companies.id, id), eq(companies.tenantId, authCtx.tenantId)))
      .limit(1);

    if (!company) {
      return Response.json({ error: "Account not found" }, { status: 404 });
    }

    const companyContacts = await db.select().from(contacts)
      .where(and(eq(contacts.companyId, id), eq(contacts.tenantId, authCtx.tenantId)));

    const companyActivities = await db.select().from(activities)
      .where(and(
        eq(activities.entityId, id),
        eq(activities.entityType, "company"),
        eq(activities.tenantId, authCtx.tenantId),
      ))
      .orderBy(desc(activities.occurredAt))
      .limit(50);

    // Also get activities for contacts at this company
    const contactIds = companyContacts.map((c) => c.id);
    let contactActivities: typeof companyActivities = [];
    if (contactIds.length > 0) {
      contactActivities = await db.select().from(activities)
        .where(and(
          eq(activities.entityType, "contact"),
          eq(activities.tenantId, authCtx.tenantId),
        ))
        .orderBy(desc(activities.occurredAt))
        .limit(50);
      // Filter in JS since IN clause with array is cleaner
      contactActivities = contactActivities.filter((a) => contactIds.includes(a.entityId));
    }

    const allActivities = [...companyActivities, ...contactActivities]
      .sort((a, b) => (b.occurredAt?.getTime() || 0) - (a.occurredAt?.getTime() || 0))
      .slice(0, 30);

    // Build context for AI
    const contextParts = [];
    contextParts.push(`Company: ${company.name}`);
    if (company.domain) contextParts.push(`Domain: ${company.domain}`);
    if (company.industry) contextParts.push(`Industry: ${company.industry}`);
    if (company.size) contextParts.push(`Size: ${company.size}`);
    if (company.revenue) contextParts.push(`Revenue: ${company.revenue}`);

    if (companyContacts.length > 0) {
      contextParts.push(`\nContacts (${companyContacts.length}):`);
      for (const c of companyContacts) {
        contextParts.push(`- ${[c.firstName, c.lastName].filter(Boolean).join(" ")} (${c.title || "unknown title"}) <${c.email || "no email"}>`);
      }
    }

    if (allActivities.length > 0) {
      contextParts.push(`\nInteraction History (${allActivities.length} most recent):`);
      for (const a of allActivities.slice(0, 20)) {
        const date = a.occurredAt?.toISOString().split("T")[0] || "unknown date";
        contextParts.push(`- ${date} ${a.activityType} ${a.direction || ""}: ${a.summary || a.rawContent?.slice(0, 200) || "no details"}`);
      }
    }

    const model = process.env.ANTHROPIC_API_KEY
      ? anthropic("claude-sonnet-4-20250514")
      : process.env.OPENAI_API_KEY
        ? openai("gpt-4o-mini")
        : null;

    if (!model) {
      return Response.json({ error: "No LLM API key configured" }, { status: 400 });
    }

    const { text } = await generateText({
      model,
      system: `You generate concise CRM account summaries. Return ONLY a JSON object with two fields:
- "accountSummary": 1-3 sentences summarizing the relationship status, key contacts met, next steps, and any active opportunities. Reference specific interactions and dates.
- "aboutBusiness": 1-2 sentences describing what the company does, their market position, and any relevant context for a sales conversation.

If there's no interaction history, set accountSummary to null. If there's no enrichment data, set aboutBusiness to null.`,
      prompt: contextParts.join("\n"),
      // @ts-expect-error maxTokens exists in AI SDK but type definition may lag
      maxTokens: 500,
    });

    // Parse AI response
    let summary = null;
    let about = null;
    try {
      const parsed = JSON.parse(text.replace(/```json\n?/g, "").replace(/```/g, "").trim());
      summary = parsed.accountSummary || null;
      about = parsed.aboutBusiness || null;
    } catch {
      // If parsing fails, use the raw text as summary
      summary = text.trim();
    }

    // Store in properties
    const currentProps = (company.properties || {}) as Record<string, unknown>;
    const updatedProps = {
      ...currentProps,
      customFields: {
        ...((currentProps.customFields || {}) as Record<string, unknown>),
        ...(summary ? { accountSummary: summary } : {}),
        ...(about ? { aboutBusiness: about } : {}),
      },
      lastSummarizedAt: new Date().toISOString(),
    };

    await db.update(companies).set({
      properties: updatedProps,
      updatedAt: new Date(),
    }).where(and(eq(companies.id, id), eq(companies.tenantId, authCtx.tenantId)));

    return Response.json({
      accountSummary: summary,
      aboutBusiness: about,
      activitiesUsed: allActivities.length,
      contactsUsed: companyContacts.length,
    });
  } catch (error) {
    console.error("Account summarization failed:", error);
    return Response.json({ error: "Summarization failed" }, { status: 500 });
  }
}
