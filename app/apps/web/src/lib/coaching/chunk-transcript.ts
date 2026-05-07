/**
 * Transcript chunking for RAG retrieval (MONACO-PARITY-05).
 *
 * The coaching surface ("Ask Monaco-style") needs verbatim citations
 * with `[mm:ss]` time-stamps. To retrieve the right passages, we
 * chunk transcripts into small, embeddable units BEFORE embedding —
 * smaller chunks = sharper retrieval, fewer chunks per query = lower
 * cost. The two strategies below cover the two transcript shapes we
 * actually receive in production:
 *
 * 1. **Speaker-turn chunks** (Recall.ai, Whisper diarized output) —
 *    one chunk per contiguous turn by the same speaker, capped at
 *    ~400 chars to keep embeddings well-conditioned. Long monologues
 *    are split at sentence boundaries.
 *
 * 2. **Time-window chunks** (raw text without speaker labels) —
 *    fixed 60-second windows derived from the inferred WPM rate. Used
 *    only when no speaker labels are present.
 *
 * Pure function, deterministic, no IO. Tests in
 * `__tests__/chunk-transcript.test.ts` cover every branch.
 */

export interface TranscriptSegment {
  /** Speaker label as supplied by the source (e.g. "Jane Doe",
   *  "Speaker 1"). Null when diarization wasn't run. */
  speaker: string | null;
  /** Start offset in seconds from beginning of recording. */
  startSec: number;
  /** End offset in seconds. Must be ≥ startSec. */
  endSec: number;
  /** Text spoken in this segment. Whitespace is trimmed. */
  text: string;
}

export interface TranscriptChunk {
  speaker: string | null;
  startSec: number;
  endSec: number;
  text: string;
}

const MAX_CHUNK_CHARS = 400;
const MIN_CHUNK_CHARS = 40;

/**
 * Split a long string at sentence boundaries (`.`, `?`, `!` followed
 * by whitespace) into pieces of ≤ maxChars characters each. We don't
 * try to be too clever — when no boundary exists within the limit, we
 * fall back to a hard split at the boundary. The hard-split case is
 * rare (single very long sentence) and acceptable for retrieval.
 */
function splitLong(text: string, maxChars: number): string[] {
  if (text.length <= maxChars) return [text];

  const out: string[] = [];
  let buf = "";
  // Match a sentence terminator + the whitespace after it as a single
  // boundary. The non-greedy match keeps individual sentences intact.
  const sentences = text.split(/(?<=[.!?])\s+/);

  for (const s of sentences) {
    if (!buf) {
      buf = s;
      continue;
    }
    if ((buf + " " + s).length <= maxChars) {
      buf += " " + s;
    } else {
      out.push(buf);
      buf = s;
    }
  }
  if (buf) out.push(buf);

  // Hard-split anything that's still over the limit (sentence longer
  // than maxChars). We split at the closest space at or before the
  // limit so we don't bisect words.
  const final: string[] = [];
  for (const piece of out) {
    if (piece.length <= maxChars) {
      final.push(piece);
      continue;
    }
    let remaining = piece;
    while (remaining.length > maxChars) {
      const cutIdx = remaining.lastIndexOf(" ", maxChars);
      const idx = cutIdx > maxChars / 2 ? cutIdx : maxChars;
      final.push(remaining.slice(0, idx));
      remaining = remaining.slice(idx).trimStart();
    }
    if (remaining) final.push(remaining);
  }
  return final;
}

/**
 * Chunk a list of speaker-turn segments. Each turn becomes one chunk
 * unless it's longer than `MAX_CHUNK_CHARS`, in which case it splits
 * at sentence boundaries with proportional time interpolation.
 *
 * Adjacent very-short turns (< MIN_CHUNK_CHARS) by the same speaker
 * are coalesced into the previous chunk to avoid embedding noise like
 * single-word backchannels ("Yeah." "Right." "Mhm.").
 */
