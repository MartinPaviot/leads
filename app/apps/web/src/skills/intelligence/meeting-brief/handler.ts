import { buildProspectContext, formatContextForPrompt } from "@/lib/context/prospect-context";
import { getSkillKnowledge } from "@/skills/skill-knowledge";
import { tracedGenerateObject } from "@/lib/ai/traced-ai";
import { anthropic } from "@/lib/ai/ai-provider";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
import type { SkillRunOptions } from "@/skills/types";
import type { MeetingBriefInput, MeetingBriefOutput } from "./schema";

function getLLMModel() {
  if (process.env.ANTHROPIC_API_KEY) return anthropic("claude-sonnet-4-6");
  if (process.env.OPENAI_API_KEY) return openai("gpt-4o-mini");
  return null;
}

export async function meetingBriefHandler(
  input: MeetingBriefInput,
  options: SkillRunOptions,
): Promise<MeetingBriefOutput> {
  const [ctx, knowledgeBlock] = await Promise.all([
    buildProspectContext(input.contactId, options.tenantId),
    getSkillKnowledge(`meeting preparation competitive positioning objection handling`, options.tenantId),
  ]);
  if (!ctx) throw new Error(`Could not build prospect context for contact ${input.contactId}`);

  const model = getLLMModel();
  if (!model) throw new Error("No LLM API key configured");

  const contextBlock = formatContextForPrompt(ctx);

  const result = await tracedGenerateObject({
    model,
    schema: z.object({
      personSummary: z.string(),
      companySummary: z.string(),
      recentActivity: z.string(),
      keySignals: z.array(z.string()),
      talkingPoints: z.array(z.string()),
      potentialObjections: z.array(z.string()),
      questionsToAsk: z.array(z.string()),
    }),
    prompt: `Generate a meeting preparation brief for a sales call.

${input.meetingContext ? `Meeting context: ${input.meetingContext}\n` : ""}

## Prospect Context
${contextBlock}

## Knowledge Context
${knowledgeBlock}

Generate:
1. Person summary: 2-3 sentences about who they are, their role, and why they matter
2. Company summary: 2-3 sentences about the company, its stage, and relevant context
3. Recent activity: What interactions have we had with them recently?
4. Key signals: 3-5 buying signals or notable data points
5. Talking points: 3-5 specific, personalized talking points (not generic)
6. Potential objections: 2-3 likely objections and how to handle them
7. Questions to ask: 3-5 discovery questions tailored to their situation

Be specific — use actual data from the context, not generic advice.`,
    _trace: {
      agentId: "skill-meeting-brief",
      tenantId: options.tenantId,
    },
  });

  return {
    contactId: input.contactId,
    contactName: ctx.contact.fullName,
    companyName: ctx.company?.name ?? null,
    brief: result.object,
  };
}
