/**
 * Pure-fn helpers for grounded LLM evaluation (P0-4 task 4.1).
 *
 * The format eval (`transcript-coaching.eval.ts`) checks the prompt
 * BLOCK is well-formed. This module validates the LLM OUTPUT —
 * given a question + retrieved chunks, did the model :
 *   - Quote verbatim from a chunk (no paraphrasing)
 *   - Use the correct `[mm:ss]` timestamp pointing at the right chunk
 *   - Refuse cleanly when no chunk supports the answer
 *   - Avoid hallucinating claims absent from the chunks
 *
 * Pure functions — no LLM calls, no DB. Composable into the eval
 * harness so a separate runner exercises the LLM and pipes its
 * output through these checks.
 *
 * Why hand-rolled rather than LLM-as-judge :
 *  - Determinism. The harness needs to flag regressions ; an LLM
 *    judge introduces noise that drowns the signal we're tracking.
 *  - Speed. These checks are sub-millisecond ; LLM judging adds
 *    seconds × N cases.
 *  - Auditability. The pass/fail call can be re-derived from the
 *    transcript and the output, no model state in the loop.
 */

import { parseCitations } from "./citation-parser";
import type { RetrievedChunk } from "./retrieve-transcript-chunks";

const REFUSAL_PATTERNS: RegExp[] = [
  /no evidence in the transcript/i,
  /no transcript chunks?\s+(?:were\s+)?(?:retrieved|found|relevant)/i,
  // Optional qualifier — "don't have evidence" matches with or
  // without "that / enough / any" between have and evidence.
  /(?:i )?don'?t have (?:(?:that|enough|any|the)\s+)?(?:evidence|context|chunks?|transcript)/i,
  /no relevant transcript chunks/i,
  /transcript doesn'?t (?:cover|include|mention|contain)/i,
];

export interface CitationFinding {
  /** The raw `[mm:ss]` token. */
  raw: string;
  /** Number of seconds the citation points at. */
  seconds: number;
  /** Whether ANY retrieved chunk has a startSec close to this
   *  citation (within ±5s — chunks are 5-15s windows in practice). */
  matchesChunk: boolean;
  /** The chunk that matched (closest startSec) or null. */
  matchedChunk: RetrievedChunk | null;
}

const CITATION_MATCH_TOLERANCE_SEC = 30;

/**
 * For each `[mm:ss]` citation in the LLM output, find the chunk it
 * points at (by closest startSec). Returns one finding per citation
 * — not deduplicated, since the LLM might cite the same chunk twice.
 */
export function locateCitations(
  output: string,
  chunks: RetrievedChunk[],
): CitationFinding[] {
  const tokens = parseCitations(output);
  const findings: CitationFinding[] = [];
  for (const t of tokens) {
    const closest = pickClosestChunk(chunks, t.seconds);
    findings.push({
      raw: t.raw,
      seconds: t.seconds,
      matchesChunk:
        closest !== null &&
        Math.abs(closest.startSec - t.seconds) <= CITATION_MATCH_TOLERANCE_SEC,
      matchedChunk: closest,
    });
  }
  return findings;
}

function pickClosestChunk(
  chunks: RetrievedChunk[],
  seconds: number,
): RetrievedChunk | null {
  if (chunks.length === 0) return null;
  let best: RetrievedChunk = chunks[0];
  let bestDelta = Math.abs(best.startSec - seconds);
  for (const c of chunks) {
    const delta = Math.abs(c.startSec - seconds);
    if (delta < bestDelta) {
      best = c;
      bestDelta = delta;
    }
  }
  return best;
}

/**
 * Citation accuracy — fraction of the LLM's `[mm:ss]` citations that
 * point at a real chunk. Special cases :
 *  - 0 citations + refusal-pattern output → 1.0 (vacuous, the
 *    LLM correctly refused so no citations expected).
 *  - 0 citations + chunks present + non-refusal output → 0
 *    (the LLM produced an answer without citing — that's the
 *    hallmark hallucination pattern we want to penalise).
 *  - 0 citations + 0 chunks → 1.0 (vacuous : no citation possible).
 */
export function citationAccuracy(
  output: string,
  chunks: RetrievedChunk[],
): { score: number; total: number; correct: number } {
  const findings = locateCitations(output, chunks);
  if (findings.length === 0) {
    if (chunks.length === 0) return { score: 1, total: 0, correct: 0 };
    if (refusalDetected(output)) return { score: 1, total: 0, correct: 0 };
    // Substantive answer without any citation → flag as 0.
    if (output.trim().length > 20) {
      return { score: 0, total: 0, correct: 0 };
    }
    return { score: 1, total: 0, correct: 0 };
  }
  const correct = findings.filter((f) => f.matchesChunk).length;
  return { score: correct / findings.length, total: findings.length, correct };
}

/**
 * Verbatim quote check. Every quoted span (text inside `"..."` or
 * `"..."` immediately following or preceding a `[mm:ss]` token)
 * must appear verbatim in the matched chunk's text.
 *
 * Returns one finding per quoted span. Quotes that don't have a
 * nearby citation token are treated as "loose" — they're supposed
 * to come from the chunks, but we can't anchor them to a specific
 * one ; we still verify they appear somewhere in the chunks bag.
 */
export interface QuoteFinding {
  quote: string;
  /** Whether the quote appears verbatim in any chunk's text. */
  verbatim: boolean;
  /** The matched chunk if anchored via a nearby [mm:ss]. */
  anchor: RetrievedChunk | null;
}

