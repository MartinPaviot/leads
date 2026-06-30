/**
 * Meeting-transcript synthesis with a long-meeting fallback.
 *
 * The structured-notes extraction historically saw only the first 15k
 * chars of a transcript (transcript.slice(0, 15000)), so a long meeting
 * lost its entire tail from the summary, decisions, action items — the
 * exact "memory of the exchange" a founder wants from a 60-minute sync.
 *
 * This keeps the SHORT-meeting path byte-for-byte identical (the common
 * case, and what the prod recording webhooks run today), and adds a
 * map-reduce branch for transcripts over the window: summarize each
 * segment, then synthesize the structured notes over the combined
 * segment summaries — so the whole meeting informs the notes.
 */

import { tracedGenerateObject, tracedGenerateText } from "@/lib/ai/traced-ai";
import { meetingNotesSchema, buildMeetingNotesPrompt } from "./notes-schema";
import type { z } from "zod";

/** Single-pass when the transcript fits; map-reduce above this. */
const SINGLE_CALL_LIMIT = 15000;
/** Segment size for the map step. */
const CHUNK_SIZE = 12000;
/** Cap segments so a pathological 4-hour transcript can't fan out unbounded. */
const MAX_CHUNKS = 8;

export interface SummarizeTranscriptOpts {
  transcriptText: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  model: any;
  meetingTitle: string;
  meetingDate: string;
  tenantId?: string;
  /** Trace agentId so observability stays continuous with the call site. */
  traceAgentId: string;
}

/** Split a transcript into bounded, capped windows. Pure. */
export function chunkTranscript(
  text: string,
  size: number = CHUNK_SIZE,
  maxChunks: number = MAX_CHUNKS,
): string[] {
  const chunks: string[] = [];
  for (let i = 0; i < text.length && chunks.length < maxChunks; i += size) {
    chunks.push(text.slice(i, i + size));
  }
  return chunks;
}

export async function summarizeMeetingTranscript(
  opts: SummarizeTranscriptOpts,
): Promise<z.infer<typeof meetingNotesSchema>> {
  const { transcriptText, model, meetingTitle, meetingDate, tenantId, traceAgentId } = opts;

  // Short meeting → the original single-pass synthesis, unchanged. (When
  // transcriptText.length <= 15000, the full text == the old slice(0,15000).)
  if (transcriptText.length <= SINGLE_CALL_LIMIT) {
    const { object } = await tracedGenerateObject({
      model,
      schema: meetingNotesSchema,
      prompt: buildMeetingNotesPrompt({ transcript: transcriptText, meetingTitle, meetingDate }),
      _trace: { agentId: traceAgentId, tenantId },
    });
    return object as z.infer<typeof meetingNotesSchema>;
  }

  // Long meeting → map-reduce: summarize each segment, then synthesize the
  // structured notes over the combined segment summaries.
  const chunks = chunkTranscript(transcriptText);
  const partials: string[] = [];
  for (let i = 0; i < chunks.length; i++) {
    const { text } = await tracedGenerateText({
      model,
      prompt:
        `Summarize segment ${i + 1} of ${chunks.length} of a meeting transcript. ` +
        `Preserve, verbatim where possible: decisions made, action items with owners + deadlines, ` +
        `key points, objections raised, and notable quotes. Be concise but lose nothing material. ` +
        `Output prose only, no preamble.\n\nSEGMENT ${i + 1}/${chunks.length}:\n${chunks[i]}`,
      _trace: { agentId: `${traceAgentId}-chunk`, tenantId },
    });
    partials.push(`[Segment ${i + 1}/${chunks.length}]\n${text.trim()}`);
  }

  const combined = partials.join("\n\n").slice(0, SINGLE_CALL_LIMIT);
  const { object } = await tracedGenerateObject({
    model,
    schema: meetingNotesSchema,
    prompt: buildMeetingNotesPrompt({ transcript: combined, meetingTitle, meetingDate }),
    _trace: { agentId: `${traceAgentId}-combine`, tenantId },
  });
  return object as z.infer<typeof meetingNotesSchema>;
}
