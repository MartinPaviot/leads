/**
 * Scheduling-email drafter (INBOX-C10) — injectable-generator pattern (see
 * draft-from-bullets.ts / rewrite.ts). Turns a few proposed time slots + thread
 * context into a short, warm email proposing those exact times for the reader to
 * pick. Grounded: proposes ONLY the given slots, invents none. Fail-closed:
 * empty result on any error so the composer stays as-is.
 */

import { z } from "zod";

export interface SchedulingDraft {
  subject: string;
  text: string;
}

const schema = z.object({ subject: z.string(), text: z.string() });

export type SchedulingGenerator = (prompt: string) => Promise<{ subject: string; text: string }>;

export function buildSchedulingPrompt(slots: string[], context?: string): string {
  const list = slots.map((s) => `- ${s}`).join("\n");
  return `Draft a short, warm email proposing a meeting at one of these exact times (the reader picks one).${
    context ? ` Context: ${context}.` : ""
  }
Propose ONLY these slots, invent no other times, names, or facts, keep it first-person and concise, and end by inviting them to pick one or suggest another if none fit. Return a subject and the body.

Proposed times:
${list}`;
}

async function defaultGenerate(prompt: string): Promise<{ subject: string; text: string }> {
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
  if (!model) return { subject: "", text: "" };
  const { object } = await tracedGenerateObject({
    model,
    schema,
    prompt,
    _trace: { agentId: "inbox-scheduling-draft", inputPreview: "scheduling email" },
  });
  return object as { subject: string; text: string };
}

export async function draftSchedulingEmail(
  slots: string[],
  context?: string,
  generate: SchedulingGenerator = defaultGenerate,
): Promise<SchedulingDraft> {
  const clean = (slots || []).map((s) => (s || "").trim()).filter(Boolean).slice(0, 8);
  if (clean.length === 0) return { subject: "", text: "" };
  try {
    const { subject, text } = await generate(buildSchedulingPrompt(clean, context));
    return { subject: (subject || "").trim(), text: (text || "").trim() };
  } catch (err) {
    console.warn("inbox scheduling draft failed:", err);
    return { subject: "", text: "" };
  }
}
