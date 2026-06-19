/**
 * Action-item extraction (INBOX-S04 core). Pure + unit-tested.
 *
 * A deterministic first pass: sentences carrying a request/commitment cue
 * ("please send", "can you", "let me know", "by <date>", "follow up", "action
 * required") become candidate action items, with any hard date (reusing the
 * INBOX-S05 extractor) attached as a due date. LLM nuance (intent, owner, GTM
 * next-step mapping to INBOX-G05) and the checkbox UI are residual.
 */

import { extractEntities } from "./entities";

export interface ActionItem {
  text: string;
  due: string | null;
}

const CUE =
  /\b(please|can you|could you|would you|will you|let me know|send (?:me|us|over|through|the)|get back to|follow[- ]?up|action required|to-?do|deadline|by (?:mon|tue|wed|thu|fri|sat|sun|tomorrow|next week|end of))/i;

export function extractActionItems(text: string): ActionItem[] {
  const sentences = (text || "")
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const items: ActionItem[] = [];
  for (const s of sentences) {
    if (CUE.test(s)) {
      const dates = extractEntities(s).dates;
      items.push({ text: s, due: dates[0] ?? null });
    }
  }
  return items;
}
