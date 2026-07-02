/**
 * Deterministic grader for the deal-READ eval.
 *
 * The deal brief is STRUCTURED output (dealBriefSchema), so we don't need an LLM
 * judge to grade it — we check the structured fields against the scenario's
 * designed golden: right risk, stall flagged when it should be, the decisive
 * signal surfaced (synonym-tolerant), nothing fabricated. Deterministic grading
 * of a structured read is more reliable + cheaper than an LLM judge.
 *
 * HARDENED after the 2026-07-02 hostile audit, which produced three confirmed
 * false-verdict classes in the original grader:
 *  - substring matches with no word boundary ("assigned" asserted "signed",
 *    "installed" asserted "stalled") — could fail the PINNED scenario on a
 *    perfectly correct read;
 *  - the 24-char negator window missed long-range negation ("no indication
 *    that the deal has stalled" flagged as fabrication);
 *  - mustCatch counted NEGATED mentions ("no specific competitor was
 *    mentioned" satisfied the competitor group).
 * All three checks now share assertsToken: word-boundary occurrences, negation
 * judged over the containing CLAUSE (up to the previous ./!/?/;/newline), with
 * "not only" excluded from negators.
 */

import type { DealBrief } from "@/lib/deals/deal-briefing-schema";
import { formatDealTimeline } from "@/lib/deals/deal-briefing-prompt";
import type { DealReadGolden, DealReadScenario } from "./deal-read-cases";

/** The LLM-produced part of the brief (buildDealBrief omits the passthrough meta). */
export type DealBriefBody = Omit<
  DealBrief,
  "dealId" | "dealName" | "stage" | "value" | "contactName" | "companyName" | "daysInStage"
>;

/** Everything the read asserts, lower-cased, for containment checks. */
export function dealReadHaystack(b: DealBriefBody): string {
  const parts: string[] = [b.summary, b.stallReason ?? "", b.nextAction?.action ?? ""];
  for (const d of b.keyDiscussions ?? []) parts.push(d.topic, d.verbatimQuote ?? "");
  for (const o of b.objectionsRaised ?? []) parts.push(o.objection, o.ourResponse ?? "");
  for (const p of b.promisesMade ?? []) parts.push(p.what);
  return parts.join(" \n ").toLowerCase();
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Word-boundary occurrences of `term` in `hay` (unicode letters/digits bound). */
function tokenIndices(hay: string, term: string): number[] {
  const re = new RegExp(`(?<![\\p{L}\\p{N}])${escapeRe(term)}(?![\\p{L}\\p{N}])`, "giu");
  const out: number[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(hay))) out.push(m.index);
  return out;
}

/**
 * A negator that plausibly scopes over a term up to 6 words later, anchored at
 * the end of the clause-prefix before the term. "not only" is exempt (it
 * AFFIRMS: "not only is it stalled…").
 */
const NEGATION_BEFORE =
  /(?:\bnot(?!\s+only\b)|\bno\b|\bnever\b|\bwithout\b|\bisn'?t\b|\bwasn'?t\b|\baren'?t\b|\bdoesn'?t\b|\bdidn'?t\b|\bhasn'?t\b|\bhaven'?t\b)(?:\s+\S+){0,6}\s*$/i;

/**
 * True when the haystack ASSERTS the term: at least one word-boundary
 * occurrence whose containing clause does not negate it. Clause = text since
 * the previous sentence/clause delimiter (./!/?/;/newline).
 */
export function assertsToken(haystack: string, term: string): boolean {
  const hay = haystack.toLowerCase();
  const t = term.toLowerCase();
  for (const idx of tokenIndices(hay, t)) {
    const clauseStart =
      Math.max(
        hay.lastIndexOf(".", idx - 1),
        hay.lastIndexOf("!", idx - 1),
        hay.lastIndexOf("?", idx - 1),
        hay.lastIndexOf(";", idx - 1),
        hay.lastIndexOf("\n", idx - 1),
      ) + 1;
    const before = hay.slice(clauseStart, idx);
    if (!NEGATION_BEFORE.test(before)) return true; // un-negated → real claim
  }
  return false;
}

export interface DealReadGrade {
  pass: boolean;
  failures: string[];
}

export function gradeDealRead(
  body: DealBriefBody,
  golden: DealReadGolden,
): DealReadGrade {
  const failures: string[] = [];

  if (!golden.expectedRisk.includes(body.riskLevel)) {
    failures.push(`risk=${body.riskLevel} ∉ {${golden.expectedRisk.join(",")}}`);
  }
  if (golden.expectedStalled && !body.stallReason) {
    failures.push("expected a stallReason, got null");
  }
  // Only enforced where the golden explicitly forbids it — some non-stalled
  // scenarios (e.g. an explicit churn) can legitimately carry a stallReason.
  if (golden.forbidStallReason && body.stallReason) {
    failures.push(`unexpected stallReason on a healthy deal: "${body.stallReason.slice(0, 60)}"`);
  }

  const hay = dealReadHaystack(body);
  for (const group of golden.mustCatch) {
    // The signal must be ASSERTED, not merely mentioned-and-denied.
    if (!group.some((m) => assertsToken(hay, m))) {
      failures.push(`missed the signal [${group.join("|")}]`);
    }
  }
  for (const f of golden.mustNotFabricate) {
    if (assertsToken(hay, f)) failures.push(`fabricated "${f}"`);
  }

  return { pass: failures.length === 0, failures };
}

/**
 * Fixture soundness (keyless): every mustCatch group has ≥1 member verbatim in
 * the scenario's timeline — so a grading miss is the READ's fault, not a broken
 * fixture — and no mustNotFabricate token is ASSERTED by the timeline itself
 * (else a faithful quote of the evidence would grade as fabrication).
 */
export function timelineGroundsGolden(
  scenario: DealReadScenario,
): { ok: boolean; ungrounded: string[][]; contaminated: string[] } {
  const hay = formatDealTimeline(scenario.activities).toLowerCase();
  const ungrounded = scenario.golden.mustCatch.filter(
    (group) => !group.some((m) => hay.includes(m.toLowerCase())),
  );
  const contaminated = scenario.golden.mustNotFabricate.filter((f) => assertsToken(hay, f));
  return { ok: ungrounded.length === 0 && contaminated.length === 0, ungrounded, contaminated };
}
