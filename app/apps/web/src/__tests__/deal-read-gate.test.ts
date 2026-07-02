/**
 * Deal-READ gate — does the AI's read of a deal match the correct STRATEGIC read?
 *
 * The schema-only suite (lib/evals/suites/deal-briefing.eval.ts) deferred the
 * "LLM-grounded golden" eval as a separate cycle. This is that cycle. 6 synthetic
 * scenarios probe the hard part: a warm tone hiding a stall, a buried objection,
 * a silent ghost, an explicit churn. Each has a DESIGNED golden read.
 *
 * KEYLESS floor (always, CI): the fixtures are sound — every mustCatch signal is
 * grounded verbatim in its timeline.
 * LLM tier (skipIf no key): run the EXACT prod deal-briefing prompt (reused via
 * the extracted seam) through generateObject, then grade the structured output
 * DETERMINISTICALLY (right risk, stall flagged, signal caught, nothing invented).
 * Wired into eval:run; runs locally / in a keyed cron, skips in keyless CI.
 */

import { describe, it, expect } from "vitest";
import { DEAL_READ_SCENARIOS } from "@/lib/evals/deal-read-cases";
import {
  assertsToken,
  gradeDealRead,
  timelineGroundsGolden,
  type DealBriefBody,
} from "@/lib/evals/deal-read-grade";
import {
  buildDealBriefPrompt,
  formatDealTimeline,
  getDealBriefModel,
} from "@/lib/deals/deal-briefing-prompt";
import { dealBriefSchema } from "@/lib/deals/deal-briefing-schema";

const HAS_LLM = !!process.env.ANTHROPIC_API_KEY || !!process.env.OPENAI_API_KEY;

const BODY_SCHEMA = dealBriefSchema.omit({
  dealId: true,
  dealName: true,
  stage: true,
  value: true,
  contactName: true,
  companyName: true,
  daysInStage: true,
});

describe("deal-read fixtures are sound (keyless)", () => {
  it("every scenario's mustCatch is grounded in its timeline and no mustNotFabricate is asserted by it", () => {
    const broken = DEAL_READ_SCENARIOS.filter((s) => !timelineGroundsGolden(s).ok);
    expect(broken.map((s) => s.id)).toEqual([]);
  });
});

// Regression locks for the 2026-07-02 hostile-audit findings: each of these was
// a REAL false verdict the original grader produced. They must never come back.
describe("deal-read grader soundness (keyless)", () => {
  it("word boundaries: 'assigned'/'installed' do not assert 'signed'/'stalled'", () => {
    expect(assertsToken("sarah was assigned to chase procurement", "signed")).toBe(false);
    expect(assertsToken("the proposal is designed to fit their rollout", "signed")).toBe(false);
    expect(assertsToken("the platform will be installed after signature", "stalled")).toBe(false);
    expect(assertsToken("the msa was signed yesterday", "signed")).toBe(true);
  });

  it("long-range negation in the clause is not a fabrication", () => {
    expect(assertsToken("there is no indication that the deal has stalled", "stalled")).toBe(false);
    expect(assertsToken("we have not heard that they chose a competitor", "competitor")).toBe(false);
    // …but a negation in a PREVIOUS clause does not neutralize an assertion.
    expect(assertsToken("we should not delay; the deal has stalled", "stalled")).toBe(true);
  });

  it("'not only' affirms rather than negates", () => {
    expect(assertsToken("not only is it stalled, the champion left", "stalled")).toBe(true);
  });

  it("terms that BEGIN with a negator still assert (ghosting vocabulary)", () => {
    expect(assertsToken("there was no response to three follow-ups", "no response")).toBe(true);
    expect(assertsToken("we haven't heard back since the demo", "haven't heard")).toBe(true);
  });

  it("mustCatch requires an ASSERTED mention — a denied signal does not count", () => {
    const body = {
      summary: "no specific competitor was mentioned; they chose to defer this cycle",
      riskLevel: "high",
      healthScore: 30,
      stallReason: null,
      nextAction: { action: "requalify next quarter", priority: "medium" },
      keyDiscussions: [],
      promisesMade: [],
      objectionsRaised: [],
    } as unknown as Parameters<typeof gradeDealRead>[0];
    const grade = gradeDealRead(body, {
      expectedRisk: ["high", "critical"],
      expectedStalled: false,
      mustCatch: [["another vendor", "competitor", "other vendor"]],
      mustNotFabricate: [],
    });
    expect(grade.pass).toBe(false);
    expect(grade.failures.join(" ")).toContain("missed the signal");
  });

  it("forbidStallReason fails a stallReason on a designed-healthy golden", () => {
    const body = {
      summary: "progressing well",
      riskLevel: "low",
      healthScore: 85,
      stallReason: "waiting on security review",
      nextAction: { action: "confirm Tuesday call", priority: "high" },
      keyDiscussions: [],
      promisesMade: [],
      objectionsRaised: [],
    } as unknown as Parameters<typeof gradeDealRead>[0];
    const grade = gradeDealRead(body, {
      expectedRisk: ["low", "medium"],
      expectedStalled: false,
      forbidStallReason: true,
      mustCatch: [],
      mustNotFabricate: [],
    });
    expect(grade.pass).toBe(false);
    expect(grade.failures.join(" ")).toContain("unexpected stallReason");
  });
});

