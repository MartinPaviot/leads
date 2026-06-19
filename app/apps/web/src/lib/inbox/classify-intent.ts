/**
 * General-intent classification (INBOX-S06) — the broad, non-sales taxonomy that
 * the honest badge and triage defer to (gated by resolveGeneralIntent at read
 * time). The model classifies over the real content (NO hardcoded synonym map),
 * lazy-loading the AI SDK and accepting an injected generator for deterministic
 * tests; the result is normalized into the taxonomy and cached on metadata.
 * Fail-closed: any error yields no label (downstream degrades to fyi_update).
 */

import { z } from "zod";
import { normalizeIntent, GENERAL_INTENTS, type GeneralIntent } from "./general-intent";

export interface IntentInput {
  index: number;
  subject: string;
  body: string;
}

const intentSchema = z.object({
  results: z.array(z.object({ index: z.number(), intent: z.string() })),
});

export type IntentGenerator = (
  prompt: string,
) => Promise<{ results: { index: number; intent: string }[] }>;

export function buildIntentPrompt(emails: IntentInput[]): string {
  const body = emails
    .map((e) => `[${e.index}] Subject: ${e.subject || "(no subject)"}\n${(e.body || "").slice(0, 1000)}`)
    .join("\n---\n");
  return `Classify each email's GENERAL intent — exactly ONE label from:
${GENERAL_INTENTS.join(", ")}.
Pick the single best fit from the real content; if genuinely unsure use fyi_update. Do not guess a sales label on non-sales mail.

Emails:
${body}`;
}

async function defaultGenerate(prompt: string): Promise<{ results: { index: number; intent: string }[] }> {
  const [{ tracedGenerateObject }, { anthropic }, { openai }] = await Promise.all([
    import("@/lib/ai/traced-ai"),
    import("@/lib/ai/ai-provider"),
    import("@ai-sdk/openai"),
  ]);
  const model = process.env.ANTHROPIC_API_KEY
    ? anthropic("claude-haiku-4-5-20251001")
    : process.env.OPENAI_API_KEY
      ? openai("gpt-4o-mini")
      : null;
  if (!model) return { results: [] };
  const { object } = await tracedGenerateObject({
    model,
    schema: intentSchema,
    prompt,
    _trace: { agentId: "inbox-general-intent", inputPreview: "general intent classification" },
  });
  return object as { results: { index: number; intent: string }[] };
}

export async function classifyGeneralIntent(
  emails: IntentInput[],
  generate: IntentGenerator = defaultGenerate,
): Promise<Map<number, GeneralIntent>> {
  if (emails.length === 0) return new Map();
  try {
    const { results } = await generate(buildIntentPrompt(emails));
    return new Map(results.map((r) => [r.index, normalizeIntent(r.intent)]));
  } catch (err) {
    console.warn("inbox general-intent classification failed:", err);
    return new Map();
  }
}
