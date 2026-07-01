/**
 * Deterministic grader for the deal-READ eval.
 *
 * The deal brief is STRUCTURED output (dealBriefSchema), so we don't need an LLM
 * judge to grade it — we check the structured fields against the scenario's
 * designed golden: right risk, stall flagged when it should be, the decisive
 * signal surfaced (synonym-tolerant), nothing fabricated. Deterministic grading
 * of a structured read is more reliable + cheaper than an LLM judge.
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

/**
 * A forbidden term only counts as a fabrication when the read ASSERTS it, not
 * when it negates it. On a healthy deal the model naturally writes "not stalled"
 * / "no sign it's lost" — a naive substring match would flag that as an invented
 * stall (observed: healthy-progressing false-failed on "stalled"). Treat an
 * occurrence as negated when a negator sits in the short window right before it;
 * the term is a real claim only if ≥1 occurrence has no nearby negator.
 */
const NEGATORS = ["not ", "no ", "never ", "without ", "cannot ", "n't ", "isn't", "aren't", "wasn't"];

export function assertsToken(haystack: string, term: string): boolean {
  const hay = haystack.toLowerCase();
  const t = term.toLowerCase();
  let idx = hay.indexOf(t);
  while (idx !== -1) {
    const before = hay.slice(Math.max(0, idx - 24), idx);
    if (!NEGATORS.some((n) => before.includes(n))) return true; // un-negated → real claim
    idx = hay.indexOf(t, idx + t.length);
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

  const hay = dealReadHaystack(body);
  for (const group of golden.mustCatch) {
    if (!group.some((m) => hay.includes(m.toLowerCase()))) {
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
 * fixture, and the gate carries a real signal even in a keyless CI run.
 */
export function timelineGroundsGolden(
  scenario: DealReadScenario,
): { ok: boolean; ungrounded: string[][] } {
  const hay = formatDealTimeline(scenario.activities).toLowerCase();
  const ungrounded = scenario.golden.mustCatch.filter(
    (group) => !group.some((m) => hay.includes(m.toLowerCase())),
  );
  return { ok: ungrounded.length === 0, ungrounded };
}