describe.skipIf(!HAS_LLM)("deal-read — the AI read matches the designed strategic read", () => {
  it(
    "passes ≥5/6 scenarios (right risk, stall flagged, signal caught, no fabrication)",
    async () => {
      const { generateObject } = await import("ai");
      const model = getDealBriefModel();
      // HAS_LLM gates this describe, so a key exists → model must resolve.
      // Assert rather than early-return so a broken selection can't pass vacuously.
      expect(model, "HAS_LLM is true but getDealBriefModel() returned null").toBeTruthy();
      if (!model) return;

      let passed = 0;
      const detail: string[] = [];
      const passedById: Record<string, boolean> = {};
      for (const s of DEAL_READ_SCENARIOS) {
        const prompt = buildDealBriefPrompt({
          dealName: s.deal.name,
          stage: s.deal.stage,
          value: s.deal.value,
          companyName: s.companyName,
          contactName: s.contactName,
          contactTitle: s.contactTitle,
          daysInStage: s.deal.daysInStage,
          stallBucket: s.deal.stallBucket,
          dealSummary: s.deal.summary,
          activityCount: s.activities.length,
          timeline: formatDealTimeline(s.activities),
          graphSection: "None extracted",
          signalSection: "None extracted",
        });

        let body: DealBriefBody;
        try {
          const res = await generateObject({
            model: model as unknown as Parameters<typeof generateObject>[0]["model"],
            schema: BODY_SCHEMA,
            prompt,
          });
          body = res.object as DealBriefBody;
        } catch (e) {
          detail.push(`${s.id}: generate error ${(e as Error).message}`);
          continue;
        }

        const grade = gradeDealRead(body, s.golden);
        passedById[s.id] = grade.pass;
        if (grade.pass) passed++;
        else detail.push(`${s.id}: ${grade.failures.join("; ")} [risk=${body.riskLevel}]`);
      }

      // eslint-disable-next-line no-console
      console.log(
        `[deal-read] passed ${passed}/${DEAL_READ_SCENARIOS.length}` +
          (detail.length ? ` — ${detail.join(" | ")}` : " (all correct)"),
      );
      // Aggregate floor tolerates ONE stochastic flip (LLM nondeterminism).
      expect(passed, detail.join(" | ")).toBeGreaterThanOrEqual(5);
      // But the exact scenario the tone-mask fix targets MUST pass — this is the
      // regression guard. It was the single miss in the pre-fix 5/6 run, so this
      // assertion is precisely what makes the pre-fix state fail the gate.
      expect(
        passedById["warm-tone-hiding-a-stall"],
        "warm-tone-hiding-a-stall regressed — a warm tone is masking a stall again",
      ).toBe(true);
    },
    180_000,
  );
});
