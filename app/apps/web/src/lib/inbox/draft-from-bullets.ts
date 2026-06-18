/**
 * Draft an email from bullet points (INBOX-C07). Injectable-generator pattern
 * (see rewrite.ts): turns a few bullets into a short professional email +
 * subject. Grounded — covers every bullet, invents no new facts/commitments.
 * Fail-closed: empty result on any error so the composer stays as-is.
 */

import { z } from "zod";

export interface DraftResult {
  subject: string;
  text: string;
}

const schema = z.object({ subject: z.string(), text: z.string() });

export type DraftGenerator = (prompt: string) => Promise<{ subject: string; text: string }>;

export function buildDraftPrompt(bullets: string, context?: string, instructions = ""): string {
  return `${instructions ? instructions + "\n\n" : ""}Turn these bullet points into a short, professional sales email.${context ? ` Context: ${context}.` : ""}
Cover every bullet, invent no new facts, offers or commitments, and keep a natural first-person voice. Return a concise subject line and the body.

Bullets:
${(bullets || "").slice(0, 3000)}`;
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
    _trace: { agentId: "inbox-draft-bullets", inputPreview: "draft from bullets" },
  });
  return object as { subject: string; text: string };
}

export async function draftFromBullets(
  bullets: string,
  context?: string,
  generate: DraftGenerator = defaultGenerate,
  instructions = "",
): Promise<DraftResult> {
  if (!(bullets || "").trim()) return { subject: "", text: "" };
  try {
    const { subject, text } = await generate(buildDraftPrompt(bullets, context, instructions));
    return { subject: (subject || "").trim(), text: (text || "").trim() };
  } catch (err) {
    console.warn("inbox draft-from-bullets failed:", err);
    return { subject: "", text: "" };
  }
}
