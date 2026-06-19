/**
 * Voice-matched full reply draft (INBOX-C01 / G08) — injectable-generator
 * pattern. Drafts a COMPLETE reply to the latest message in a thread: answers
 * the counterparty's actual question, moves the deal forward with one clear next
 * step, grounded in the thread, in the user's voice + standing instructions
 * (O02) + tone (O03). Never implies the email is already sent — the draft always
 * goes through the approval-gated composer. Fail-closed: empty result so the
 * composer stays as-is.
 */

import { z } from "zod";
import { pickKeyMessages } from "./thread-summary-prep";
import type { ThreadMessage } from "./summarize-thread";

export interface ReplyDraft {
  subject: string;
  text: string;
}

const schema = z.object({ subject: z.string(), text: z.string() });

export type ReplyGenerator = (prompt: string) => Promise<{ subject: string; text: string }>;

export interface ComposeReplyOpts {
  /** Voice + standing-instructions preamble (buildVoicePrompt + buildMemoryPrompt). */
  instructions?: string;
  /** One-line CRM/prospect context (INBOX-G01 cluster), grounded. */
  context?: string;
}

export function buildReplyPrompt(messages: ThreadMessage[], opts: ComposeReplyOpts = {}): string {
  const picked = new Set(pickKeyMessages(messages, 8));
  const lines = messages
    .map((m, i) => {
      if (!picked.has(m)) return null;
      const who = m.direction === "outbound" ? "You" : m.from || "Them";
      return `[${i}] ${who}: ${(m.body || "").slice(0, 1500)}`;
    })
    .filter(Boolean)
    .join("\n---\n");
  const preamble = opts.instructions ? `${opts.instructions}\n\n` : "";
  const ctx = opts.context ? `\nWhat you know about them: ${opts.context}\n` : "";
  return `${preamble}Write a complete reply to the LATEST message in this email thread, as the salesperson ("You"). Answer their actual question, move the deal forward with one clear next step, ground every claim in the thread, invent no facts or commitments, and never imply the email has already been sent. Keep it concise and natural.${ctx}
Return a subject (keep the thread's "Re:" subject unless a new one is clearly better) and the body.

Thread:
${lines}`;
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
    _trace: { agentId: "inbox-compose-reply", inputPreview: "voice-matched reply" },
  });
  return object as { subject: string; text: string };
}

export async function composeReply(
  messages: ThreadMessage[],
  opts: ComposeReplyOpts = {},
  generate: ReplyGenerator = defaultGenerate,
): Promise<ReplyDraft> {
  if (messages.length === 0) return { subject: "", text: "" };
  try {
    const { subject, text } = await generate(buildReplyPrompt(messages, opts));
    return { subject: (subject || "").trim(), text: (text || "").trim() };
  } catch (err) {
    console.warn("inbox compose-reply failed:", err);
    return { subject: "", text: "" };
  }
}
