import { db } from "@/db";
import { deals, companies, contacts, activities } from "@/db/schema";
import { eq, and, desc, or } from "drizzle-orm";
import { tracedGenerateObject } from "@/lib/traced-ai";
import { anthropic } from "@ai-sdk/anthropic";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
import { getTenantSettings } from "@/lib/tenant-settings";
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

  const [company, contact, settings] = await Promise.all([
    deal.companyId
      ? db.select().from(companies).where(eq(companies.id, deal.companyId)).then((r) => r[0] || null)
      : null,
    deal.contactId
      ? db.select().from(contacts).where(eq(contacts.id, deal.contactId)).then((r) => r[0] || null)
      : null,
    getTenantSettings(options.tenantId),
  ]);

  // Get interaction history for context
  const entityFilters = [
    and(eq(activities.entityType, "deal"), eq(activities.entityId, input.dealId)),
  ];
  if (deal.contactId) {
    entityFilters.push(
      and(eq(activities.entityType, "contact"), eq(activities.entityId, deal.contactId)),
    );
  }
  const recentActivities = await db
    .select({ summary: activities.summary, rawContent: activities.rawContent })
    .from(activities)
    .where(and(eq(activities.tenantId, options.tenantId), or(...entityFilters)))
    .orderBy(desc(activities.occurredAt))
    .limit(15);

  const conversationContext = recentActivities
    .map((a) => a.summary || (a.rawContent ? a.rawContent.slice(0, 200) : ""))
    .filter(Boolean)
    .join("\n- ");

  const companyProps = (company?.properties || {}) as Record<string, unknown>;

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
    prompt: `You are a sales professional drafting a commercial proposal. Be persuasive but honest.

## Our Company
- Name: ${settings.onboardingCompanyName || "our company"}
- Product: ${settings.productDescription || "not specified"}

## Prospect
- Company: ${company?.name || "unknown"}
- Industry: ${company?.industry || "unknown"}
- Size: ${company?.size || "unknown"}
- Revenue: ${company?.revenue || "unknown"}
- Description: ${company?.description || "unknown"}
- Technologies: ${Array.isArray(companyProps.technologies) ? companyProps.technologies.join(", ") : "unknown"}

## Deal
- Name: ${deal.name}
- Stage: ${deal.stage}
- Value: ${deal.value ? `$${deal.value}` : "to be determined"}
- Contact: ${contact ? [contact.firstName, contact.lastName].filter(Boolean).join(" ") : "unknown"} ${contact?.title ? `(${contact.title})` : ""}

## Conversation History
- ${conversationContext || "No prior interactions recorded"}

## Generate
1. **Executive summary**: 2-3 sentences capturing the value proposition for THIS specific prospect
2. **Problem statement**: What challenge they face (inferred from conversations + company profile)
3. **Proposed solution**: Overview, 4-6 key capabilities relevant to them, 3 differentiators
4. **Implementation plan**: 2-4 realistic phases with activities
${input.includePricing !== false ? "5. **Pricing**: Based on deal value, propose 2-3 tiers" : "5. Skip pricing (not requested)"}
6. **Next steps**: 3-4 concrete actions to move forward
7. **Closing statement**: Compelling close

Reference specific things from the conversation history. Make the proposal feel custom, not template-driven.`,
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
