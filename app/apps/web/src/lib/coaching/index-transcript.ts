/**
 * Index a meeting transcript into `transcript_chunks` for RAG.
 *
 * MONACO-PARITY-05 — pipeline glue:
 *   chunkTranscript()  → embedText() per chunk → INSERT pgvector row.
 *
 * Idempotent: re-indexing a meeting deletes its existing chunks first
 * (by meetingId + tenantId) so multiple uploads of an updated
 * transcript produce a clean state with no orphaned rows.
 *
 * Embedding API costs scale linearly with chunk count. The chunker
 * already coalesces tiny continuations and caps long monologues, so
 * a typical 30-minute call yields ~30-80 chunks (~ $0.001-$0.003 at
 * text-embedding-3-small pricing). Cheap enough to run on every
 * post-call without batching.
 */

import postgres from "postgres";
import {
  chunkTranscript,
  type TranscriptSegment,
} from "./chunk-transcript";
import { embedText } from "@/lib/ai/embeddings";
import { logger } from "@/lib/observability/logger";

export interface IndexTranscriptInput {
  tenantId: string;
  meetingId: string;
  /** Speaker-aware segments preferred. */
  segments?: TranscriptSegment[];
  /** Fallback when no segments — raw text + total duration. */
  rawText?: string;
  totalDurationSec?: number;
  /** "recall_bot" | "manual_paste" | "zoom_native" | … — for quality
   *  tier filtering at retrieval time. */
  source?: string;
}

export interface IndexTranscriptResult {
  meetingId: string;
  chunksIndexed: number;
  chunksFailed: number;
}

export async function indexTranscript(
  input: IndexTranscriptInput,
): Promise<IndexTranscriptResult> {
  const { tenantId, meetingId, source = "unknown" } = input;
  const chunks = chunkTranscript({
    segments: input.segments,
    rawText: input.rawText,
    totalDurationSec: input.totalDurationSec,
  });

  if (chunks.length === 0) {
    return { meetingId, chunksIndexed: 0, chunksFailed: 0 };
  }

  if (!process.env.DATABASE_URL) {
    logger.warn("indexTranscript: no DATABASE_URL, skipping", { meetingId });
    return { meetingId, chunksIndexed: 0, chunksFailed: chunks.length };
  }

  const sql = postgres(process.env.DATABASE_URL);

  let indexed = 0;
  let failed = 0;
  try {
    // Wipe prior chunks for this meeting so re-indexing is clean.
    await sql`
      DELETE FROM transcript_chunks
      WHERE tenant_id = ${tenantId} AND meeting_id = ${meetingId}
    `;

    // Embed sequentially to bound concurrent OpenAI usage. The chunker
    // produces ≤ ~80 chunks for a 30-min call, so sequential ~ 30-60s
    // wall time worst-case — acceptable for a post-call job.
    for (const chunk of chunks) {
      try {
        const vec = await embedText(chunk.text);
        // pgvector accepts the JS array literal cast to ::vector. Using
        // sql.unsafe with the JSON-stringified array is safe here
        // because we control the input shape (number[] from OpenAI).
        const vectorLiteral = `[${vec.join(",")}]`;
        await sql`
          INSERT INTO transcript_chunks
            (tenant_id, meeting_id, speaker, start_sec, end_sec, text, embedding, source)
          VALUES (
            ${tenantId},
            ${meetingId},
            ${chunk.speaker},
            ${Math.round(chunk.startSec)},
            ${Math.round(chunk.endSec)},
            ${chunk.text},
            ${vectorLiteral}::vector,
            ${source}
          )
        `;
        indexed++;
      } catch (err) {
        failed++;
        logger.warn("indexTranscript: chunk embed/insert failed", {
          meetingId,
          tenantId,
          startSec: chunk.startSec,
          err: err instanceof Error ? err.message : String(err),
        });
      }
    }

    logger.info("indexTranscript: done", {
      meetingId,
      tenantId,
      indexed,
      failed,
      total: chunks.length,
    });
  } finally {
    await sql.end();
  }

  return { meetingId, chunksIndexed: indexed, chunksFailed: failed };
}
