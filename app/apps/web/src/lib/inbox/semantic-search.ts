/**
 * Semantic inbox search (INBOX-Q01). Inbound emails are ALREADY embedded at
 * capture (email-capture.ts, when OPENAI_API_KEY is set) into the `embeddings`
 * table with entityId `<contactId|companyId>-email-<messageId>`. This maps
 * searchHybrid (pgvector + BM25 + RRF) hits back to conversations by the
 * contact prefix and ranks them by fused score.
 *
 * Pure + unit-tested; the route runs searchHybrid + the owner-scoped read-model.
 * Degrades to keyword (Q04) when no embedding provider is configured.
 */

export const EMAIL_ENTITY_MARKER = "-email-";

export interface SemanticHit {
  entityId: string;
  score: number;
}

/** The contact/company id an email embedding belongs to, or null if it isn't one. */
export function emailEntityPrefix(entityId: string): string | null {
  const i = entityId.indexOf(EMAIL_ENTITY_MARKER);
  return i > 0 ? entityId.slice(0, i) : null;
}

export interface RankableConversation {
  key: string;
  subject: string;
  contactId: string | null;
  snippet: string;
}

export interface SemanticResult {
  key: string;
  subject: string;
  snippet: string;
  score: number;
}

/**
 * Rank conversations by their best matching email embedding. Keeps each
 * conversation's strongest hit (a thread can have several embedded emails),
 * sorted by score; conversations with no matching contact are dropped.
 */
export function rankConversationsBySemantic(
  conversations: RankableConversation[],
  hits: SemanticHit[],
  limit = 20,
): SemanticResult[] {
  // Best score per contact/company prefix.
  const bestByPrefix = new Map<string, number>();
  for (const h of hits) {
    const prefix = emailEntityPrefix(h.entityId);
    if (!prefix) continue;
    const prev = bestByPrefix.get(prefix);
    if (prev === undefined || h.score > prev) bestByPrefix.set(prefix, h.score);
  }
  if (bestByPrefix.size === 0) return [];

  const scored: SemanticResult[] = [];
  for (const c of conversations) {
    if (!c.contactId) continue;
    const score = bestByPrefix.get(c.contactId);
    if (score === undefined) continue;
    scored.push({ key: c.key, subject: c.subject, snippet: c.snippet, score });
  }
  return scored.sort((a, b) => b.score - a.score).slice(0, limit);
}
