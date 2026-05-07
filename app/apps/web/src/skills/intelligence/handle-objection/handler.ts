import { db } from "@/db";
import { deals, companies, contacts } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { tracedGenerateObject } from "@/lib/ai/traced-ai";
import { anthropic } from "@/lib/ai/ai-provider";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
import { getTenantSettings } from "@/lib/config/tenant-settings";
import { getSkillKnowledge, getDeepConversationContext } from "@/skills/skill-knowledge";
import type { SkillRunOptions } from "@/skills/types";
import type { HandleObjectionInput, HandleObjectionOutput } from "./schema";

function getLLMModel() {
  if (process.env.ANTHROPIC_API_KEY) return anthropic("claude-sonnet-4-6");
  if (process.env.OPENAI_API_KEY) return openai("gpt-4o-mini");
  return null;
}

export async function handleObjectionHandler(
  input: HandleObjectionInput,
  options: SkillRunOptions,
): Promise<HandleObjectionOutput> {
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
    getSkillKnowledge(`objection handling competitive positioning ${input.objection}`, options.tenantId),
    getDeepConversationContext(options.tenantId, {
      dealId: input.dealId,
      companyId: deal.companyId ?? undefined,
      contactIds: deal.contactId ? [deal.contactId] : undefined,
      query: `objection ${input.objection}`,
    }),
  ]);

  const model = getLLMModel();
  if (!model) throw new Error("No LLM API key configured");

  const result = await tracedGenerateObject({
    model,
    schema: z.object({
      category: z.string(),
      acknowledgment: z.string(),
      reframe: z.string(),
      evidence: z.array(z.object({
        type: z.enum(["case_study", "data_point", "testimonial", "comparison"]),
        content: z.string(),
      })),
      talkingPoints: z.array(z.string()),
      suggestedResponse: z.string(),
      followUpQuestion: z.string(),
    }),
    prompt: `You are a senior sales coach helping handle a specific objection. Be empathetic, strategic, and specific.

## Objection
"${input.objection}"
${input.objectionCategory ? `Category: ${input.objectionCategory}` : "Detect the category: pricing, timing, competition, technical, authority, need, or other."}

## Context
- Deal: ${deal.name} (stage: ${deal.stage}, value: ${deal.value ? `$${deal.value}` : "unset"})
- Company: ${company?.name || "unknown"} (${company?.industry || "unknown industry"}, ${company?.size || "unknown size"})
- Contact: ${contact ? [contact.firstName, contact.lastName].filter(Boolean).join(" ") : "unknown"} ${contact?.title ? `(${contact.title})` : ""}
- Our product: ${settings.productDescription || "not specified"}

${knowledgeBlock}

## Conversation History
${conversation.activities || "No prior interactions recorded"}

## Internal Notes
${conversation.notes || "No notes recorded"}

## Related Context (semantic search)
${conversation.semanticResults || "No additional context found"}

## Generate
1. **category**: Classify the objection
2. **acknowledgment**: How to validate their concern (1-2 sentences)
3. **reframe**: How to shift the perspective (1-2 sentences)
4. **evidence**: 2-3 pieces of evidence to support your response (case studies, data, comparisons)
5. **talkingPoints**: 3-4 specific points to make
6. **suggestedResponse**: A full response the rep can use (3-5 sentences, conversational tone)
7. **followUpQuestion**: A question to move the conversation forward after addressing the objection

Use the conversation history to make the response feel contextual, not canned.`,
    _trace: {
      agentId: "skill-handle-objection",
      tenantId: options.tenantId,
    },
  });

  return {
    dealId: input.dealId,
    objection: input.objection,
    category: result.object.category,
    response: {
      acknowledgment: result.object.acknowledgment,
      reframe: result.object.reframe,
      evidence: result.object.evidence,
      talkingPoints: result.object.talkingPoints,
      suggestedResponse: result.object.suggestedResponse,
      followUpQuestion: result.object.followUpQuestion,
    },
  };
}
