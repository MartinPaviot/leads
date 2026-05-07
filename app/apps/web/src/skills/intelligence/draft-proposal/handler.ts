import { db } from "@/db";
import { deals, companies } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { tracedGenerateObject } from "@/lib/ai/traced-ai";
import { anthropic } from "@/lib/ai/ai-provider";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
import { getTenantSettings } from "@/lib/config/tenant-settings";
import {
  getSkillKnowledge,
  getDeepConversationContext,
  getCompanyContacts,
} from "@/skills/skill-knowledge";
import type { SkillRunOptions } from "@/skills/types";
import type { DraftProposalInput, DraftProposalOutput } from "./schema";

function getLLMModel() {
  if (process.env.ANTHROPIC_API_KEY) return anthropic("claude-sonnet-4-6");
  if (process.env.OPENAI_API_KEY) return openai("gpt-4o-mini");
  return null;
}

export async function draftProposalHandler(
  input: DraftProposalInput,
  options: SkillRunOptions,
): Promise<DraftProposalOutput> {
  const [deal] = await db
    .select()
    .from(deals)
    .where(and(eq(deals.id, input.dealId), eq(deals.tenantId, options.tenantId)));

  if (!deal) throw new Error(`Deal ${input.dealId} not found`);

  const [company, settings] = await Promise.all([
    deal.companyId
      ? db.select().from(companies).where(eq(companies.id, deal.companyId)).then((r) => r[0] || null)
      : null,
    getTenantSettings(options.tenantId),
  ]);

  const contactIds = deal.contactId ? [deal.contactId] : [];

  // Parallel: knowledge + conversation context + all company contacts
  const [knowledgeBlock, conversation, allContacts] = await Promise.all([
    getSkillKnowledge(
      `commercial proposal pricing positioning terms ${company?.name ?? ""} ${company?.industry ?? ""}`,
      options.tenantId,
    ),
    getDeepConversationContext(options.tenantId, {
      dealId: input.dealId,
      companyId: deal.companyId ?? undefined,
      contactIds,
      query: `${company?.name ?? ""} ${deal.name} proposal requirements budget timeline`,
    }),
    deal.companyId
      ? getCompanyContacts(deal.companyId, options.tenantId)
      : Promise.resolve([]),
  ]);

  const companyProps = (company?.properties || {}) as Record<string, unknown>;

  const stakeholdersBlock = allContacts.length > 0
    ? allContacts.map((c) => `- ${c.name}${c.title ? ` (${c.title})` : ""}${c.email ? ` <${c.email}>` : ""}`).join("\n")
    : "No contacts on file";

  const model = getLLMModel();
  if (!model) throw new Error("No LLM API key configured");

  const proposalSchema = z.object({
    executiveSummary: z.string(),
    problemStatement: z.string(),
    proposedSolution: z.object({
      overview: z.string(),
      keyCapabilities: z.array(z.string()),
      differentiators: z.array(z.string()),
    }),
    implementationPlan: z.object({
      phases: z.array(z.object({ name: z.string(), duration: z.string(), activities: z.array(z.string()) })),
      totalDuration: z.string(),
    }),
    pricing: z.object({
      summary: z.string(),
      tiers: z.array(z.object({ name: z.string(), price: z.string(), includes: z.array(z.string()) })),
    }).optional(),
    nextSteps: z.array(z.string()),
    closingStatement: z.string(),
  });

  const result = await tracedGenerateObject({
    model,
    schema: proposalSchema,
    prompt: `You are a sales professional drafting a commercial proposal. Be persuasive but honest. Ground every claim in the conversation history and knowledge base below.

## Our Company
- Name: ${settings.onboardingCompanyName || "our company"}
- Product: ${settings.productDescription || "not specified"}

${knowledgeBlock}

## Prospect
- Company: ${company?.name || "unknown"}
- Industry: ${company?.industry || "unknown"}
- Size: ${company?.size || "unknown"}
- Revenue: ${company?.revenue || "unknown"}
- Description: ${company?.description || "unknown"}
- Technologies: ${Array.isArray(companyProps.technologies) ? companyProps.technologies.join(", ") : "unknown"}

## Stakeholders
${stakeholdersBlock}

## Deal
- Name: ${deal.name}
- Stage: ${deal.stage}
- Value: ${deal.value ? `$${deal.value}` : "to be determined"}

## Conversation History (emails, meetings, calls)
${conversation.activities || "No prior interactions recorded"}

## Notes
${conversation.notes || "No notes on file"}

## Related Context (semantic search)
${conversation.semanticResults || "No additional context found"}

## Generate
1. **Executive summary**: 2-3 sentences capturing the value proposition for THIS specific prospect. Reference actual conversations.
2. **Problem statement**: What challenge they face (inferred from conversations + company profile). Quote specific things they said.
3. **Proposed solution**: Overview, 4-6 key capabilities relevant to their stated needs, 3 differentiators vs their alternatives.
4. **Implementation plan**: 2-4 realistic phases with activities.
${input.includePricing !== false ? "5. **Pricing**: Use pricing from the Knowledge Base if available. If not, base on deal value and propose 2-3 tiers." : "5. Skip pricing (not requested)"}
6. **Next steps**: 3-4 concrete actions to move forward, referencing specific stakeholders by name.
7. **Closing statement**: Compelling close that ties back to their specific situation.

CRITICAL: Reference specific conversations, dates, names, and quotes from the history. A generic proposal is useless.`,
    _trace: {
      agentId: "skill-draft-proposal",
      tenantId: options.tenantId,
    },
  });

  return {
    dealId: input.dealId,
    dealName: deal.name,
    companyName: company?.name ?? null,
    proposal: result.object,
  };
}
