/**
 * Speaker-aware retrieval — pure helpers.
 *
 * Coaching questions often name a speaker explicitly :
 *   "What did Sarah push back on?"
 *   "What did John say about pricing?"
 *   "Did the prospect mention budget?"
 *
 * Without speaker awareness the ANN search returns whatever chunk is
 * closest by cosine — Sarah's quote might lose to Bob's similarly-
 * worded one. With it, we bias toward chunks the named speaker
 * actually said. The bias is preferential, not exclusive : when
 * Sarah didn't say anything matching, we still return the closest
 * cosine match so the LLM can refuse cleanly.
 *
 * Pure functions only — the SQL hook lives in
 * `retrieveTranscriptChunks` and consumes the helper output. Tests
 * validate every linguistic edge case here.
 *
 * Detection strategy is rule-based, not LLM-based : the question is
 * short, names are usually capitalised, and the verb cue ("said",
 * "asked", "pushed back") sits within a few tokens. This keeps the
 * latency add to ~1ms and is deterministic for the eval harness.
 */

/**
 * Heuristic patterns we trust. Each captures a single named speaker.
 * Order matters : the first match wins, so the more specific pattern
 * (with a verb cue) sits before the bare-name one.
 */
const SPEAKER_PATTERNS: RegExp[] = [
  // "what did X say / push back / object / mention / ask / answer"
  /\bwhat\s+did\s+([A-Z][a-zA-Z]{1,30})\s+(?:say|push|object|mention|ask|answer|tell|claim|argue|reject|accept|state|note|comment)/i,
  // "what does X think / want / care / need"
  /\bwhat\s+does\s+([A-Z][a-zA-Z]{1,30})\s+(?:think|want|care|need|feel|know|believe)/i,
  // "did X say / mention / agree …"
  /\bdid\s+([A-Z][a-zA-Z]{1,30})\s+(?:say|mention|agree|disagree|push|confirm|deny|raise|share|reply)/i,
  // "X's objection / reaction / take / view / opinion / stance / concern"
  /\b([A-Z][a-zA-Z]{1,30})'s\s+(?:objection|reaction|take|view|opinion|stance|concern|reply|response|push.?back|comment|question)/i,
  // "according to X" / "X mentioned" / "X said"
  /\baccording\s+to\s+([A-Z][a-zA-Z]{1,30})\b/i,
  /\b([A-Z][a-zA-Z]{1,30})\s+(?:said|mentioned|argued|asked|claimed|noted|replied)\b/i,
];

/**
 * Reserved tokens that look name-shaped but aren't names. Prevents
 * "What did Q4 mean?" → speaker "Q4". Adds the obvious ones plus a
 * few question-word fragments capitalised by the user.
 */
const NOT_A_NAME = new Set<string>([
  "the",
  "a",
  "an",
  "this",
  "that",
  "these",
  "those",
  "they",
  "we",
  "i",
  "he",
  "she",
  "it",
  "you",
  "their",
  "our",
  "his",
  "her",
  "my",
  "your",
  "what",
  "when",
  "where",
  "why",
  "how",
  "who",
  // Indefinite-person pronouns — common "Did anyone say…" framing.
  "anyone",
  "someone",
  "everyone",
  "nobody",
  "anybody",
  "somebody",
  "everybody",
  // Question domain words that get capitalised at start-of-sentence.
  "budget",
  "timeline",
  "next",
  "previous",
  "deal",
  "competitor",
  "team",
  "buyer",
  "champion",
  "stakeholder",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
  "q1",
  "q2",
  "q3",
  "q4",
]);

export interface SpeakerHint {
  /** Detected speaker — typically a first name. */
  name: string;
  /** Confidence 0-1. Verb-cue matches score higher than bare-name. */
  confidence: number;
  /** Index in the source string where the match begins. */
  startIndex: number;
  /** The raw matched substring (for audit). */
  raw: string;
}

/**
 * Pull a speaker name out of the question. Returns null when no
 * recognisable name appears.
 *
 * Pure : no LLM call, no clock, no IO. Tests cover happy paths +
 * negative paths exhaustively.
 */
