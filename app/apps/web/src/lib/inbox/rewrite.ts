/**
 * Email rewrite commands (INBOX-C04). Injectable like summarize.ts (S02):
 * `rewrite(body, instruction, generate?)` defaults to a real traced call but
 * takes a deterministic generator in tests. GTM presets + free-form. Fail-closed:
 * any error (or empty input) yields an empty string so the caller keeps the
 * original body, never a fabricated one. Grounded — preserve facts, invent
 * nothing.
 */

import { z } from "zod";

export interface RewriteResult {
  text: string;
}

// Client-safe presets live in rewrite-presets.ts so the composer (a client
// component) can import them without bundling this module's server-only AI/db
// stack (postgres). Re-exported here for server + test callers.
export { REWRITE_PRESETS } from "./rewrite-presets";
export type { RewritePreset } from "./rewrite-presets";

const schema = z.object({ text: z.string() });

export type RewriteGenerator = (prompt: string) => Promise<{ text: string }>;

export function buildRewritePrompt(body: string, instruction: string): string {
  return `Rewrite the email below to ${instruction}.
Preserve the meaning and every concrete fact (names, dates, numbers, links). Do NOT invent new claims, offers or commitments. Keep the writer's first-person voice. Return ONLY the rewritten email body — no preamble, no quotes, no notes.

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
    _trace: { agentId: "inbox-rewrite", inputPreview: "compose rewrite" },
  });
  return object as { text: string };
}

export async function rewrite(
  body: string,
  instruction: string,
  generate: RewriteGenerator = defaultGenerate,
): Promise<RewriteResult> {
  if (!(body || "").trim() || !(instruction || "").trim()) return { text: "" };
  try {
    const { text } = await generate(buildRewritePrompt(body, instruction));
    return { text: (text || "").trim() };
  } catch (err) {
    console.warn("inbox rewrite failed:", err);
    return { text: "" };
  }
}
