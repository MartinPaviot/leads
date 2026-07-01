/**
 * Deepgram BATCH (prerecorded) transcription — the Phase-2 fallback for a call
 * whose live Media Stream dropped (no streamed chunks arrived), so
 * calls-post-process would otherwise classify an ANSWERED, recorded call as
 * no_answer and lose the entire transcript. The Twilio recording is still there;
 * this transcribes it after the fact via Deepgram's prerecorded API.
 *
 * IMPORTANT: Twilio records mono (no recordingChannels=dual), so diarization
 * yields speaker indices (0, 1, …), NOT the agent/prospect roles the live track
 * split gives. We label turns "speaker N" — enough to preserve turn structure
 * for the LLM extraction + RAG (the recovery that matters); role-dependent lever
 * scores simply skip on this path (they require "agent"/"prospect"). This is a
 * strict improvement over total loss, and it is fail-soft: any failure (no key,
 * API error, empty result) returns [] and the caller falls back to exactly
 * today's no_answer behaviour — it can never regress.
 */

/** Minimal shape of the Deepgram v5 prerecorded response we read (utterances). */
export interface DeepgramPrerecordedResponse {
  results?: {
    utterances?: Array<{ speaker?: number; transcript?: string; start?: number }>;
    channels?: Array<{ alternatives?: Array<{ transcript?: string }> }>;
  };
}

export interface RecoveredChunk {
  speaker: string;
  text: string;
  tsMs: number;
}

/** Pure: map Deepgram utterances → the transcript-chunk shape calls store. */
export function deepgramUtterancesToChunks(resp: DeepgramPrerecordedResponse): RecoveredChunk[] {
  const utterances = resp?.results?.utterances ?? [];
  const chunks: RecoveredChunk[] = [];
  for (const u of utterances) {
    const text = (u.transcript ?? "").trim();
    if (!text) continue;
    chunks.push({
      speaker: typeof u.speaker === "number" ? `speaker ${u.speaker}` : "unknown",
      text,
      tsMs: typeof u.start === "number" && Number.isFinite(u.start) ? Math.round(u.start * 1000) : 0,
    });
  }
  return chunks;
}

/**
 * Transcribe a recording URL via Deepgram's prerecorded API. Fail-soft: returns
 * [] on a missing key, missing URL, or any API error — never throws.
 */
export async function transcribeRecording(recordingUrl: string | null | undefined): Promise<RecoveredChunk[]> {
  const apiKey = process.env.DEEPGRAM_API_KEY;
  if (!apiKey || !recordingUrl) return [];
  try {
    const { DeepgramClient } = await import("@deepgram/sdk");
    const client = new DeepgramClient({ apiKey });
    const data = await client.listen.v1.media.transcribeUrl({
      url: recordingUrl,
      model: "nova-3",
      diarize: true,
      utterances: true,
      punctuate: true,
      smart_format: true,
    });
    return deepgramUtterancesToChunks(data as DeepgramPrerecordedResponse);
  } catch (e) {
    console.warn("deepgram-batch: transcribeRecording failed (non-blocking)", e);
    return [];
  }
}