export function chunkBySpeakerTurns(
  segments: TranscriptSegment[],
): TranscriptChunk[] {
  const chunks: TranscriptChunk[] = [];

  for (const seg of segments) {
    const text = seg.text.trim();
    if (!text) continue;

    // Coalesce tiny same-speaker continuations into previous chunk.
    const last = chunks[chunks.length - 1];
    if (
      last &&
      last.speaker === seg.speaker &&
      text.length < MIN_CHUNK_CHARS &&
      last.text.length + text.length + 1 <= MAX_CHUNK_CHARS
    ) {
      last.text = `${last.text} ${text}`;
      last.endSec = seg.endSec;
      continue;
    }

    if (text.length <= MAX_CHUNK_CHARS) {
      chunks.push({
        speaker: seg.speaker,
        startSec: seg.startSec,
        endSec: seg.endSec,
        text,
      });
      continue;
    }

    // Long turn — split into sentence-bounded pieces and interpolate
    // time linearly across pieces.
    const parts = splitLong(text, MAX_CHUNK_CHARS);
    const totalChars = parts.reduce((sum, p) => sum + p.length, 0);
    const duration = Math.max(0.001, seg.endSec - seg.startSec);
    let cursorStart = seg.startSec;
    for (const p of parts) {
      const fraction = p.length / totalChars;
      const cursorEnd = cursorStart + duration * fraction;
      chunks.push({
        speaker: seg.speaker,
        startSec: Math.round(cursorStart * 1000) / 1000,
        endSec: Math.round(cursorEnd * 1000) / 1000,
        text: p,
      });
      cursorStart = cursorEnd;
    }
  }

  return chunks;
}

/**
 * Chunk a transcript that has no speaker labels and no fine-grained
 * timestamps — typically a paste from a free-text file. We assume
 * `totalDurationSec` was provided (caller derives it from the
 * recording duration) and slice into fixed 60-second windows by
 * estimating word-per-second rate uniformly across the text.
 *
 * If `totalDurationSec` is missing or zero, we fall back to grouping
 * paragraphs without time stamps (`startSec=0`, `endSec=0`) so the
 * caller can still embed for retrieval — citations just won't be
 * jumpable.
 */
export function chunkByTimeWindows(
  text: string,
  totalDurationSec: number,
  windowSec: number = 60,
): TranscriptChunk[] {
  const cleaned = text.trim();
  if (!cleaned) return [];

  if (totalDurationSec <= 0) {
    // No timing — fall back to chunking by sentences with zeroed
    // timestamps. Better than dropping the transcript entirely.
    const parts = splitLong(cleaned, MAX_CHUNK_CHARS);
    return parts.map((p) => ({ speaker: null, startSec: 0, endSec: 0, text: p }));
  }

  const words = cleaned.split(/\s+/);
  if (words.length === 0) return [];

  const wordsPerSec = words.length / totalDurationSec;
  const wordsPerWindow = Math.max(1, Math.round(wordsPerSec * windowSec));

  const chunks: TranscriptChunk[] = [];
  for (let i = 0; i < words.length; i += wordsPerWindow) {
    const slice = words.slice(i, i + wordsPerWindow).join(" ");
    if (!slice) continue;

    const startSec = Math.round((i / wordsPerSec) * 100) / 100;
    const endSec = Math.round(
      (Math.min(i + wordsPerWindow, words.length) / wordsPerSec) * 100,
    ) / 100;

    // If the window text exceeds MAX_CHUNK_CHARS, split it further.
    if (slice.length <= MAX_CHUNK_CHARS) {
      chunks.push({ speaker: null, startSec, endSec, text: slice });
      continue;
    }

    const parts = splitLong(slice, MAX_CHUNK_CHARS);
    const totalChars = parts.reduce((sum, p) => sum + p.length, 0);
    const duration = endSec - startSec;
    let cursor = startSec;
    for (const p of parts) {
      const fraction = p.length / totalChars;
      const next = cursor + duration * fraction;
      chunks.push({
        speaker: null,
        startSec: Math.round(cursor * 100) / 100,
        endSec: Math.round(next * 100) / 100,
        text: p,
      });
      cursor = next;
    }
  }

  return chunks;
}

/**
 * Top-level chunking entry — picks the right strategy based on what's
 * available in the input. Speaker-aware data wins; falls back to
 * time-window when only raw text is present.
 */
export function chunkTranscript(input: {
  segments?: TranscriptSegment[];
  rawText?: string;
  totalDurationSec?: number;
}): TranscriptChunk[] {
  if (input.segments && input.segments.length > 0) {
    return chunkBySpeakerTurns(input.segments);
  }
  if (input.rawText) {
    return chunkByTimeWindows(input.rawText, input.totalDurationSec ?? 0);
  }
  return [];
}