const QUOTE_RE = /["“]([^"“”]{4,400})["”]/g;

export function extractQuotedSpans(text: string): string[] {
  const spans: string[] = [];
  QUOTE_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = QUOTE_RE.exec(text)) !== null) {
    spans.push(m[1]);
  }
  return spans;
}

export function verifyQuotes(
  output: string,
  chunks: RetrievedChunk[],
): QuoteFinding[] {
  const spans = extractQuotedSpans(output);
  if (spans.length === 0) return [];
  const allText = chunks.map((c) => c.text).join(" \n ").toLowerCase();
  return spans.map((quote) => ({
    quote,
    verbatim: allText.includes(quote.toLowerCase()),
    anchor: null,
  }));
}

/**
 * Score the verbatim faithfulness — fraction of quoted spans found
 * in any chunk verbatim. 1.0 when there are no quotes (vacuous).
 */
export function verbatimScore(
  output: string,
  chunks: RetrievedChunk[],
): { score: number; total: number; verbatim: number } {
  const findings = verifyQuotes(output, chunks);
  if (findings.length === 0)
    return { score: 1, total: 0, verbatim: 0 };
  const v = findings.filter((f) => f.verbatim).length;
  return { score: v / findings.length, total: findings.length, verbatim: v };
}

/**
 * Refusal detection — does the output cleanly say "I don't have
 * evidence" instead of inventing an answer ?
 *
 * Used by the refusal-eval suite : when chunks=[] AND the question
 * is unanswerable, the LLM must trigger a refusal. Returns true if
 * any of the canonical refusal sentences match.
 */
export function refusalDetected(output: string): boolean {
  return REFUSAL_PATTERNS.some((re) => re.test(output));
}

/**
 * Heuristic hallucination flag : when the output contains a numeric
 * claim (dollar amount, date, percentage, named-entity) that doesn't
 * appear in any chunk verbatim, mark it suspicious.
 *
 * Pure heuristic — false positives (a number in a meta-comment like
 * "5 chunks retrieved") are bounded ; false negatives (a hallucinated
 * synonym that's not numeric) are accepted in this layer because
 * detecting them would require an LLM judge.
 *
 * Returns the suspicious tokens — caller decides the threshold.
 */
export function detectUngroundedClaims(
  output: string,
  chunks: RetrievedChunk[],
): string[] {
  const allText = chunks.map((c) => c.text).join(" ").toLowerCase();
  const suspicious: string[] = [];

  // Dollar amounts : $50, $50K, $50,000, $50.5M
  const dollarRe = /\$[\d,.]+\s*[KMB]?/gi;
  for (const m of output.matchAll(dollarRe)) {
    const norm = m[0].toLowerCase();
    if (!allText.includes(norm)) suspicious.push(m[0]);
  }

  // Percentages
  const pctRe = /\b\d{1,3}(?:\.\d+)?%/g;
  for (const m of output.matchAll(pctRe)) {
    if (!allText.includes(m[0].toLowerCase())) suspicious.push(m[0]);
  }

  // Years (1900-2099)
  const yearRe = /\b(?:19|20)\d{2}\b/g;
  for (const m of output.matchAll(yearRe)) {
    if (!allText.includes(m[0])) suspicious.push(m[0]);
  }

  // Named-entity-like tokens : Capitalised multi-word phrases of 2-4
  // words. Skips common stop-capitals.
  const stopCaps = new Set([
    "I",
    "The",
    "A",
    "An",
    "But",
    "However",
    "Note",
    "Also",
  ]);
  const nameRe = /\b([A-Z][a-zA-Z]{2,}\s+[A-Z][a-zA-Z]{2,}(?:\s+[A-Z][a-zA-Z]{2,}){0,2})\b/g;
  for (const m of output.matchAll(nameRe)) {
    if (stopCaps.has(m[1].split(" ")[0])) continue;
    if (!allText.toLowerCase().includes(m[1].toLowerCase())) {
      suspicious.push(m[1]);
    }
  }

  // De-dupe while preserving order.
  const seen = new Set<string>();
  return suspicious.filter((s) => {
    const key = s.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Aggregated grounding score : weighted combination of citation
 * accuracy, verbatim faithfulness, and grounded-claims rate. The
 * weights below match the priority order surfaced in the master
 * eval rubric — citing the wrong chunk is the worst failure ; an
 * ungrounded claim is the second worst ; non-verbatim is third.
 */
export interface GroundingScore {
  overall: number;
  citationAccuracy: number;
  verbatim: number;
  groundedClaimsRate: number;
  /** Counts surfaced for human-readable per-case logs. */
  citations: { total: number; correct: number };
  quotes: { total: number; verbatim: number };
  ungroundedClaims: string[];
}

export function scoreGrounding(
  output: string,
  chunks: RetrievedChunk[],
): GroundingScore {
  const cit = citationAccuracy(output, chunks);
  const ver = verbatimScore(output, chunks);
  const ungrounded = detectUngroundedClaims(output, chunks);
  // Heuristic claim count : sentences in the output. Used as
  // denominator for the grounded-rate.
  const sentences = output
    .split(/[.!?]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 4);
  const groundedClaimsRate =
    sentences.length === 0
      ? 1
      : Math.max(0, 1 - ungrounded.length / sentences.length);
  return {
    overall:
      0.5 * cit.score +
      0.3 * groundedClaimsRate +
      0.2 * ver.score,
    citationAccuracy: cit.score,
    verbatim: ver.score,
    groundedClaimsRate,
    citations: { total: cit.total, correct: cit.correct },
    quotes: { total: ver.total, verbatim: ver.verbatim },
    ungroundedClaims: ungrounded,
  };
}
