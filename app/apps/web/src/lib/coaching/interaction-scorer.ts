/**
 * Post-Interaction Scorer (C5/C7)
 *
 * Evaluates a completed interaction (email sent, meeting held, call done)
 * and generates coaching feedback. Used by the coaching engine after
 * email sync and meeting transcript processing.
 */

import { tracedGenerateObject } from "@/lib/traced-ai";
import { anthropic } from "@ai-sdk/anthropic";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";

// ── Schema ───────────────────────────────────────────────

export const interactionScoreSchema = z.object({
  overallScore: z.number().min(0).max(1),
  category: z.string(), // "tone" | "completeness" | "objection_handling" | "next_step" | "process_adherence"
  strengths: z.array(z.string()),
  improvements: z.array(z.string()),
  coachingAdvice: z.string(),
  suggestedFollowUp: z.string().optional(),
});

export type InteractionScore = z.infer<typeof interactionScoreSchema>;

// ── Types ────────────────────────────────────────────────

export interface InteractionContext {
  interactionType: "email_sent" | "email_received" | "meeting_completed" | "call_completed";
  content: string; // Email body or transcript excerpt
  subject?: string;
  dealName?: string;
  dealStage?: string;
  contactName?: string;
  contactTitle?: string;
  direction?: "inbound" | "outbound";
  sentiment?: string;
  previousInteractionSummaries: string[];
}

// ── Scorer ───────────────────────────────────────────────

function getLLMModel() {
  if (process.env.ANTHROPIC_API_KEY) return anthropic("claude-sonnet-4-6");
  if (process.env.OPENAI_API_KEY) return openai("gpt-4o-mini");
  return null;
}

export async function scoreInteraction(
  ctx: InteractionContext,
  tenantId: string,
): Promise<InteractionScore> {
  const model = getLLMModel();
  if (!model) throw new Error("No LLM API key configured");

  const isOutbound = ctx.direction === "outbound" || ctx.interactionType === "email_sent";

  const result = await tracedGenerateObject({
    model,
    schema: interactionScoreSchema,
    prompt: `You are a sales coach evaluating a ${isOutbound ? "outbound" : "inbound"} ${ctx.interactionType.replace("_", " ")}. Provide coaching feedback.

## Interaction
Type: ${ctx.interactionType}
${ctx.subject ? `Subject: ${ctx.subject}` : ""}
Direction: ${ctx.direction || "unknown"}
Sentiment: ${ctx.sentiment || "unknown"}

Content:
${ctx.content.slice(0, 2000)}

## Context
- Deal: ${ctx.dealName || "unknown"} (stage: ${ctx.dealStage || "unknown"})
- Contact: ${ctx.contactName || "unknown"} ${ctx.contactTitle ? `(${ctx.contactTitle})` : ""}

## Previous Interactions
${ctx.previousInteractionSummaries.length > 0 ? ctx.previousInteractionSummaries.map((s) => `- ${s}`).join("\n") : "None recorded"}

## Evaluation (for ${isOutbound ? "our outbound" : "their response"})

${isOutbound ? `Score this outbound communication:
- Did we set a clear next step?
- Was the tone appropriate for the deal stage?
- Did we address previous conversation points?
- Was the message concise and value-driven?
- Identify the primary coaching category (tone, completeness, objection_handling, next_step, process_adherence)` :
`Score this inbound response and what it tells us:
- What signals does this response give us? (interest, resistance, engagement)
- What should we do next based on their response?
- Are there objections or concerns we need to address?
- Category: what's the main area to focus on for our follow-up`}

Provide 2-3 specific strengths, 1-3 specific improvements, and one actionable coaching tip.`,
    _trace: {
      agentId: "coaching-interaction-scorer",
      tenantId,
    },
  });

  return result.object;
}
