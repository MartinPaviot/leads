import { buildProspectContext, formatContextForPrompt } from "@/lib/context/prospect-context";
import { db } from "@/db";
import { deals } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { tracedGenerateObject } from "@/lib/ai/traced-ai";
import { anthropic } from "@/lib/ai/ai-provider";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
import type { SkillRunOptions } from "@/skills/types";
import type { SalesCallPrepInput, SalesCallPrepOutput } from "./schema";

function getLLMModel() {
  if (process.env.ANTHROPIC_API_KEY) return anthropic("claude-sonnet-4-6");
  if (process.env.OPENAI_API_KEY) return openai("gpt-4o-mini");
  return null;
}

export async function salesCallPrepHandler(
  input: SalesCallPrepInput,
  options: SkillRunOptions,
): Promise<SalesCallPrepOutput> {
  const ctx = await buildProspectContext(input.contactId, options.tenantId);
  if (!ctx) throw new Error(`Could not build prospect context for contact ${input.contactId}`);

  // Get deal context if provided
  let dealContext = "";
  if (input.dealId) {
    const [deal] = await db
      .select()
      .from(deals)
      .where(and(eq(deals.id, input.dealId), eq(deals.tenantId, options.tenantId)));
    if (deal) {
      dealContext = `\n## Deal Context\n- Name: ${deal.name}\n- Stage: ${deal.stage}\n- Value: ${deal.value ? `$${deal.value}` : "unset"}\n- Summary: ${deal.summary || "none"}`;
    }
  }

  const model = getLLMModel();
  if (!model) throw new Error("No LLM API key configured");

  const contextBlock = formatContextForPrompt(ctx);

  const result = await tracedGenerateObject({
    model,
    schema: z.object({
      executiveSummary: z.string(),
      personInsights: z.array(z.string()),
      companyInsights: z.array(z.string()),
      competitiveLandscape: z.string(),
      callStrategy: z.string(),
      openingHook: z.string(),
      discoveryQuestions: z.array(z.string()),
      valuePropositions: z.array(z.string()),
      objectionHandlers: z.array(z.object({
        objection: z.string(),
        response: z.string(),
      })),
      closingMove: z.string(),
    }),
    prompt: `You are preparing a sales rep for a ${input.callType} call. Be specific and tactical.

## Prospect Context
${contextBlock}
${dealContext}

## Call Type: ${input.callType}

Generate a comprehensive call prep:

1. Executive summary (2-3 sentences about who this person is and why they matter)
2. Person insights (3-5 specific things about this person — not generic)
3. Company insights (3-5 specific things about their company)
4. Competitive landscape (who else might they be evaluating?)
5. Call strategy (how should the rep approach this specific call?)
6. Opening hook (a personalized 1-2 sentence opener that shows you did your homework)
7. Discovery questions (5-7 questions tailored to this prospect's situation and call type)
8. Value propositions (3-4 value props mapped to their specific needs/signals)
9. Objection handlers (3-4 likely objections with ready responses)
10. Closing move (specific next step to propose at the end)

Everything must be based on ACTUAL data from the context. No generic advice.`,
    _trace: {
      agentId: "skill-sales-call-prep",
      tenantId: options.tenantId,
    },
  });

  return {
    contactId: input.contactId,
    contactName: ctx.contact.fullName,
    companyName: ctx.company?.name ?? null,
    callType: input.callType,
    prep: result.object,
  };
}
