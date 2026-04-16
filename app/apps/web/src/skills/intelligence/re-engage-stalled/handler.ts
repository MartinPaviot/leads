import { db } from "@/db";
import { deals, companies, contacts, activities } from "@/db/schema";
import { eq, and, desc, or } from "drizzle-orm";
import { tracedGenerateObject } from "@/lib/traced-ai";
import { anthropic } from "@ai-sdk/anthropic";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
import { getTenantSettings } from "@/lib/tenant-settings";
import { ageInStage } from "@/lib/deal-helpers";
import type { SkillRunOptions } from "@/skills/types";
import type { ReEngageStalledInput, ReEngageStalledOutput } from "./schema";

function getLLMModel() {
  if (process.env.ANTHROPIC_API_KEY) return anthropic("claude-sonnet-4-6");
  if (process.env.OPENAI_API_KEY) return openai("gpt-4o-mini");
  return null;
}

export async function reEngageStalledHandler(
  input: ReEngageStalledInput,
  options: SkillRunOptions,
): Promise<ReEngageStalledOutput> {
  const [deal] = await db
    .select()
    .from(deals)
    .where(and(eq(deals.id, input.dealId), eq(deals.tenantId, options.tenantId)));

  if (!deal) throw new Error(`Deal ${input.dealId} not found`);

  const [company, contact, settings] = await Promise.all([
    deal.companyId
      ? db.select().from(companies).where(eq(companies.id, deal.companyId)).then((r) => r[0] || null)
      : null,
    deal.contactId
      ? db.select().from(contacts).where(eq(contacts.id, deal.contactId)).then((r) => r[0] || null)
      : null,
    getTenantSettings(options.tenantId),
  ]);

  // Get last activities
  const entityFilters = [
    and(eq(activities.entityType, "deal"), eq(activities.entityId, input.dealId)),
  ];
  if (deal.contactId) {
    entityFilters.push(
      and(eq(activities.entityType, "contact"), eq(activities.entityId, deal.contactId)),
    );
  }
  const recentActivities = await db
    .select({
      summary: activities.summary,
      rawContent: activities.rawContent,
      occurredAt: activities.occurredAt,
      activityType: activities.activityType,
      direction: activities.direction,
      sentiment: activities.sentiment,
      metadata: activities.metadata,
    })
    .from(activities)
    .where(and(eq(activities.tenantId, options.tenantId), or(...entityFilters)))
    .orderBy(desc(activities.occurredAt))
    .limit(20);

  const lastActivity = recentActivities[0];
  const daysSinceLastActivity = lastActivity?.occurredAt
    ? Math.floor((Date.now() - new Date(lastActivity.occurredAt).getTime()) / 86400000)
    : 30;

  const age = ageInStage(deal.updatedAt, deal.stage);
  const companyProps = (company?.properties || {}) as Record<string, unknown>;

  // Look for any enrichment signals that could be a trigger event
  const triggerSignals: string[] = [];
  if (companyProps.latest_funding_stage) triggerSignals.push(`Recent funding: ${companyProps.latest_funding_stage}`);
  if (Array.isArray(companyProps.signals)) {
    for (const s of companyProps.signals as Array<{ title?: string; relevance?: string }>) {
      if (s.relevance === "high") triggerSignals.push(s.title || "high-relevance signal");
    }
  }

  const conversationHistory = recentActivities
    .map((a) => {
      const date = a.occurredAt?.toISOString().split("T")[0] ?? "";
      const bodySnippet = a.rawContent ? a.rawContent.slice(0, 300) : "";
      return `[${date}] ${a.activityType} (${a.direction ?? "?"}, sentiment: ${a.sentiment ?? "?"}) — ${a.summary || "no summary"}${bodySnippet ? `\n  Excerpt: ${bodySnippet}` : ""}`;
    })
    .join("\n");

  const model = getLLMModel();
  if (!model) throw new Error("No LLM API key configured");

  const result = await tracedGenerateObject({
    model,
    schema: z.object({
      diagnosis: z.string(),
      approach: z.enum(["value_reminder", "new_angle", "executive_sponsor", "breakup", "trigger_event"]),
      reasoning: z.string(),
      emailDraft: z.object({ subject: z.string(), body: z.string() }),
      alternativeAngles: z.array(z.string()),
      escalationPlan: z.string().optional(),
    }),
    prompt: `You are a senior sales strategist helping re-engage a stalled deal. Diagnose why it stalled and propose a specific strategy.

## Deal
- Name: ${deal.name}
- Stage: ${deal.stage}
- Value: ${deal.value ? `$${deal.value}` : "unset"}
- Days in current stage: ${age?.days ?? "unknown"} (${age?.bucket ?? "unknown"})
- Days since last activity: ${daysSinceLastActivity}
- Company: ${company?.name || "unknown"} (${company?.industry || "unknown"}, ${company?.size || "unknown"})
- Contact: ${contact ? [contact.firstName, contact.lastName].filter(Boolean).join(" ") : "unknown"} ${contact?.title ? `(${contact.title})` : ""}
- Our product: ${settings.productDescription || "not specified"}

## Trigger Events / New Signals
${triggerSignals.length > 0 ? triggerSignals.join("\n") : "None detected"}

## Conversation History (most recent first)
${conversationHistory || "No activities recorded"}

## Approaches Available
- **value_reminder**: Remind them of the value + add new proof point
- **new_angle**: Introduce a new use case or angle they haven't considered
- **executive_sponsor**: Go up/around — reach a higher-level stakeholder
- **breakup**: "Closing the file" email to force a response
- **trigger_event**: Reference a new signal (funding, hiring, etc.)

## Generate
1. **diagnosis**: Why did this deal stall? (based on evidence from conversation history)
2. **approach**: Which strategy fits best and why
3. **reasoning**: 2-3 sentences explaining your choice
4. **emailDraft**: A ready-to-send email with subject line. Reference specific past conversations. Tone: ${settings.aiTone || "Direct"}.
5. **alternativeAngles**: 2-3 other things to try if this doesn't work
6. **escalationPlan**: If the contact is unresponsive, who else to contact and how`,
    _trace: {
      agentId: "skill-re-engage-stalled",
      tenantId: options.tenantId,
    },
  });

  return {
    dealId: input.dealId,
    dealName: deal.name,
    companyName: company?.name ?? null,
    daysSinceLastActivity,
    strategy: result.object,
  };
}
