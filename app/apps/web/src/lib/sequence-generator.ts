/**
 * AI Sequence Generator
 *
 * Produces a complete 5-step cold outreach sequence from a ProspectContext,
 * using the methodology library for structure and signals for angles.
 */

import { tracedGenerateObject } from "@/lib/traced-ai";
import { anthropic } from "@ai-sdk/anthropic";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
import {
  getMethodology,
  SIGNAL_ANGLES,
  STEP_STRATEGIES,
  type Methodology,
  type StepStrategy,
} from "@/lib/outbound-methodologies";
import {
  type ProspectContext,
  formatContextForPrompt,
} from "@/lib/prospect-context";
import {
  getExamplesForMethodology,
  formatExamplesForPrompt,
} from "@/lib/prompts/email-examples";

function getLLMModel() {
  if (process.env.ANTHROPIC_API_KEY) return anthropic("claude-sonnet-4-6");
  if (process.env.OPENAI_API_KEY) return openai("gpt-4o-mini");
  return null;
}

const generatedSequenceSchema = z.object({
  sequenceName: z.string().describe("Short campaign name, e.g. 'Signal-based outreach to Series A SaaS'"),
  sequenceReasoning: z.string().describe("2-sentence explanation of the approach chosen"),
  steps: z.array(
    z.object({
      stepNumber: z.number(),
      subject: z.string().describe("Email subject — short, specific, no spam triggers"),
      body: z.string().describe("Email body in plain text — professional, personalized, concise"),
      delayDays: z.number().describe("Days to wait before sending this step"),
      purpose: z.string().describe("What this step is trying to achieve"),
      signalUsed: z.string().optional().describe("Which signal drove this email's angle, if any"),
      methodologyApplied: z.string().optional().describe("Which framework was used"),
    })
  ).describe("Array of 3-5 email steps"),
});

export type GeneratedSequence = z.infer<typeof generatedSequenceSchema>;

/**
 * Generate a complete multi-step outreach sequence.
 */
export async function generateSequence(
  ctx: ProspectContext,
  options?: { stepCount?: number; meetingSlots?: string; tenantId?: string }
): Promise<GeneratedSequence> {
  const model = getLLMModel();
  if (!model) throw new Error("No LLM API key configured");

  const methodology = getMethodology(ctx.contact.seniority);
  const signalAngle = ctx.bestSignal ? SIGNAL_ANGLES[ctx.bestSignal.type] : null;
  const stepCount = options?.stepCount || 5;
  const strategies = STEP_STRATEGIES.slice(0, stepCount);

  const prompt = buildGenerationPrompt(ctx, methodology, signalAngle, strategies, options?.meetingSlots);

  const { object } = await tracedGenerateObject({
    model,
    schema: generatedSequenceSchema,
    prompt,
    _trace: {
      agentId: "generate-sequence",
      tenantId: options?.tenantId,
      inputPreview: `Sequence for ${ctx.contact.fullName} at ${ctx.company?.name || "unknown"} (${methodology.name})`,
    },
  });

  return object as GeneratedSequence;
}

function buildGenerationPrompt(
  ctx: ProspectContext,
  methodology: Methodology,
  signalAngle: (typeof SIGNAL_ANGLES)[string] | null,
  strategies: StepStrategy[],
  meetingSlots?: string,
): string {
  const contextBlock = formatContextForPrompt(ctx);

  const methodologyBlock = `METHODOLOGY: ${methodology.name}
- Approach: ${methodology.description}
- Max words per email: ${methodology.maxWords}
- Structure: ${methodology.structure}
- Tone: ${methodology.toneNotes}
- CTA type: ${methodology.ctaType}
- Do NOT: ${methodology.whatNotToDo.join("; ")}`;

  const signalBlock = signalAngle
    ? `PRIMARY SIGNAL ANGLE:
- Signal: ${ctx.bestSignal!.type} — "${ctx.bestSignal!.title}"
- Detail: ${ctx.bestSignal!.description}
- Angle template: ${signalAngle.angleTemplate}
- Business implication: ${signalAngle.businessImplication}
- Question seed: ${signalAngle.questionSeed}`
    : `NO SPECIFIC SIGNAL DETECTED — use the company's industry, size, and tech stack to infer a relevant angle.`;

  const stepsBlock = strategies
    .map(
      (s) => `STEP ${s.stepNumber} — "${s.name}":
  Purpose: ${s.purpose}
  Max words: ${s.maxWords}
  Tone: ${s.toneNotes}
  CTA: ${s.ctaType}
  Do NOT: ${s.whatNotToDo.join("; ")}
  Delay: ${s.delayDays} days after previous step`
    )
    .join("\n\n");

  const meetingBlock = meetingSlots
    ? `\nAVAILABLE MEETING TIMES (use in step 3 or 4 if appropriate):\n${meetingSlots}`
    : "";

  // Build personalization brief — tells the LLM exactly what signals to use
  const personalizationBrief = buildPersonalizationBrief(ctx);

  // Get relevant golden examples for this methodology
  const examples = getExamplesForMethodology(methodology.name);
  const examplesBlock = formatExamplesForPrompt(examples);

  return `You are a world-class SDR at ${ctx.companyName || "our company"}. You write cold outreach that converts at 3x industry average because every email demonstrates you deeply understand the prospect's world. You never sound like a template. You never "follow up" — each email brings fresh value.

${contextBlock}

${personalizationBrief}

${methodologyBlock}

${signalBlock}
${examplesBlock}

SEQUENCE STRUCTURE — Generate ${strategies.length} emails:

${stepsBlock}
${meetingBlock}

CRITICAL RULES:
- Each email must feel hand-written by someone who researched this specific person
- NEVER use: "I hope this finds you well", "I noticed that", "Just wanted to", "Following up", exclamation marks
- NEVER start with your name or company — start with THEIR world
- Subject lines: 3-6 words, lowercase ok, no clickbait, no "[First name],"
- Body: plain text, no HTML formatting, no bullet points in the email itself
- Each step must have a DIFFERENT angle — never repeat the same value prop
- Reference specific facts: company name, tech stack, funding, industry — not generic placeholders
- The tone is "${ctx.aiTone}" — match this throughout
- Write in the language that matches the prospect's location (English for US/UK, French for France, etc.)
- Study the golden examples above — match that level of specificity and conciseness`;
}

