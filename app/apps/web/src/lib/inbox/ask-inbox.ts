/**
 * Ask-AI across the WHOLE inbox with citations (INBOX-Q02), keyword-retrieval
 * variant. The semantic version (Q01) needs an email-embedding pipeline that
 * doesn't exist yet (emails aren't embedded); this answers from keyword-retrieved
 * threads instead — honest, no vector index, and the natural escalation when a
 * single-thread ask (Q07) comes up empty.
 *
 * Two pure, unit-tested pieces + an injectable generator (same shape as
 * ask-thread.ts): `selectRelevantThreads` ranks the user's threads by term
 * overlap, `askInbox` answers grounded ONLY in the selected threads and cites
 * them by index so the endpoint can link each citation to /inbox?conversation=.
 * Fail-closed: any error or no-match yields answered=false, never a guess.
 */

import { z } from "zod";
import type { ThreadMessage } from "./summarize-thread";

export type { ThreadMessage };

export interface InboxThread {
  key: string;
  subject: string;
  messages: ThreadMessage[];
}

export interface SelectedThread extends InboxThread {
  score: number;
}

export interface InboxAnswer {
  answer: string;
  /** Indices into the SELECTED-thread list the answer draws on. */
  citations: number[];
  answered: boolean;
}

const NOT_FOUND = "I couldn't find that anywhere in your inbox.";
const NO_ANSWER: InboxAnswer = { answer: NOT_FOUND, citations: [], answered: false };

// Common words that carry no retrieval signal — dropped before scoring.
const STOPWORDS = new Set([
  "the", "and", "for", "are", "was", "what", "who", "did", "does", "has", "have",
  "with", "that", "this", "from", "about", "they", "them", "their", "our", "you",
  "your", "when", "where", "which", "how", "any", "all", "can", "will", "would",
  "say", "said", "tell", "ask", "asked", "into", "out", "get", "got",
]);

/** Lowercase word tokens longer than 2 chars, stopwords removed, deduped. */
export function tokenize(text: string): string[] {
  const seen = new Set<string>();
  for (const raw of (text || "").toLowerCase().split(/[^a-z0-9]+/)) {
    if (raw.length > 2 && !STOPWORDS.has(raw)) seen.add(raw);
  }
  return [...seen];
}

/**
 * Rank threads by how many query-term occurrences they contain (subject counts
 * double — it's the strongest signal). Returns only threads with a hit, top
 * `limit` by score. Empty query or no hits → [] (the caller answers "not found").
 */
export function selectRelevantThreads(
  threads: InboxThread[],
  question: string,
  limit = 6,
): SelectedThread[] {
  const terms = tokenize(question);
  if (terms.length === 0) return [];
  const scored: SelectedThread[] = threads.map((t) => {
    const subject = (t.subject || "").toLowerCase();
    const body = t.messages.map((m) => m.body || "").join(" ").toLowerCase();
    let score = 0;
    for (const term of terms) {
      score += countOccurrences(subject, term) * 2 + countOccurrences(body, term);
    }
    return { ...t, score };
  });
  return scored
    .filter((t) => t.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

function countOccurrences(haystack: string, needle: string): number {
  if (!needle) return 0;
  let n = 0;
  let i = haystack.indexOf(needle);
  while (i !== -1) {
    n++;
    i = haystack.indexOf(needle, i + needle.length);
  }
  return n;
}

const schema = z.object({
  answer: z.string(),
  citations: z.array(z.number()),
  answered: z.boolean(),
});

export type InboxAnswerGenerator = (prompt: string) => Promise<{
  answer: string;
  citations: number[];
  answered: boolean;
}>;

export function buildAskInboxPrompt(
  selected: SelectedThread[],
  question: string,
  instructions = "",
): string {
  const blocks = selected
    .map((t, i) => {
      const convo = t.messages
        .slice(-4) // the most recent turns carry the answer
        .map((m) => `${m.direction === "outbound" ? "You" : m.from || "Them"}: ${(m.body || "").slice(0, 600)}`)
        .join("\n");
      return `[${i}] Subject: ${t.subject || "(no subject)"}\n${convo}`;
    })
    .join("\n---\n");
  return `${instructions ? instructions + "\n\n" : ""}Answer the salesperson's question using ONLY these email threads from their inbox. Rules:
- Ground every claim in the threads; never invent facts, names, dates, or commitments.
- answer: a direct, concise answer in the salesperson's voice. If the threads do not contain the answer, set answered=false and say you couldn't find it (do not guess).
- citations: the [index] numbers of the thread(s) your answer draws on (empty when answered=false).
- answered: true only when the threads actually support the answer.
"You" = the salesperson; the others are counterparties.

Question: ${question}

Threads:
${blocks}`;
}

async function defaultGenerate(prompt: string): Promise<{
  answer: string;
  citations: number[];
  answered: boolean;
}> {
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
    _trace: { agentId: "inbox-ask", inputPreview: "whole-inbox Q&A" },
  });
  return object as { answer: string; citations: number[]; answered: boolean };
}

/**
 * Answer a question across the pre-selected threads. Injectable generator like
 * its single-thread sibling; clamps citations to real selected-thread indices.
 */
export async function askInbox(
  selected: SelectedThread[],
  question: string,
  generate: InboxAnswerGenerator = defaultGenerate,
  instructions = "",
): Promise<InboxAnswer> {
  const q = (question || "").trim();
  if (selected.length === 0 || !q) return NO_ANSWER;
  try {
    const a = await generate(buildAskInboxPrompt(selected, q, instructions));
    const answer = (a.answer || "").trim();
    const answered = Boolean(a.answered) && answer.length > 0;
    if (!answered) return { answer: answer || NOT_FOUND, citations: [], answered: false };
    const citations = [
      ...new Set((a.citations || []).filter((n) => Number.isInteger(n) && n >= 0 && n < selected.length)),
    ].slice(0, 6);
    return { answer, citations, answered: true };
  } catch (err) {
    console.warn("inbox-wide ask failed:", err);
    return NO_ANSWER;
  }
}
