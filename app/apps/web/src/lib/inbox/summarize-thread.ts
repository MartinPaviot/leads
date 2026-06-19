/**
 * On-demand thread summary (INBOX-S01 per-thread summary with citations +
 * INBOX-S08 long-thread TL;DR / key decisions) — one shared helper.
 *
 * Injectable like summarize.ts (S02): `summarizeThread(messages, generate?)`
 * defaults to a real traced Anthropic/OpenAI call but takes a deterministic
 * generator in tests, so the prompt-building + key-message selection + mapping +
 * fail-closed logic is unit-tested without importing the AI SDK. Reuses
 * pickKeyMessages so a 40-message thread doesn't get sent whole. Fail-closed:
 * any error yields an empty summary, never a fabricated one. Citations are
 * clamped to real message indices.
 */

import { z } from "zod";
import { pickKeyMessages, type SummarizableMessage } from "./thread-summary-prep";

export interface ThreadMessage extends SummarizableMessage {
  direction: "inbound" | "outbound";
  from: string;
}

export interface ThreadSummary {
  tldr: string;
  keyPoints: string[];
  /** Original message indices the summary draws on (for the cited tooltip). */
  citations: number[];
}

const EMPTY: ThreadSummary = { tldr: "", keyPoints: [], citations: [] };

const schema = z.object({
  tldr: z.string(),
  keyPoints: z.array(z.string()),
  citations: z.array(z.number()),
});

export type ThreadSummaryGenerator = (prompt: string) => Promise<ThreadSummary>;

export function buildThreadSummaryPrompt(messages: ThreadMessage[]): string {
  const picked = new Set(pickKeyMessages(messages, 6));
  const lines = messages
    .map((m, i) => {
      if (!picked.has(m)) return null;
      const who = m.direction === "outbound" ? "You" : m.from || "Them";
      return `[${i}] ${who}: ${(m.body || "").slice(0, 1500)}`;
    })
    .filter(Boolean)
    .join("\n---\n");
  return `Summarize this email thread for a salesperson. Return:
- tldr: one neutral sentence on where the thread stands now.
- keyPoints: up to 5 short factual bullets (decisions, asks, dates, blockers). No sales spin, no fabrication.
- citations: the [index] numbers your summary draws on.
Only state what the messages support; if the thread is thin, return a short tldr and few or no points.

Thread:
${lines}`;
}

async function defaultGenerate(prompt: string): Promise<ThreadSummary> {
  // Lazy-load the AI SDK so importing this module (e.g. in unit tests injecting a
  // generator) never pulls @ai-sdk/* — keeping the logic test-isolated.
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
  if (!model) return EMPTY;
  const { object } = await tracedGenerateObject({
    model,
    schema,
    prompt,
    _trace: { agentId: "inbox-thread-summary", inputPreview: "thread TL;DR" },
  });
  return object as ThreadSummary;
}

export async function summarizeThread(
  messages: ThreadMessage[],
  generate: ThreadSummaryGenerator = defaultGenerate,
): Promise<ThreadSummary> {
  if (messages.length === 0) return EMPTY;
  try {
    const s = await generate(buildThreadSummaryPrompt(messages));
    return {
      tldr: (s.tldr || "").trim(),
      keyPoints: (s.keyPoints || []).map((k) => (k || "").trim()).filter(Boolean).slice(0, 5),
      citations: (s.citations || []).filter((n) => Number.isInteger(n) && n >= 0 && n < messages.length),
    };
  } catch (err) {
    console.warn("inbox thread summary failed:", err);
    return EMPTY;
  }
}
