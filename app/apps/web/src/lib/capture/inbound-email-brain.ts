import { embedEntity } from "@/lib/ai/embeddings";
import { ingestEpisode } from "@/lib/ai/context-graph";

export interface InboundEmailBrainInput {
  tenantId: string;
  /**
   * "contact" | "company" for an attributed capture; "unassigned" skips the
   * entity-keyed embed (no entity to anchor a vector to).
   */
  entityType: "contact" | "company" | "unassigned";
  /** Empty string for an unattributed ("unassigned") capture. */
  entityId: string;
  /** Raw `From` header or bare address — travels into the embed + episode text. */
  fromHeader: string;
  subject: string | null;
  /** Plain-text body. No text ⇒ no-op (nothing to make searchable). */
  text: string | null;
  /** Provider message id — the unique, retry-stable embed/episode key. */
  messageId: string | null;
  /** Fallback embed key when there's no messageId. */
  occurredAt: Date;
}

/**
 * Make a captured INBOUND email searchable in chat/RAG + the memory graph — the
 * shared seam behind every inbound path (Gmail/IMAP pull-sync, EmailEngine
 * webhook, Instantly Unibox). The inbound mirror of `captureOutboundEmail`.
 *
 * Two effects, BOTH fail-soft + fire-and-forget by construction (every failure
 * is swallowed) so nothing here can ever block, slow, or fail a capture:
 *   - embedEntity  → entity-keyed vector for chat/RAG. OPENAI_API_KEY-guarded
 *     and messageId-keyed; SKIPPED for an unattributed capture.
 *   - ingestEpisode → memory/context graph, runs for every capture with text
 *     (attributed or not); messageId-deduped.
 *
 * One canonical place so the inbound call sites don't each drift their own copy
 * (Instantly Unibox previously inserted the activities row but bypassed this
 * fan-out entirely, so its replies never reached graph or RAG).
 */
export function captureInboundEmailToBrain(input: InboundEmailBrainInput): void {
  const { tenantId, entityType, entityId, fromHeader, subject, text, messageId, occurredAt } = input;
  if (!tenantId || !text) return;

  // Entity-keyed embedding — only when we can both anchor it (attributed entity)
  // and have a key. Mirrors the outbound guard.
  if (process.env.OPENAI_API_KEY && entityType !== "unassigned" && entityId) {
    const toEmbed = `Email: ${subject || ""}\nFrom: ${fromHeader}\n\n${text.slice(0, 5000)}`;
    void embedEntity(
      tenantId,
      entityType,
      `${entityId}-email-${messageId ?? occurredAt.getTime()}`,
      toEmbed,
    ).catch(() => {});
  }

  // Episode into the memory graph — runs even unattributed/unkeyed (ingestEpisode
  // dedupes on the episode id; undefined is fine).
  void ingestEpisode(
    tenantId,
    `Inbound email from ${fromHeader}:\nSubject: ${subject || ""}\n\n${text.slice(0, 3000)}`,
    "email",
    messageId ?? undefined,
  ).catch(() => {});
}
