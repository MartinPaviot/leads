/**
 * On-demand single-thread Ask-AI (INBOX-Q07) — the question-answering twin of
 * summarize-thread.ts (S01/S08).
 *
 * `askThread(messages, question, generate?)` answers a question grounded ONLY in
 * the open thread, with citations to the exact messages. Injectable like its
 * sibling: defaults to a real traced Anthropic/OpenAI call but takes a
 * deterministic generator in tests, so prompt-building + key-message selection +
 * citation clamping + the fail-closed / out-of-scope logic is unit-tested without
 * importing the AI SDK. Reuses pickKeyMessages so a long thread isn't sent whole.
 *
 * Fail-closed: any error (or empty input) yields a non-answer ("couldn't find
 * that in this thread"), never a fabricated answer. Citations are clamped to
 * real message indices. When the thread can't answer the question the model
 * returns `answered:false`, so the UI can offer to widen the search (escalate to
 * INBOX-Q02) instead of inventing one.
 *
 * Scope note: this is the self-contained, unit-testable slice of INBOX-Q07. The
 * spec's deeper vision — pin the global chat dock to the thread via a new
 * `inbox_thread` surface, ground on the CRM cluster (G01), hand a draft to the
 * composer, persist thread-scoped history — rewires live chat infra and needs
 * runtime verification; it is tracked as the follow-up, not faked here.
 */

import { z } from "zod";
import { pickKeyMessages } from "./thread-summary-prep";
import type { ThreadMessage } from "./summarize-thread";

export type { ThreadMessage };

export interface ThreadAnswer {
  /** The grounded answer, or an out-of-scope message when `answered` is false. */
  answer: string;
  /** Original message indices the answer draws on (for the cited footnote). */
  citations: number[];
  /** False when the thread doesn't contain the answer (offer a wider search). */
  answered: boolean;
}

const NOT_FOUND = "I couldn't find that in this thread.";
const NO_ANSWER: ThreadAnswer = { answer: NOT_FOUND, citations: [], answered: false };

const schema = z.object({
  answer: z.string(),
  citations: z.array(z.number()),
  answered: z.boolean(),
});

export type ThreadAnswerGenerator = (prompt: string) => Promise<{
  answer: string;
  citations: number[];
  answered: boolean;
}>;

export function buildAskThreadPrompt(messages: ThreadMessage[], question: string, instructions = ""): string {
  const picked = new Set(pickKeyMessages(messages, 8));
  const lines = messages
    .map((m, i) => {
      if (!picked.has(m)) return null;
      const who = m.direction === "outbound" ? "You" : m.from || "Them";
      return `[${i}] ${who}: ${(m.body || "").slice(0, 1500)}`;
    })
    .filter(Boolean)
    .join("\n---\n");
  return `${instructions ? instructions + "\n\n" : ""}Answer the salesperson's question using ONLY this email thread. Rules:
- Ground every claim in the messages; never invent facts, names, dates, or commitments.
- answer: a direct, concise answer in the salesperson's voice. If the thread does not contain the answer, set answered=false and say you couldn't find it in this thread (do not guess).
- citations: the [index] numbers of the message(s) your answer draws on (empty when answered=false).
- answered: true only when the thread actually supports the answer.
"You" = the salesperson; the other participants are the counterparty.

Question: ${question}

Thread:
${lines}`;
}

async function defaultGenerate(prompt: string): Promise<{
  answer: string;
  citations: number[];
  answered: boolean;
}> {
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
  if (!model) return { answer: NOT_FOUND, citations: [], answered: false };
  const { object } = await tracedGenerateObject({
    model,
    schema,
    prompt,
    _trace: { agentId: "inbox-thread-ask", inputPreview: "thread Q&A" },
  });
  return object as { answer: string; citations: number[]; answered: boolean };
}

export async function askThread(
  messages: ThreadMessage[],
  question: string,
  generate: ThreadAnswerGenerator = defaultGenerate,
  instructions = "",
): Promise<ThreadAnswer> {
  const q = (question || "").trim();
  if (messages.length === 0 || !q) return NO_ANSWER;
  try {
    const a = await generate(buildAskThreadPrompt(messages, q, instructions));
    const answer = (a.answer || "").trim();
    const answered = Boolean(a.answered) && answer.length > 0;
    if (!answered) return { answer: answer || NOT_FOUND, citations: [], answered: false };
    const citations = [
      ...new Set((a.citations || []).filter((n) => Number.isInteger(n) && n >= 0 && n < messages.length)),
    ].slice(0, 8);
    return { answer, citations, answered: true };
  } catch (err) {
    console.warn("inbox thread ask failed:", err);
    return NO_ANSWER;
  }
}
