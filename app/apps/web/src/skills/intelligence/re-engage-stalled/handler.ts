import { db } from "@/db";
import { deals, companies, contacts, activities } from "@/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { tracedGenerateObject } from "@/lib/ai/traced-ai";
import { anthropic } from "@/lib/ai/ai-provider";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
import { getTenantSettings } from "@/lib/config/tenant-settings";
import { getSkillKnowledge, getDeepConversationContext } from "@/skills/skill-knowledge";
import { ageInStage } from "@/lib/deals/deal-helpers";
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

  const [company, contact, settings, knowledgeBlock, conversation] = await Promise.all([
    deal.companyId
      ? db.select().from(companies).where(eq(companies.id, deal.companyId)).then((r) => r[0] || null)
      : null,
    deal.contactId
      ? db.select().from(contacts).where(eq(contacts.id, deal.contactId)).then((r) => r[0] || null)
      : null,
    getTenantSettings(options.tenantId),
    getSkillKnowledge(`re-engage stalled deal objection handling value proposition`, options.tenantId),
    getDeepConversationContext(options.tenantId, {
      dealId: input.dealId,
      companyId: deal.companyId ?? undefined,
      contactIds: deal.contactId ? [deal.contactId] : undefined,
      query: "re-engage stalled deal reasons",
    }),
  ]);

  // Compute days since last activity from the deep-context activities text
  // Fall back to a simple DB query for the single latest activity date
  const [lastActRow] = await db
    .select({ occurredAt: activities.occurredAt })
    .from(activities)
    .where(and(
      eq(activities.tenantId, options.tenantId),
      eq(activities.entityId, input.dealId),
      eq(activities.entityType, "deal"),
    ))
    .orderBy(desc(activities.occurredAt))
    .limit(1);
  const daysSinceLastActivity = lastActRow?.occurredAt
    ? Math.floor((Date.now() - new Date(lastActRow.occurredAt).getTime()) / 86400000)
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

  const conversationHistory = conversation.activities;

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

${knowledgeBlock}

## Trigger Events / New Signals
${triggerSignals.length > 0 ? triggerSignals.join("\n") : "None detected"}

## Conversation History (most recent first)
${conversationHistory || "No activities recorded"}

## Internal Notes
${conversation.notes || "No notes recorded"}

## Related Context (semantic search)
${conversation.semanticResults || "No additional context found"}

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
