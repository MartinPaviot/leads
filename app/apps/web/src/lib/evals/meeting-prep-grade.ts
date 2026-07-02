/**
 * Deterministic grounding grader for the meeting-prep eval.
 *
 * The prep prompt instructs "Ground everything in the data above; never invent a
 * fact (write 'unknown')" — but nothing MEASURES whether the model obeys. This
 * grader reuses the proven, pure `extractHardSpecifics` (fabrication-gate.ts) to
 * find the hard specifics (counts ≥100, named third-party tools, ALLCAPS+year
 * events) the prep asserts that are ABSENT from its grounding text — i.e. the
 * model invented them. Deterministic + free; the LLM tier only produces the prep.
 *
 * HARDENED after the 2026-07-02 hostile audit:
 *  - numbers are compared as an exact TOKEN SET, not by substring against the
 *    context's concatenated digit soup (which let invented numbers false-pass on
 *    rich contexts: "1000" substring-matched "…10:00…140…8…100…");
 *  - k/M-suffixed figures ("$50k", "1.2M") are extracted and normalized on both
 *    sides — previously invisible, so an invented "$50k budget" passed;
 *  - the ambiguous TECH_DICT members "segment" and "notion" are ignored here
 *    (ordinary GTM English: "customer segment", "no notion of…");
 *  - an empty/refusal prep fails instead of vacuously passing (no specifics ⇒
 *    "grounded" was a hole).
 * Callers should pass the FULL prompt (context + doctrine block + instruction
 * envelope) as the ground truth — everything the model was legitimately given,
 * including the prompt's own "500 words" it may echo.
 */

import { extractHardSpecifics } from "./fabrication-gate";

const normNum = (s: string): string => s.replace(/\D/g, "");

/** TECH_DICT members that are also ordinary GTM English — not evidence of invention. */
const AMBIGUOUS_TECH = new Set(["segment", "notion"]);

/**
 * All number tokens in `text`, normalized to digit cores, with k/M suffixes
 * expanded ("50k"→"50000", "1.2M"→"1200000", "$8M"→"8000000"). Number-ish
 * sequences keep their thousands separators together ("3,848"→"3848") while a
 * non-numeric char splits tokens ("10:00"→"10","00").
 */
export function numberTokens(text: string): Set<string> {
  const out = new Set<string>();
  // k/M-suffixed figures first (decimal-aware).
  const suffixRe = /(\d+(?:[.,]\d+)?)\s?([km])\b/gi;
  let m: RegExpExecArray | null;
  while ((m = suffixRe.exec(text))) {
    const base = parseFloat(m[1].replace(",", "."));
    if (Number.isFinite(base)) {
      const mult = m[2].toLowerCase() === "k" ? 1_000 : 1_000_000;
      out.add(String(Math.round(base * mult)));
    }
  }
  // Plain digit sequences (thousands-separated runs stay one token).
  const numRe = /\d(?:[\d., \s]*\d)?/g;
  while ((m = numRe.exec(text))) {
    const d = normNum(m[0]);
    if (d) out.add(d);
  }
  return out;
}

/**
 * Hard specifics the prep asserts that are NOT grounded in `groundTruth` (the
 * full prompt the model received). Exact-token number comparison; tech/event
 * checks inherited from extractHardSpecifics.
 */
export function ungroundedInPrep(prep: string, groundTruth: string): string[] {
  const gt = groundTruth.toLowerCase();
  const gtNums = numberTokens(groundTruth);
  const { numbers, techTokens, events } = extractHardSpecifics(prep);
  const out = new Set<string>();
  for (const n of numbers) {
    const d = normNum(n);
    if (d && !gtNums.has(d)) out.add(n);
  }
  // k/M-suffixed prep figures extractHardSpecifics cannot see (≥4 digits keeps
  // the same "hard specific" floor as its 3-digit/count-noun heuristics).
  for (const tok of numberTokens(prep)) {
    if (tok.length >= 4 && !gtNums.has(tok)) out.add(tok);
  }
  for (const t of techTokens) {
    if (!AMBIGUOUS_TECH.has(t) && !gt.includes(t)) out.add(t);
  }
  for (const e of events) {
    if (!gt.includes(e.toLowerCase())) out.add(e);
  }
  return [...out];
}

export interface MeetingPrepGrade {
  pass: boolean;
  ungrounded: string[];
}

/** Pass when the prep is substantive AND invents no hard specific absent from its ground truth. */
export function gradeMeetingPrepGrounding(prep: string, groundTruth: string): MeetingPrepGrade {
  // An empty completion / refusal is NOT a grounded prep — it just has nothing
  // to flag. Fail it explicitly instead of vacuously passing.
  if (prep.trim().length < 40) {
    return { pass: false, ungrounded: ["empty-or-refusal prep"] };
  }
  const ungrounded = ungroundedInPrep(prep, groundTruth);
  return { pass: ungrounded.length === 0, ungrounded };
}
