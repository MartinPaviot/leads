/**
 * Long-thread summary preparation (INBOX-S01/S02/S08 core). Pure + unit-tested.
 *
 * The deterministic logic that decides WHETHER a thread is long enough to be
 * worth summarizing, and selects the key messages to feed the summarizer (so we
 * don't send an entire 40-message thread to the model). The summary text itself
 * is the LLM call (residual), cached at enrich.
 */

export interface SummarizableMessage {
  body: string;
  at: string | null;
}

/** Worth a TL;DR once a thread is long by message count or total size. */
export function shouldSummarize(messageCount: number, totalChars: number): boolean {
  return messageCount >= 4 || totalChars >= 4000;
}

/**
 * Pick the most informative messages for the summarizer: the opening context
 * (first 2) plus the latest exchange (last N-2), preserving order. Short threads
 * pass through unchanged.
 */
export function pickKeyMessages<T extends SummarizableMessage>(messages: T[], max = 6): T[] {
  if (max < 2 || messages.length <= max) return messages;
  const head = messages.slice(0, 2);
  const tail = messages.slice(messages.length - (max - 2));
  return [...head, ...tail];
}
