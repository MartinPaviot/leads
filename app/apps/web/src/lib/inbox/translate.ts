/**
 * Translate / multi-language compose (INBOX-C08). Injectable-generator pattern
 * (see rewrite.ts). Preserves meaning, tone, and concrete facts; returns only
 * the translated body. Fail-closed: empty result on any error so the composer
 * keeps the original.
 */

import { z } from "zod";

export interface TranslateResult {
  text: string;
}

/** Target languages offered in the composer menu. */
export const TRANSLATE_LANGUAGES: { code: string; label: string }[] = [
  { code: "en", label: "English" },
  { code: "fr", label: "French" },
  { code: "de", label: "German" },
  { code: "es", label: "Spanish" },
  { code: "it", label: "Italian" },
];

const schema = z.object({ text: z.string() });

export type TranslateGenerator = (prompt: string) => Promise<{ text: string }>;

export function buildTranslatePrompt(body: string, targetLang: string): string {
  return `Translate the email below into ${targetLang}. Preserve the meaning, tone and every concrete fact (names, dates, numbers, links) exactly. Do not add or remove content. Return ONLY the translated email body — no preamble, no notes.

Email:
${(body || "").slice(0, 6000)}`;
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
    _trace: { agentId: "inbox-translate", inputPreview: "compose translate" },
  });
  return object as { text: string };
}

export async function translate(
  body: string,
  targetLang: string,
  generate: TranslateGenerator = defaultGenerate,
): Promise<TranslateResult> {
  if (!(body || "").trim() || !(targetLang || "").trim()) return { text: "" };
  try {
    const { text } = await generate(buildTranslatePrompt(body, targetLang));
    return { text: (text || "").trim() };
  } catch (err) {
    console.warn("inbox translate failed:", err);
    return { text: "" };
  }
}
