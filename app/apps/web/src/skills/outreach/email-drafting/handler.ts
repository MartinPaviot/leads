import { buildProspectContext, formatContextForPrompt } from "@/lib/prospect-context";
import { tracedGenerateObject } from "@/lib/traced-ai";
import { anthropic } from "@ai-sdk/anthropic";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
import type { SkillRunOptions } from "@/skills/types";
import type { EmailDraftingInput, EmailDraftingOutput } from "./schema";

function getLLMModel() {
  if (process.env.ANTHROPIC_API_KEY) return anthropic("claude-sonnet-4-6");
  if (process.env.OPENAI_API_KEY) return openai("gpt-4o-mini");
  return null;
}

const PURPOSE_PROMPTS: Record<string, string> = {
  cold_intro: "Write a cold introduction email. Lead with a specific observation about the prospect or their company. No generic openers.",
  follow_up: "Write a follow-up email referencing a previous interaction. Add new value, don't just check in.",
  meeting_request: "Write a meeting request email. Propose a specific time and give a clear agenda for the call.",
  value_prop: "Write a value proposition email. Lead with the prospect's specific challenge, not your product features.",
  breakup: "Write a breakup email. Brief, respectful, leave the door open. Creates FOMO without desperation.",
};

export async function emailDraftingHandler(
  input: EmailDraftingInput,
  options: SkillRunOptions,
): Promise<EmailDraftingOutput> {
  const ctx = await buildProspectContext(input.contactId, options.tenantId);
  if (!ctx) {
    throw new Error(`Could not build prospect context for contact ${input.contactId}`);
  }

  const model = getLLMModel();
  if (!model) throw new Error("No LLM API key configured (ANTHROPIC_API_KEY or OPENAI_API_KEY)");

  const contextBlock = formatContextForPrompt(ctx);
  const purposePrompt = PURPOSE_PROMPTS[input.purpose] ?? PURPOSE_PROMPTS.cold_intro;

  const result = await tracedGenerateObject({
    model,
    schema: z.object({
      subject: z.string(),
      body: z.string(),
      signalUsed: z.string().nullable(),
    }),
    prompt: `${purposePrompt}

## Rules
- Max ${input.maxWords} words
- No filler words (just, actually, really, basically)
- No "I hope this finds you well" or "I'm reaching out because"
- Sound human, not corporate
- One clear CTA
- Use the prospect's actual data, not placeholders

${input.additionalContext ? `## Additional Context\n${input.additionalContext}` : ""}

## Prospect Context
${contextBlock}`,
    _trace: {
      agentId: "skill-email-drafting",
      tenantId: options.tenantId,
    },
  });

  const wordCount = result.object.body.split(/\s+/).length;

  return {
    contactId: input.contactId,
    subject: result.object.subject,
    body: result.object.body,
    wordCount,
    purpose: input.purpose,
    prospectName: ctx.contact.fullName,
    companyName: ctx.company?.name ?? null,
    signalUsed: result.object.signalUsed,
  };
}
