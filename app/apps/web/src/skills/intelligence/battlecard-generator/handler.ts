import { enrichOrganization } from "@/lib/integrations/apollo-client";
import { getSkillKnowledge } from "@/skills/skill-knowledge";
import { tracedGenerateObject } from "@/lib/ai/traced-ai";
import { anthropic } from "@/lib/ai/ai-provider";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
import type { SkillRunOptions } from "@/skills/types";
import type { BattlecardGeneratorInput, BattlecardGeneratorOutput } from "./schema";

function getLLMModel() {
  if (process.env.ANTHROPIC_API_KEY) return anthropic("claude-sonnet-4-6");
  if (process.env.OPENAI_API_KEY) return openai("gpt-4o-mini");
  return null;
}

export async function battlecardGeneratorHandler(
  input: BattlecardGeneratorInput,
  options: SkillRunOptions,
): Promise<BattlecardGeneratorOutput> {
  const model = getLLMModel();
  if (!model) throw new Error("No LLM API key configured");

  // Enrich competitor via Apollo + fetch knowledge in parallel
  const [org, knowledgeBlock] = await Promise.all([
    enrichOrganization(input.competitorDomain).catch(() => null),
    getSkillKnowledge(`competitive analysis positioning strengths weaknesses differentiation`, options.tenantId),
  ]);

  const competitorName = input.competitorName || org?.name || input.competitorDomain;

  const competitorContext = org
    ? `Name: ${org.name}\nIndustry: ${org.industry}\nEmployees: ${org.estimated_num_employees}\nRevenue: ${org.annual_revenue_printed}\nFunding: ${org.total_funding_printed} (${org.latest_funding_stage})\nTech: ${org.technology_names?.join(", ")}\nDescription: ${org.description}\nHQ: ${org.city}, ${org.country}`
    : `Domain: ${input.competitorDomain}`;

  const result = await tracedGenerateObject({
    model,
    schema: z.object({
      overview: z.string(),
      strengths: z.array(z.string()),
      weaknesses: z.array(z.string()),
      pricing: z.string(),
      targetMarket: z.string(),
      positioningTraps: z.array(z.object({
        trap: z.string(),
        howToUse: z.string(),
      })),
      objectionHandlers: z.array(z.object({
        objection: z.string(),
        response: z.string(),
      })),
      landmineQuestions: z.array(z.string()),
      winThemes: z.array(z.string()),
      loseThemes: z.array(z.string()),
      differentiators: z.array(z.string()),
    }),
    prompt: `Generate a comprehensive sales battlecard against this competitor.

## Competitor
${competitorContext}

${input.ourProductDescription ? `## Our Product\n${input.ourProductDescription}` : ""}

## Knowledge Context
${knowledgeBlock}

Generate a sales battlecard with:
1. Overview: 2-3 sentence summary of the competitor
2. Strengths: 3-5 things they do well (be honest)
3. Weaknesses: 3-5 areas where they're weak or behind
4. Pricing: What their pricing model looks like
5. Target market: Who they sell to
6. Positioning traps: 2-3 ways to frame the conversation so we win
7. Objection handlers: 3-4 "but they have X" objections and responses
8. Landmine questions: 3-5 questions to ask prospects that expose competitor weaknesses
9. Win themes: 3 scenarios where we typically win against them
10. Lose themes: 2-3 scenarios where we typically lose
11. Differentiators: 3-5 key differences that matter

Be tactical and specific. This is for a sales rep to use in real conversations.`,
    _trace: {
      agentId: "skill-battlecard-generator",
      tenantId: options.tenantId,
    },
  });

  return {
    competitorName,
    competitorDomain: input.competitorDomain,
    battlecard: result.object,
  };
}