export function extractSpeakerHint(question: string): SpeakerHint | null {
  const q = (question || "").trim();
  if (!q) return null;

  for (let i = 0; i < SPEAKER_PATTERNS.length; i++) {
    const re = SPEAKER_PATTERNS[i];
    const m = q.match(re);
    if (m && m[1]) {
      const candidate = m[1];
      // The /i flag on patterns means [A-Z] also matches lowercase ;
      // re-assert capital-first manually so "anyone" / "the" etc.
      // can't sneak through.
      const firstChar = candidate[0];
      if (firstChar !== firstChar.toUpperCase()) continue;
      if (NOT_A_NAME.has(candidate.toLowerCase())) continue;
      // Bare-name patterns are weakest ; verb-cue ones are stronger.
      // Index 0..2 are the strongest, 3 is mid, 4..5 are weaker.
      const confidence = i <= 2 ? 0.9 : i === 3 ? 0.8 : 0.7;
      return {
        name: candidate,
        confidence,
        startIndex: m.index ?? q.indexOf(candidate),
        raw: m[0],
      };
    }
  }
  return null;
}

/**
 * Score boost (in cosine-similarity units) applied to chunks whose
 * speaker matches the hint. Tuning rationale :
 *  - Default cosine threshold for a chunk to even appear in results
 *    is 0.30 ; a 0.10 boost lets a same-speaker chunk at 0.25 jump
 *    over a different-speaker chunk at 0.32.
 *  - But not so high that a 0.10 cosine match (semantically wrong)
 *    overtakes a 0.40 cosine match (semantically right) on a
 *    different speaker.
 */
export const SPEAKER_BIAS_BOOST = 0.1;

/**
 * Decide whether a chunk's speaker matches the hint. Tolerant of :
 *  - Case differences ("sarah" vs "Sarah")
 *  - Trailing whitespace
 *  - First-name-only matches when the chunk has a full name ("Sarah"
 *    vs "Sarah Chen")
 *
 * Returns false for null/empty speaker — those are unknown speakers
 * who shouldn't get the boost.
 */
export function speakerMatches(
  chunkSpeaker: string | null | undefined,
  hint: SpeakerHint | null,
): boolean {
  if (!hint) return false;
  if (!chunkSpeaker) return false;
  const cs = chunkSpeaker.trim().toLowerCase();
  const hn = hint.name.trim().toLowerCase();
  if (!cs || !hn) return false;
  // Exact match.
  if (cs === hn) return true;
  // First-name match — chunk speaker has a space, the hint is one
  // word, and the first word matches.
  const csFirst = cs.split(/\s+/)[0];
  if (csFirst === hn) return true;
  // Reverse case : chunk speaker is one word, hint has multiple
  // (e.g. "Sarah Chen" → matches a chunk whose speaker is "Sarah").
  const hnFirst = hn.split(/\s+/)[0];
  if (hnFirst === cs) return true;
  return false;
}

/**
 * Apply the speaker bias to a list of retrieval candidates. Pure ;
 * caller passes in the cosine-similarity-ranked list and the hint,
 * gets back a re-ranked list with same shape.
 *
 * Used in two places :
 *  1. The DB-side query already filters by similarity threshold ;
 *     the SQL doesn't know about the speaker hint. We rerank in
 *     code AFTER the DB fetch so the threshold logic stays simple.
 *  2. Tests assert ordering deterministically.
 */
export interface RankableChunk {
  speaker: string | null | undefined;
  similarity: number;
}

export function applySpeakerBias<T extends RankableChunk>(
  chunks: T[],
  hint: SpeakerHint | null,
): T[] {
  if (!hint || chunks.length === 0) return chunks;
  // Stable sort : same-speaker chunks get +SPEAKER_BIAS_BOOST to
  // their similarity for ordering purposes ; the original similarity
  // value is preserved so the caller still sees the raw ANN score.
  return [...chunks].sort((a, b) => {
    const aBoosted =
      a.similarity + (speakerMatches(a.speaker, hint) ? SPEAKER_BIAS_BOOST : 0);
    const bBoosted =
      b.similarity + (speakerMatches(b.speaker, hint) ? SPEAKER_BIAS_BOOST : 0);
    return bBoosted - aBoosted;
  });
}
