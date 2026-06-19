/**
 * Inline grammar / spelling fix (INBOX-C12) — injectable-generator pattern
 * (see rewrite.ts / scheduling-draft.ts). Corrects grammar, spelling, and
 * punctuation ONLY, preserving the writer's meaning, facts, names, and voice.
 * Fail-closed: returns the original text unchanged on any error or empty result,
 * so the composer never loses what the user typed. The inline-underline composer
 * UI is the residual (hot file, deferred).
 */

import { z } from "zod";

export interface GrammarFix {
  text: string;
  /** true only when the corrected text actually differs from the input. */
  corrected: boolean;
}

const schema = z.object({ text: z.string() });

export type GrammarGenerator = (prompt: string) => Promise<{ text: string }>;

export function buildGrammarPrompt(text: string): string {
  return `Fix only the grammar, spelling, and punctuation of the message below. Do NOT change its meaning, facts, names, tone, or wording beyond what is needed to be correct; do not add or remove content. If it is already correct, return it unchanged. Return only the corrected message, nothing else.

Message:
${text.slice(0, 5000)}`;
}

async function defaultGenerate(prompt: string): Promise<{ text: string }> {
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
  if (!model) return { text: "" };
  const { object } = await tracedGenerateObject({
    model,
    schema,
    prompt,
    _trace: { agentId: "inbox-grammar-fix", inputPreview: "grammar fix" },
  });
  return object as { text: string };
}

export async function fixGrammar(
  text: string,
  generate: GrammarGenerator = defaultGenerate,
): Promise<GrammarFix> {
  const original = (text || "").trim();
  if (!original) return { text: text || "", corrected: false };
  try {
    const { text: fixed } = await generate(buildGrammarPrompt(original));
    const out = (fixed || "").trim();
    if (!out) return { text, corrected: false }; // fail-closed: keep the original
    return { text: out, corrected: out !== original };
  } catch (err) {
    console.warn("inbox grammar fix failed:", err);
    return { text, corrected: false };
  }
}
