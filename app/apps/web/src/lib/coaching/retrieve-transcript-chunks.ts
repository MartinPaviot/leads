/**
 * Retrieve top-K transcript chunks by cosine similarity for RAG.
 *
 * MONACO-PARITY-05 — the retrieval half. Given a question and an
 * optional scope (deal or company), returns the most relevant
 * verbatim chunks from `transcript_chunks` so the chat tool can
 * inject them into the LLM context.
 *
 * Returns chunks formatted for direct prompt injection — including
 * the `[mm:ss]` time-stamp marker that the system prompt instructs
 * the LLM to preserve in its citation. The LLM never has to compose
 * the marker itself; it copies what we provide. This eliminates an
 * entire class of formatting failure.
 */

import postgres from "postgres";
import { embedText } from "@/lib/ai/embeddings";
import { formatSecondsAsTimestamp } from "./citation-parser";
import { logger } from "@/lib/observability/logger";
import {
  applySpeakerBias,
  type SpeakerHint,
} from "./speaker-bias";

export interface RetrieveOptions {
  /** Cosine-similarity threshold below which chunks are dropped. */
  similarityThreshold?: number;
  /** Top-k. */
  k?: number;
  /** Restrict retrieval to specific meeting ids — used when the chat
   *  scope is a single deal whose meeting list is already known. */
  meetingIds?: string[];
  /** Speaker-aware bias — when present, chunks whose speaker matches
   *  get a similarity-units boost (`SPEAKER_BIAS_BOOST`) for ranking
   *  purposes. Pass via `extractSpeakerHint(question)` from the
   *  chat tool. The DB query still pulls top-k by raw cosine ; the
   *  rerank happens in code so the SQL stays simple. */
  speakerHint?: SpeakerHint | null;
}

export interface RetrievedChunk {
  meetingId: string;
  speaker: string | null;
  startSec: number;
  endSec: number;
  text: string;
  similarity: number;
  source: string;
  /** Pre-formatted `[mm:ss, speaker]: "text"` ready for prompt
   *  injection — the LLM is instructed to preserve the `[mm:ss]`
   *  prefix verbatim in its citation. */
  promptLine: string;
}

const DEFAULT_K = 8;
const DEFAULT_THRESHOLD = 0.30;

/**
 * Run a similarity search against the tenant's transcript chunks.
 * Falls back to empty array on any error (DB unreachable, embedding
 * API down) — caller treats absence as "no evidence in transcript"
 * which the system prompt instructs the LLM to surface honestly.
 */
export async function retrieveTranscriptChunks(
  query: string,
  tenantId: string,
  options: RetrieveOptions = {},
): Promise<RetrievedChunk[]> {
  const k = options.k ?? DEFAULT_K;
  const threshold = options.similarityThreshold ?? DEFAULT_THRESHOLD;

  if (!query.trim() || !process.env.DATABASE_URL) return [];

  let queryVec: number[];
  try {
    queryVec = await embedText(query);
  } catch (err) {
    logger.warn("retrieveTranscriptChunks: embedding failed", {
      tenantId,
      err: err instanceof Error ? err.message : String(err),
    });
    return [];
  }

  const sql = postgres(process.env.DATABASE_URL);
  try {
    const vectorLiteral = `[${queryVec.join(",")}]`;

    // Cosine distance in pgvector = 1 - cosine_similarity. We invert
    // for the similarity column and filter by `1 - distance >= threshold`.
    const meetingFilter = options.meetingIds && options.meetingIds.length > 0;

    // The query is structured as raw SQL because we need the pgvector
    // `<=>` operator and an inequality on the derived similarity
    // expression. Both supported via `sql` tag.
    const rows = meetingFilter
      ? await sql`
          SELECT meeting_id, speaker, start_sec, end_sec, text, source,
                 1 - (embedding <=> ${vectorLiteral}::vector) AS similarity
          FROM transcript_chunks
          WHERE tenant_id = ${tenantId}
            AND meeting_id = ANY(${options.meetingIds!})
            AND 1 - (embedding <=> ${vectorLiteral}::vector) >= ${threshold}
          ORDER BY embedding <=> ${vectorLiteral}::vector
          LIMIT ${k}
        `
      : await sql`
          SELECT meeting_id, speaker, start_sec, end_sec, text, source,
                 1 - (embedding <=> ${vectorLiteral}::vector) AS similarity
          FROM transcript_chunks
          WHERE tenant_id = ${tenantId}
            AND 1 - (embedding <=> ${vectorLiteral}::vector) >= ${threshold}
          ORDER BY embedding <=> ${vectorLiteral}::vector
          LIMIT ${k}
        `;

    const mapped = rows.map((r) => {
      const startSec = Number(r.start_sec);
      const endSec = Number(r.end_sec);
      const speaker = r.speaker ? String(r.speaker) : null;
      const text = String(r.text);
      const ts = formatSecondsAsTimestamp(startSec);
      const speakerTag = speaker ? `, ${speaker}` : "";
      return {
        meetingId: String(r.meeting_id),
        speaker,
        startSec,
        endSec,
        text,
        similarity: Number(r.similarity),
        source: String(r.source ?? "unknown"),
        promptLine: `[${ts}${speakerTag}]: "${text}"`,
      };
    });
    // P0-4 follow-up — apply the speaker-bias rerank when a hint is
    // present. Pure pass-through when not. Keeps the original
    // similarity values intact ; only ordering shifts.
    return options.speakerHint
      ? applySpeakerBias(mapped, options.speakerHint)
      : mapped;
  } catch (err) {
    logger.warn("retrieveTranscriptChunks: SQL query failed", {
      tenantId,
      err: err instanceof Error ? err.message : String(err),
    });
    return [];
  } finally {
    await sql.end();
  }
}

/**
 * Format retrieved chunks into a prompt-ready block. Chunks are
 * grouped by meeting so the LLM cites the right meeting id when the
 * answer spans multiple calls. The grouping header `<meeting id="...">`
 * is parsed by the chat renderer to attach the correct meetingId to
 * each citation chip.
 */
export function formatChunksForPrompt(chunks: RetrievedChunk[]): string {
  if (chunks.length === 0) return "(no relevant transcript chunks found)";

  const byMeeting = new Map<string, RetrievedChunk[]>();
  for (const c of chunks) {
    const list = byMeeting.get(c.meetingId) ?? [];
    list.push(c);
    byMeeting.set(c.meetingId, list);
  }

  const sections: string[] = [];
  for (const [meetingId, list] of byMeeting.entries()) {
    sections.push(
      `<meeting id="${meetingId}">\n${list.map((c) => c.promptLine).join("\n")}\n</meeting>`,
    );
  }
  return sections.join("\n\n");
}
