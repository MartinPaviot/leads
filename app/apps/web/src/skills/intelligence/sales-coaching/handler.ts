import { db } from "@/db";
import { deals, companies } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { predictDealVelocity } from "@/lib/deals/deal-velocity";
import { tracedGenerateObject } from "@/lib/ai/traced-ai";
import { anthropic } from "@/lib/ai/ai-provider";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
import { getSkillKnowledge, getDeepConversationContext } from "@/skills/skill-knowledge";
import type { SkillRunOptions } from "@/skills/types";
import type { SalesCoachingInput, SalesCoachingOutput } from "./schema";

function getLLMModel() {
  if (process.env.ANTHROPIC_API_KEY) return anthropic("claude-sonnet-4-6");
  if (process.env.OPENAI_API_KEY) return openai("gpt-4o-mini");
  return null;
}

export async function salesCoachingHandler(
  input: SalesCoachingInput,
  options: SkillRunOptions,
): Promise<SalesCoachingOutput> {
  // Fetch deal
  const [deal] = await db
    .select()
    .from(deals)
    .where(and(eq(deals.id, input.dealId), eq(deals.tenantId, options.tenantId)));

  if (!deal) throw new Error(`Deal ${input.dealId} not found`);

  // Fetch company, velocity, deep conversation context, and knowledge in parallel
  const [companyRow, velocity, conversation, knowledgeBlock] = await Promise.all([
    deal.companyId
      ? db.select({ name: companies.name }).from(companies).where(eq(companies.id, deal.companyId)).then((r) => r[0] ?? null)
      : null,
    predictDealVelocity(input.dealId, options.tenantId),
    getDeepConversationContext(options.tenantId, {
      dealId: input.dealId,
      companyId: deal.companyId ?? undefined,
      query: "sales coaching deal progress",
      contentMaxChars: 2000,
    }),
    getSkillKnowledge(`sales methodology coaching objection handling discovery qualification`, options.tenantId),
  ]);

  const companyName = companyRow?.name ?? null;

  // LLM coaching
  const model = getLLMModel();
  if (!model) throw new Error("No LLM API key configured");

  const result = await tracedGenerateObject({
    model,
    schema: z.object({
      dealHealthScore: z.number(),
      diagnosisHeading: z.string(),
      evidenceQuotes: z.array(z.object({
        quote: z.string(),
        context: z.string(),
        sourceType: z.enum(["email", "meeting", "note", "activity"]),
      })),
      strengths: z.array(z.string()),
      weaknesses: z.array(z.string()),
      nextSteps: z.array(z.string()),
      stageAdviceToAdvance: z.string(),
      objectionsToAnticipate: z.array(z.string()),
    }),
    prompt: `You are a tough, senior CRO coaching a founder on a live deal.
Talk like Sam Blond at Brex: direct, confrontational where warranted,
grounded in specific moments from the transcript. No generic advice.
No polite hedging. If something went wrong, name it.

## Deal
- Name: ${deal.name}
- Stage: ${deal.stage}
- Value: ${deal.value ? `$${deal.value}` : "unset"}
- Company: ${companyName || "unknown"}
- Days in current stage: ${velocity.daysInCurrentStage}
- Activity trend: ${velocity.activityTrend}
- Sentiment trend: ${velocity.sentimentTrend}
- Risk: ${velocity.risk}
- Summary: ${deal.summary || "none"}

## Activity transcript (most recent first)
${conversation.activities || "No activities recorded yet."}

## Internal Notes
${conversation.notes || "No notes recorded"}

## Related Context (semantic search)
${conversation.semanticResults || "No additional context found"}

${knowledgeBlock}

## How to respond

1. **diagnosisHeading** — ONE short punchy sentence naming the core problem
   or opportunity, in the voice of a tough sales leader.
   Examples of the tone we want:
     "You Lost Control — This Demo Was About You, Not Their Pain"
     "Time Is Killing This Deal — Book The Next Step Today"
     "They're Ghosting Because You Never Confirmed A Champion"
   If the deal is genuinely healthy, return an empty string.
2. **evidenceQuotes** — 2-4 specific quotes or moments from the transcript
   that ground the diagnosis. Each must include: the verbatim quote or
   paraphrase, one line of context (date/source), and sourceType.
   Never invent quotes. If nothing in the transcript supports a claim,
   don't make the claim.
3. **dealHealthScore** 0-100. Calibrate: 85+ = on track, 60-84 = slowing,
   40-59 = stalled, <40 = at risk.
4. **strengths** — 2-4 specific things going well with evidence.
5. **weaknesses** — 2-4 specific things going wrong with evidence.
   Prefer concrete misses ("no next step confirmed in the Feb 11 call")
   over generic ("engagement is low").
6. **nextSteps** — 3-5 actions. Each starts with a verb. Each has a
   specific owner or time-window. Order by highest-leverage first.
7. **stageAdviceToAdvance** — one paragraph on how to move from
   ${deal.stage} to the next stage given this transcript.
8. **objectionsToAnticipate** — 2-3 objections the rep should preempt
   next touch, derived from painPoints/objections in the transcript
   when available.

Cite specifics. Name dates. Name people. Never generic.`,
    _trace: {
      agentId: "skill-sales-coaching",
      tenantId: options.tenantId,
    },
  });

  return {
    dealId: input.dealId,
    dealName: deal.name,
    stage: deal.stage ?? "unknown",
    value: deal.value ? Number(deal.value) : null,
    companyName,
    coaching: {
      dealHealthScore: result.object.dealHealthScore,
      risk: velocity.risk as "on_track" | "slowing" | "stalled" | "at_risk",
      diagnosisHeading: result.object.diagnosisHeading,
      evidenceQuotes: result.object.evidenceQuotes,
      strengths: result.object.strengths,
      weaknesses: result.object.weaknesses,
      nextSteps: result.object.nextSteps,
      stageAdviceToAdvance: result.object.stageAdviceToAdvance,
      objectionsToAnticipate: result.object.objectionsToAnticipate,
    },
  };
}
