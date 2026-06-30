/**
 * AI Sequence Generator
 *
 * Produces a complete 5-step cold outreach sequence from a ProspectContext,
 * using the methodology library for structure and signals for angles.
 */

import { tracedGenerateObject } from "@/lib/ai/traced-ai";
import { buildRejectionCounterPrompt, type DominantInsight } from "@/lib/sequence-drafts/rejection-counter-prompt";
import { gradeSequenceQuality } from "@/lib/evals/sequence-quality";
import { judgeFabrication, decideFabricationGate } from "@/lib/evals/fabrication-gate";
import { anthropic } from "@/lib/ai/ai-provider";
import { openai } from "@ai-sdk/openai";
import { llmCall } from "@/lib/ai/llm-call";
import { z } from "zod";
import {
  getMethodology,
  SIGNAL_ANGLES,
  STEP_STRATEGIES,
  type Methodology,
  type StepStrategy,
} from "@/lib/scoring/outbound-methodologies";
import {
  type ProspectContext,
  formatContextForPrompt,
} from "@/lib/context/prospect-context";
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

export type GeneratedSequence = z.infer<typeof generatedSequenceSchema> & {
  steps: Array<
    z.infer<typeof generatedSequenceSchema>["steps"][number] & {
      // P0-3 — data-backed quality score attached after the evaluator loop.
      qualityScore?: { composite: number; dimensions: Record<string, number> };
    }
  >;
  sequenceQuality?: { composite: number; passed: boolean; iterations: number };
};

/**
 * Generate a complete multi-step outreach sequence.
 * When evaluate=true, runs an evaluator-optimizer loop (max 2 iterations)
 * to refine quality. Use for preview/single sequences, not bulk campaigns.
 */
export async function generateSequence(
  ctx: ProspectContext,
  options?: { stepCount?: number; meetingSlots?: string; tenantId?: string; evaluate?: boolean; knowledgeContext?: string; rejectionInsight?: DominantInsight | null }
): Promise<GeneratedSequence> {
  const model = getLLMModel();
  if (!model) throw new Error("No LLM API key configured");

  const methodology = getMethodology(ctx.contact.seniority);
  const signalAngle = ctx.bestSignal ? SIGNAL_ANGLES[ctx.bestSignal.type] : null;
  const stepCount = options?.stepCount || 5;
  const strategies = STEP_STRATEGIES.slice(0, stepCount);

  const basePrompt = buildGenerationPrompt(ctx, methodology, signalAngle, strategies, options?.meetingSlots, options?.knowledgeContext, options?.rejectionInsight ?? null);

  // P0-3 — always run the evaluator-optimizer loop (bulk AND preview) so every
  // generated sequence is graded by the data-backed scorer (gradeEmail) before
  // it becomes a draft. The bulk path used to skip all quality gating.
  const generateFn = async (feedback?: string) => {
    const prompt = feedback
      ? `${basePrompt}\n\nPREVIOUS ATTEMPT FEEDBACK — fix these issues:\n${feedback}`
      : basePrompt;

    const { object } = await tracedGenerateObject({
      model,
      schema: generatedSequenceSchema,
      prompt,
      temperature: 0.5,
      _trace: {
        agentId: "generate-sequence",
        tenantId: options?.tenantId,
        inputPreview: `Sequence for ${ctx.contact.fullName} at ${ctx.company?.name || "unknown"} (${methodology.name})`,
      },
    });
    return { text: JSON.stringify(object), usage: { promptTokens: 0, completionTokens: 0 } };
  };

  const evaluateFn = async (output: string) => gradeSequenceQuality(output, ctx, methodology);

  const { evaluatorOptimizerLoop } = await import("@/lib/evals/flywheel");
  const result = await evaluatorOptimizerLoop(generateFn, evaluateFn, 2);

  // Final anti-fabrication gate. The deterministic gate inside the loop catches
  // the empty-brief case for free; this ONE semantic pass on the cold open
  // catches the harder "angle present but fact-poor" case — a number/tool the
  // brief never recorded (e.g. an invented "700k users"). Bounded cost: one
  // Haiku judge call + at most one corrective regeneration. Fail-open.
  let finalOutput = result.output;
  try {
    const parsedForGate = JSON.parse(result.output) as GeneratedSequence;
    const step1 = parsedForGate.steps?.[0];
    if (step1 && process.env.ANTHROPIC_API_KEY) {
      const prospect = {
        name: ctx.contact?.fullName, title: ctx.contact?.title,
        company: ctx.company?.name, domain: ctx.company?.domain,
      };
      const claims = await judgeFabrication(step1.body, ctx.researchBrief, prospect);
      const fab = decideFabricationGate({ body: step1.body, brief: ctx.researchBrief, prospect, semanticClaims: claims });
      if (fab.blocked) {
        const corrected = await generateFn(
          `CRITICAL — these specifics are NOT supported by the research and read as fabricated. Remove them or replace with a verified fact, and do NOT invent any new prospect-specific fact: ${fab.ungrounded.slice(0, 8).join("; ")}.`,
        );
        try {
          const reparsed = JSON.parse(corrected.text) as GeneratedSequence;
          if (reparsed.steps?.length) finalOutput = corrected.text;
        } catch {
          /* keep the loop's output if the corrective regen didn't parse */
        }
      }
    }
  } catch {
    /* never block generation on the gate */
  }

  // Attach per-step + sequence-level quality to the result (R7).
  const parsed = JSON.parse(finalOutput) as GeneratedSequence;
  const finalEval = await gradeSequenceQuality(finalOutput, ctx, methodology);
  return {
    ...parsed,
    steps: parsed.steps.map((s) => {
      const ps = finalEval.perStep.find((p) => p.stepNumber === s.stepNumber);
      return ps ? { ...s, qualityScore: { composite: ps.composite, dimensions: ps.dimensions } } : s;
    }),
    sequenceQuality: { composite: finalEval.score, passed: finalEval.pass, iterations: result.iterations },
  } as GeneratedSequence;
}

