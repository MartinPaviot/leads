import { db } from "@/db";
import { deals, companies, contacts, activities } from "@/db/schema";
import { eq, and, sql, gte, desc } from "drizzle-orm";
import { predictDealVelocity } from "@/lib/deal-velocity";
import { tracedGenerateObject } from "@/lib/traced-ai";
import { anthropic } from "@ai-sdk/anthropic";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
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

  // Fetch company
  let companyName: string | null = null;
  if (deal.companyId) {
    const [company] = await db.select({ name: companies.name }).from(companies).where(eq(companies.id, deal.companyId));
    companyName = company?.name ?? null;
  }

  // Get velocity prediction
  const velocity = await predictDealVelocity(input.dealId, options.tenantId);

  // Get recent activities
  const recentActivities = await db
    .select()
    .from(activities)
    .where(and(
      eq(activities.tenantId, options.tenantId),
      eq(activities.entityId, input.dealId),
      eq(activities.entityType, "deal"),
    ))
    .orderBy(desc(activities.occurredAt))
    .limit(20);

  const activitySummary = recentActivities.map((a) => {
    const meta = a.metadata as Record<string, unknown>;
    return `${a.activityType} (${a.channel}, ${a.direction}) at ${a.occurredAt} — sentiment: ${a.sentiment ?? "unknown"}`;
  }).join("\n");

  // LLM coaching
  const model = getLLMModel();
  if (!model) throw new Error("No LLM API key configured");

  const result = await tracedGenerateObject({
    model,
    schema: z.object({
      dealHealthScore: z.number(),
      strengths: z.array(z.string()),
      weaknesses: z.array(z.string()),
      nextSteps: z.array(z.string()),
      stageAdviceToAdvance: z.string(),
      objectionsToAnticipate: z.array(z.string()),
    }),
    prompt: `You are a senior sales coach analyzing a deal. Be specific and actionable.

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

## Recent Activities (${recentActivities.length})
${activitySummary || "No activities recorded"}

## Analysis Request
1. Health score (0-100) based on engagement, velocity, and sentiment
2. Strengths: What's going well? (2-4 specific items)
3. Weaknesses: What's concerning? (2-4 specific items)
4. Next steps: What should the rep do next? (3-5 specific actions)
5. Stage advice: How to move from ${deal.stage} to the next stage
6. Objections: What objections should they prepare for? (2-3)

Be specific to THIS deal, not generic sales advice.`,
    _trace: {
      agentId: "skill-sales-coaching",
      tenantId: options.tenantId,
    },
  });

  return {
    dealId: input.dealId,
    dealName: deal.name,
    stage: deal.stage,
    value: deal.value ? Number(deal.value) : null,
    companyName,
    coaching: {
      dealHealthScore: result.object.dealHealthScore,
      risk: velocity.risk as "on_track" | "slowing" | "stalled" | "at_risk",
      strengths: result.object.strengths,
      weaknesses: result.object.weaknesses,
      nextSteps: result.object.nextSteps,
      stageAdviceToAdvance: result.object.stageAdviceToAdvance,
      objectionsToAnticipate: result.object.objectionsToAnticipate,
    },
  };
}
