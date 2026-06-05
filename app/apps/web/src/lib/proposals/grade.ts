/**
 * PROPOSAL-009: independent trust grading. The LLM's self-rated confidence is
 * not trusted on its own — we verify that a section's claims are actually
 * supported by the sources it cites (deterministic token-overlap), and derive a
 * confidence that is the conservative MIN of the grade and the self-rating.
 * Catches the common failure: confident prose citing a source that doesn't
 * support it ("citation hallucination").
 *
 * v1 grader is deterministic overlap; an LLM entailment pass can be layered in
 * later behind a key flag (see spec). Pure + fully testable in-sandbox.
 */

export type Confidence = "high" | "medium" | "low";

const STOP = new Set([
  "this",
  "that",
  "with",
  "your",
  "their",
  "from",
  "will",
  "have",
  "they",
  "them",
  "then",
  "than",
  "into",
  "over",
  "more",
  "most",
  "such",
  "also",
  "been",
  "were",
  "what",
  "when",
  "which",
  "would",
  "could",
  "should",
  "about",
  "these",
  "those",
]);

function sigTokens(s: string): string[] {
  const m = s.toLowerCase().match(/[a-z0-9]{4,}/g);
  return m ? m.filter((t) => !STOP.has(t)) : [];
}

const RANK: Record<Confidence, number> = { low: 0, medium: 1, high: 2 };

export interface GradeResult {
  supportRatio: number; // 0..1: fraction of claim sentences backed by a cited source
  confidence: Confidence; // conservative MIN(grade, self-rating)
  unsupported: boolean; // true when the section is poorly grounded
}

/**
 * Grade a section's grounding against the text of the sources it cited.
 * No citations, or low overlap, ⇒ low confidence + unsupported.
 */
export function gradeSection(
  content: string,
  citationSnippets: string[],
  selfRated: Confidence,
): GradeResult {
  const text = content.trim();
  if (!text) return { supportRatio: 0, confidence: "low", unsupported: true };
  if (citationSnippets.length === 0) {
    return { supportRatio: 0, confidence: "low", unsupported: true };
  }

  const sourceTokens = new Set(citationSnippets.flatMap(sigTokens));
  const sentences = text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  let supported = 0;
  for (const sentence of sentences) {
    const toks = sigTokens(sentence);
    if (toks.length === 0) {
      supported++; // trivial / no claim tokens — don't penalize
      continue;
    }
    const overlap = toks.filter((t) => sourceTokens.has(t)).length / toks.length;
    if (overlap >= 0.3) supported++;
  }

  const supportRatio = sentences.length ? supported / sentences.length : 0;
  const graded: Confidence =
    supportRatio >= 0.6 ? "high" : supportRatio >= 0.35 ? "medium" : "low";
  // Independent + conservative: take the lower of the grade and the self-rating.
  const confidence: Confidence = RANK[graded] <= RANK[selfRated] ? graded : selfRated;

  return { supportRatio, confidence, unsupported: supportRatio < 0.35 };
}
