/**
 * Pre-Send Email Review (C5)
 *
 * Analyzes an outgoing email draft on 5 dimensions:
 * 1. Tone — appropriate for deal stage + buyer persona?
 * 2. Completeness — addresses all open items?
 * 3. Objection handling — tackles known objections?
 * 4. Next step — clear call to action?
 * 5. Process adherence — follows the defined methodology?
 *
 * Returns a structured score + coaching advice.
 */

import { tracedGenerateObject } from "@/lib/traced-ai";
import { anthropic } from "@ai-sdk/anthropic";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";

// ── Schema ───────────────────────────────────────────────

export const coachingScoreSchema = z.object({
  dimensions: z.object({
    tone: z.object({
      score: z.number().min(0).max(1),
      feedback: z.string(),
      suggestion: z.string().optional(),
    }),
    completeness: z.object({
      score: z.number().min(0).max(1),
      feedback: z.string(),
      missingItems: z.array(z.string()),
    }),
    objectionHandling: z.object({
      score: z.number().min(0).max(1),
      feedback: z.string(),
      unaddressedObjections: z.array(z.string()),
    }),
    nextStep: z.object({
      score: z.number().min(0).max(1),
      feedback: z.string(),
    }),
    processAdherence: z.object({
      score: z.number().min(0).max(1),
      feedback: z.string(),
      skippedSteps: z.array(z.string()),
    }),
  }),
  overallScore: z.number().min(0).max(1),
  verdict: z.enum(["send", "review", "revise"]),
  topSuggestion: z.string().optional(),
});

export type CoachingScore = z.infer<typeof coachingScoreSchema>;

// ── Context types ────────────────────────────────────────

export interface PreSendContext {
  emailSubject: string;
  emailBody: string;
  dealName?: string;
  dealStage?: string;
  dealValue?: number;
  contactName?: string;
  contactTitle?: string;
  companyName?: string;
  knownObjections: string[];
  pendingNextSteps: string[];
  recentInteractionSummaries: string[];
  salesProcessStage?: string;
}

// ── Review function ──────────────────────────────────────

function getLLMModel() {
  if (process.env.ANTHROPIC_API_KEY) return anthropic("claude-sonnet-4-6");
  if (process.env.OPENAI_API_KEY) return openai("gpt-4o-mini");
  return null;
}

export async function reviewEmail(
  ctx: PreSendContext,
  tenantId: string,
  scoreThreshold = 0.6,
): Promise<CoachingScore> {
  const model = getLLMModel();
  if (!model) throw new Error("No LLM API key configured");

  const objectionSection = ctx.knownObjections.length > 0
    ? `Known objections to address:\n${ctx.knownObjections.map((o) => `- ${o}`).join("\n")}`
    : "No known objections recorded.";

  const nextStepSection = ctx.pendingNextSteps.length > 0
    ? `Pending next steps:\n${ctx.pendingNextSteps.map((ns) => `- ${ns}`).join("\n")}`
    : "No pending next steps recorded.";

  const historySection = ctx.recentInteractionSummaries.length > 0
    ? `Recent interactions:\n${ctx.recentInteractionSummaries.map((s) => `- ${s}`).join("\n")}`
    : "No recent interactions recorded.";

  const result = await tracedGenerateObject({
    model,
    schema: coachingScoreSchema,
    prompt: `You are a senior sales coach reviewing an outgoing email before it's sent. Score it on 5 dimensions (0.0-1.0 each) and provide specific, actionable feedback.

## Email Being Reviewed
Subject: ${ctx.emailSubject}
Body:
${ctx.emailBody}

## Deal Context
- Deal: ${ctx.dealName || "unknown"}
- Stage: ${ctx.dealStage || "unknown"}
- Value: ${ctx.dealValue ? `$${ctx.dealValue}` : "unknown"}
- Contact: ${ctx.contactName || "unknown"} ${ctx.contactTitle ? `(${ctx.contactTitle})` : ""}
- Company: ${ctx.companyName || "unknown"}

## ${objectionSection}

## ${nextStepSection}

## ${historySection}

## Scoring Rubric

1. **Tone** (0.0-1.0): Is the tone appropriate for the deal stage and buyer persona? Discovery stage should be curious; proposal stage should be confident; stalled deals need a fresh angle.

2. **Completeness** (0.0-1.0): Does the email address all open items from previous conversations? List any missing items.

3. **Objection Handling** (0.0-1.0): Does it address known objections? List any unaddressed ones. Score 1.0 if no objections exist.

4. **Next Step** (0.0-1.0): Is there a clear, specific call to action? "Let me know" = 0.3. "Can we schedule 30 min on Thursday to review?" = 0.9.

5. **Process Adherence** (0.0-1.0): Does the email align with good sales methodology for this stage? List any skipped steps.

## Verdict
- "send" if overall score >= ${scoreThreshold}
- "review" if overall score is within 0.1 of threshold
- "revise" if overall score < ${scoreThreshold - 0.1}

Provide a topSuggestion: the single most impactful change to improve this email.`,
    _trace: {
      agentId: "coaching-pre-send",
      tenantId,
    },
  });

  return result.object;
}