/**
 * Build a personalization brief that tells the LLM exactly which
 * facts to weave into the email. This prevents generic output.
 */
function buildPersonalizationBrief(ctx: ProspectContext): string {
  const facts: string[] = [];

  // Signal-based hooks
  if (ctx.bestSignal) {
    facts.push(`- SIGNAL TO USE: ${ctx.bestSignal.type} — "${ctx.bestSignal.title}". ${ctx.bestSignal.description}`);
  }

  // Company-specific facts
  if (ctx.funding?.stage) {
    facts.push(`- FUNDING: ${ctx.funding.stage}${ctx.funding.amountPrinted ? ` (${ctx.funding.amountPrinted})` : ""} — reference the growth trajectory this implies`);
  }
  if (ctx.technologies && ctx.technologies.length > 0) {
    facts.push(`- TECH STACK: ${ctx.technologies.slice(0, 5).join(", ")} — use to show you understand their technical world`);
  }
  if (ctx.company?.size) {
    facts.push(`- COMPANY SIZE: ${ctx.company.size} employees — calibrate complexity of pain points to this scale`);
  }
  if (ctx.company?.industry) {
    facts.push(`- INDUSTRY: ${ctx.company.industry} — use industry-specific language, not generic B2B`);
  }

  // Contact-specific facts
  if (ctx.contact.title) {
    facts.push(`- THEIR ROLE: ${ctx.contact.title} — frame everything from this person's daily priorities`);
  }
  if (ctx.contact.seniority) {
    facts.push(`- SENIORITY: ${ctx.contact.seniority} — match communication style to this level`);
  }

  // Previous interactions
  if (ctx.recentActivities && ctx.recentActivities.length > 0) {
    const lastActivity = ctx.recentActivities[0];
    facts.push(`- LAST INTERACTION: ${lastActivity.type} on ${lastActivity.occurredAt} — "${lastActivity.summary}"`);
  }

  if (facts.length === 0) {
    return "PERSONALIZATION BRIEF: Limited data available. Use company name, industry, and role to personalize.";
  }

  return `PERSONALIZATION BRIEF — Use ALL of these specific facts in the emails:
${facts.join("\n")}

DO NOT use generic placeholders like "[specific problem]" or "[relevant metric]". Every reference must use REAL data from the brief above.`;
}

/**
 * Generate a single personalized email for a specific step,
 * given a template and full prospect context.
 */
export async function personalizeStepEmail(
  ctx: ProspectContext,
  stepTemplate: { subject: string; body: string },
  stepStrategy: StepStrategy,
  tenantId?: string,
): Promise<{ subject: string; body: string }> {
  const model = getLLMModel();
  if (!model) return stepTemplate; // fallback to template

  const methodology = getMethodology(ctx.contact.seniority);
  const contextBlock = formatContextForPrompt(ctx);

  const { object } = await tracedGenerateObject({
    model,
    schema: z.object({
      subject: z.string(),
      body: z.string(),
    }),
    prompt: `Personalize this email template using the full prospect dossier below. Transform it from a template into an email that feels personally written for this specific person.

${contextBlock}

METHODOLOGY: ${methodology.name} — ${methodology.description}
TONE: ${ctx.aiTone}

STEP PURPOSE: ${stepStrategy.purpose}
MAX WORDS: ${stepStrategy.maxWords}
CTA TYPE: ${stepStrategy.ctaType}
DO NOT: ${stepStrategy.whatNotToDo.join("; ")}

TEMPLATE TO PERSONALIZE:
Subject: ${stepTemplate.subject}
Body: ${stepTemplate.body}

${ctx.previousEmails.length > 0 ? "This is a FOLLOW-UP step. Do NOT repeat angles from previous emails listed above." : "This is the FIRST email in the sequence."}

RULES:
- Reference specific facts about their company, role, or signals
- Keep the core message but make it feel personally researched
- ${methodology.whatNotToDo.join("\n- ")}`,
    _trace: {
      agentId: "send-sequence-step",
      tenantId,
      inputPreview: `Personalize step for ${ctx.contact.fullName} at ${ctx.company?.name || "unknown"}`,
    },
  });

  return object as { subject: string; body: string };
}