/**
 * Evaluate the quality of a generated sequence against best practices.
 * Returns pass/fail with specific feedback for improvement.
 * Exported for the lint test suite — the evaluator IS the spec.
 */
export async function evaluateSequenceQuality(
  output: string,
  ctx: ProspectContext,
  methodology: Methodology,
): Promise<{ pass: boolean; score: number; feedback: string }> {
  const issues: string[] = [];
  let score = 1.0;

  try {
    const seq = JSON.parse(output) as GeneratedSequence;

    // Check each step
    for (const step of seq.steps) {
      const wordCount = step.body.split(/\s+/).length;
      const strategy = STEP_STRATEGIES.find((s) => s.stepNumber === step.stepNumber);
      const maxWords = strategy?.maxWords || methodology.maxWords;

      // Word count check
      if (wordCount > maxWords * 1.2) {
        issues.push(`Step ${step.stepNumber} is ${wordCount} words (max ${maxWords}). Cut it down.`);
        score -= 0.1;
      }

      // Anti-pattern check
      const antiPatterns = [
        { pattern: /I hope this finds you well/i, msg: "Remove 'I hope this finds you well'" },
        { pattern: /I noticed that/i, msg: "Remove 'I noticed that'" },
        { pattern: /Just wanted to/i, msg: "Remove 'Just wanted to'" },
        { pattern: /I'd love to/i, msg: "Remove 'I'd love to'" },
        { pattern: /!!!/i, msg: "Remove excessive exclamation marks" },
      ];

      for (const { pattern, msg } of antiPatterns) {
        if (pattern.test(step.body)) {
          issues.push(`Step ${step.stepNumber}: ${msg}`);
          score -= 0.15;
        }
      }

      // §19 relevance lint (OUT-02): personal trivia is not
      // personalization — "go Chiefs" makes recipients MORE averse
      // than no personalization at all. Blocking (-0.4 forces a
      // fail below the 0.7 pass bar → regeneration). Structural
      // patterns only; the main enforcement is generative (cleaned
      // angle map + prompt rules), this is the lexical net.
      const irrelevantPersonal = [
        { pattern: /\b(big |huge )?fan of (the |your )?[A-Z][\w-]+/, msg: "sports/team fandom reference" },
        { pattern: /\b[Gg]o [A-Z][a-z]+s\b/, msg: "team chant ('go …s')" },
        { pattern: /\bsaw (that )?you('re| are) from\b/i, msg: "hometown reference" },
        { pattern: /\b(alma mater|fellow alum|went to the same (school|university|college))\b/i, msg: "alma mater reference" },
      ];

      for (const { pattern, msg } of irrelevantPersonal) {
        if (pattern.test(step.body)) {
          issues.push(
            `Step ${step.stepNumber}: irrelevant personal reference (${msg}) — relevance comes from business signals, not trivia. Remove it entirely.`,
          );
          score -= 0.4;
        }
      }

      // Personalization check — must reference prospect facts
      const hasCompanyName = step.body.includes(ctx.company?.name || "__NONE__");
      const hasContactName = step.body.includes(ctx.contact.firstName || "__NONE__");
      if (!hasCompanyName && !hasContactName && step.stepNumber === 1) {
        issues.push(`Step 1 doesn't mention ${ctx.contact.firstName} or ${ctx.company?.name}. Add specific personalization.`);
        score -= 0.15;
      }
    }

    // Check for variety — no two steps should start the same way
    const openers = seq.steps.map((s) => s.body.slice(0, 30).toLowerCase());
    const uniqueOpeners = new Set(openers);
    if (uniqueOpeners.size < openers.length) {
      issues.push("Multiple steps start the same way. Each step needs a unique angle.");
      score -= 0.1;
    }
  } catch {
    return { pass: false, score: 0, feedback: "Invalid JSON output" };
  }

  score = Math.max(0, score);
  return {
    pass: score >= 0.7,
    score,
    feedback: issues.length > 0 ? issues.join("\n") : "Quality is acceptable.",
  };
}

export function buildGenerationPrompt(
  ctx: ProspectContext,
  methodology: Methodology,
  signalAngle: (typeof SIGNAL_ANGLES)[string] | null,
  strategies: StepStrategy[],
  meetingSlots?: string,
  knowledgeContext?: string,
  rejectionInsight?: DominantInsight | null,
): string {
  // P0-6 — counter the dominant rejection reason for this sequence (if any),
  // prefixed so it leads the prompt without touching the CRITICAL RULES.
  const counterBlock = buildRejectionCounterPrompt(rejectionInsight ?? null);
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

  const knowledgeBlock = knowledgeContext
    ? `\n## Knowledge Base\n${knowledgeContext}`
    : "";

  // Build personalization brief — tells the LLM exactly what signals to use
  const personalizationBrief = buildPersonalizationBrief(ctx);

  // Get relevant golden examples for this methodology
  const examples = getExamplesForMethodology(methodology.name);
  const examplesBlock = formatExamplesForPrompt(examples);

  return `${counterBlock ? counterBlock + "\n\n" : ""}You are a world-class SDR at ${ctx.companyName || "our company"}. You write cold outreach that converts at 3x industry average because every email demonstrates you deeply understand the prospect's world. You never sound like a template. You never "follow up" — each email brings fresh value.

${contextBlock}

${personalizationBrief}

${methodologyBlock}

${signalBlock}
${examplesBlock}
${knowledgeBlock}

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
- CLOSE WITH A LOW-FRICTION ASK, not just a question. End step 1 by pairing your insight/diagnostic question with ONE concrete, easy next step — a brief reply, a short 10-15 min exchange, "worth comparing notes?", or an offer to send something. A sharp question with NO proposed next step leaves the prospect nowhere to go and is the #1 reason researched emails still don't convert. Keep it soft and singular: never stack multiple asks, never push a hard demo, match the methodology's CTA type (a question-led methodology still names an easy next step, e.g. "worth a quick exchange on this?").
- Reference specific facts: company name, tech stack, funding, industry — not generic placeholders
- NEVER INVENT FACTS. Only state a specific (a number, a named tool/vendor, a named initiative/event, a headcount/funding figure, a client count) if it appears verbatim in the RESEARCH BRIEF, FIRMOGRAPHICS, or BUYING SIGNALS above. If you have no verified specifics about this prospect, write a credible email built on their role and industry alone — do NOT fabricate a plausible-sounding stack or statistic. An invented detail a recipient knows is false destroys credibility instantly.
- Personalization must be RELEVANT to the business problem: never reference sports teams, hometowns, alma maters, or personal trivia — if a fact doesn't change why this conversation is worth having, leave it out
- Funding is never by itself a reason to reach out: only use what it IMPLIES (new stage, new priorities, budget cycle) or a congratulation that accompanies real value
- Never present a static trait (e.g. being a YC company) as if it were news or a trigger
- The tone is "${ctx.aiTone}" — match this throughout
- Write in the language that matches the prospect's location (English for US/UK, French for France, etc.)
- Study the golden examples above — match that level of specificity and conciseness`;
}

/**
 * Build a personalization brief that tells the LLM exactly which
 * facts to weave into the email. This prevents generic output.
 */
export function buildPersonalizationBrief(ctx: ProspectContext): string {
  const facts: string[] = [];

  // P0-2 — research first: the cached brief's angle/pains/competitor lead the
  // brief so the LLM opens on a researched fact, not a firmographic merge-tag.
  const rb = ctx.researchBrief;
  if (rb?.bestAngle) facts.push(`- ANGLE (from research): ${rb.bestAngle} — lead with this`);
  if (rb?.painPoints?.length) facts.push(`- PAIN POINTS (from research): ${rb.painPoints.join("; ")}`);
  if (rb?.competitorDetected) facts.push(`- COMPETITOR DETECTED: ${rb.competitorDetected} — position against it`);

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

  // Wrapped in llmCall (Sprint-1) so personalisation cost / latency
  // / fallback land in the admin observability dashboard. Anthropic
  // primary, gpt-4o-mini fallback when terminally errored — better
  // a generic-but-personalised email than a hard error that drops
  // the founder's send.
  const isPrimaryAnthropic = !!process.env.ANTHROPIC_API_KEY;
  const result = (await llmCall({
    fn: tracedGenerateObject,
    args: [{
      model,
      schema: z.object({
        subject: z.string(),
        body: z.string(),
      }),
      temperature: 0.5,
      maxOutputTokens: 1500,
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
        contactId: ctx.contact.id,
        companyId: ctx.company?.id,
        inputPreview: `Personalize step for ${ctx.contact.fullName} at ${ctx.company?.name || "unknown"}`,
      },
    }] as never,
    fallbackModel: isPrimaryAnthropic ? openai("gpt-4o-mini") : undefined,
    retries: 1,
    timeoutMs: 30_000,
    trace: {
      tenantId: tenantId ?? null,
      surfaceId: "personalize-step-email",
      promptId: "personalize-step.v1",
      metadata: {
        agentId: "send-sequence-step",
        contactId: ctx.contact.id,
        stepNumber: stepStrategy.stepNumber,
      },
    },
  })) as { object: { subject: string; body: string } };

  return result.object;
}
