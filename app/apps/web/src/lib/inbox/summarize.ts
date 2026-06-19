/**
 * Per-message AI summary (INBOX-S02) — the one-line, neutral, cited summary the
 * honest badge (INBOX-T08) renders from `metadata.aiSummaryLine`.
 *
 * The LLM call is injectable: `summarizeMessages(emails, generate?)` defaults to
 * a real Anthropic/OpenAI call (same traced pattern as the sentiment pass) but
 * takes a deterministic generator in tests — so the prompt-building + mapping +
 * fail-soft logic is unit-tested without importing the AI SDK. Fail-closed: any
 * error yields no summary (badge stays empty), never a fabricated line.
 */

import { z } from "zod";

export interface SummaryInput {
  index: number;
  subject: string;
  body: string;
}

const summarySchema = z.object({
  results: z.array(z.object({ index: z.number(), summary: z.string() })),
});

export type SummaryGenerator = (
  prompt: string,
) => Promise<{ results: { index: number; summary: string }[] }>;

export function buildSummaryPrompt(emails: SummaryInput[]): string {
  const body = emails
    .map((e) => `[${e.index}] Subject: ${e.subject || "(no subject)"}\n${(e.body || "").slice(0, 1200)}`)
    .join("\n---\n");
  return `Write a single neutral one-line summary (max ~12 words) of what each email IS and any action it implies. No sales spin, no fabrication. For an automated/transactional email, say plainly what it is (e.g. "Login code from your hosting provider", "Invoice #123 due June 30").

Emails:
${body}`;
}

async function defaultGenerate(prompt: string): Promise<{ results: { index: number; summary: string }[] }> {
  // Lazy-load the AI SDK so importing this module (e.g. in unit tests that inject
  // their own generator) never pulls @ai-sdk/* — keeping the logic test-isolated.
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
    schema: summarySchema,
    prompt,
    _trace: { agentId: "inbox-summary", inputPreview: "per-message summary" },
  });
  return object as { results: { index: number; summary: string }[] };
}

export async function summarizeMessages(
  emails: SummaryInput[],
  generate: SummaryGenerator = defaultGenerate,
): Promise<Map<number, string>> {
  if (emails.length === 0) return new Map();
  try {
    const { results } = await generate(buildSummaryPrompt(emails));
    return new Map(
      results.filter((r) => r.summary && r.summary.trim()).map((r) => [r.index, r.summary.trim()]),
    );
  } catch (err) {
    console.warn("inbox summary failed:", err);
    return new Map();
  }
}
