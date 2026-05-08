/**
 * Tests for the grounded transcript-coaching eval suite (P0-4 4.2 + 4.3).
 *
 * Injects a stub `runLlm` so we exercise both the suite shape and
 * the per-case predicates without spending real LLM tokens. The
 * stub returns canned outputs that simulate "good model" and
 * "bad model" behaviour ; the suite must distinguish them.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/db", () => ({
  db: {
    insert: vi.fn(() => ({ values: vi.fn(() => Promise.resolve()) })),
  },
}));

import {
  buildGroundedCoachingSuite,
  __testCases,
  type RunLlmFn,
} from "@/lib/evals/suites/transcript-coaching-grounded.eval";
import { runEvalSuite } from "@/lib/evals/harness";

beforeEach(() => {
  vi.clearAllMocks();
});

const goodLlm: RunLlmFn = async (question, chunks) => {
  // Pull the case id from the question — each fixture has a unique
  // question — and emit a hand-crafted "good" answer per case.
  if (chunks === "(no relevant transcript chunks found)") {
    return "I don't have evidence in the transcript for this.";
  }
  if (question.includes("budget")) {
    // budget-direct-quote
    return `[12:34] Sarah said "Our budget for this is $50K, locked in by finance."`;
  }
  if (question.includes("Bob's main objection")) {
    return `[2:00] Bob said "Honestly, the timeline of two months feels really tight."`;
  }
  if (question.toLowerCase().includes("competitor")) {
    return `[1:00] Pat mentioned "We're also looking at Acme Tools alongside you."`;
  }
  if (question.toLowerCase().includes("close")) {
    return `[1:30] Pat said "Goal is to wrap up by Q4 2026, board's hard deadline."`;
  }
  if (question.toLowerCase().includes("decision-maker")) {
    return `[3:20] Sarah said "John Stevenson is our economic buyer ; everything goes through him."`;
  }
  // Refusal cases — chunks are present but off-topic, or numeric
  // claim isn't supported.
  if (
    question.includes("procurement") ||
    question.includes("team size")
  ) {
    return "I don't have evidence in the transcript for this.";
  }
  return "Cannot determine from transcript.";
};

const badLlm: RunLlmFn = async (question) => {
  // Hallucinates : invents amounts, wrong citations, no quotes.
  if (question.includes("budget")) {
    return `[99:99] The budget is $200K based on what I know.`;
  }
  if (question.toLowerCase().includes("competitor")) {
    return `They're looking at Salesforce — at least 3 vendors.`;
  }
  // Refuses-by-mistake on grounded questions, OR fails to refuse
  // on no-evidence questions (replies with hallucination).
  if (question.includes("procurement")) {
    return "Their procurement team is led by Mike Hansen.";
  }
  return "Some confident but ungrounded answer.";
};

describe("buildGroundedCoachingSuite — fixtures", () => {
  it("contains 5 grounding cases + 3 refusal cases (total 8)", () => {
    expect(__testCases.groundingCases).toHaveLength(5);
    expect(__testCases.refusalCases).toHaveLength(3);
  });

  it("every refusal case has expectsRefusal=true", () => {
    for (const c of __testCases.refusalCases) {
      expect(c.expectsRefusal).toBe(true);
    }
  });

  it("every grounding case has at least one chunk", () => {
    for (const c of __testCases.groundingCases) {
      expect(c.chunks.length).toBeGreaterThan(0);
    }
  });
});

describe("buildGroundedCoachingSuite — passes with goodLlm", () => {
  it("runs all 8 cases and reports them", async () => {
    const suite = buildGroundedCoachingSuite({ runLlm: goodLlm });
    expect(suite.cases).toHaveLength(8);
    const summary = await runEvalSuite(suite);
    expect(summary.casesTotal).toBe(8);
    // Good LLM should pass the bulk of the cases.
    expect(summary.casesPassed).toBeGreaterThanOrEqual(6);
  });

  it("aggregates metrics : grounding + refusal pass rates", async () => {
    const suite = buildGroundedCoachingSuite({ runLlm: goodLlm });
    const summary = await runEvalSuite(suite);
    expect(summary.metrics.grounding_cases).toBe(5);
    expect(summary.metrics.refusal_cases).toBe(3);
    expect(summary.metrics.refusal_pass_rate).toBe(1); // good LLM refuses cleanly
  });
});

describe("buildGroundedCoachingSuite — fails with badLlm", () => {
  it("badLlm does not pass the bulk of cases", async () => {
    const suite = buildGroundedCoachingSuite({ runLlm: badLlm });
    const summary = await runEvalSuite(suite);
    // Expect ≤2 cases pass when the LLM is misbehaving.
    expect(summary.casesPassed).toBeLessThanOrEqual(2);
  });

  it("badLlm trips low citation accuracy on hallucinated [99:99]", async () => {
    const suite = buildGroundedCoachingSuite({ runLlm: badLlm });
    const summary = await runEvalSuite(suite);
    expect(summary.metrics.mean_citation_accuracy).toBeLessThan(0.5);
  });

  it("badLlm fails the refusal cases that need refusal", async () => {
    const suite = buildGroundedCoachingSuite({ runLlm: badLlm });
    const summary = await runEvalSuite(suite);
    expect(summary.metrics.refusal_pass_rate).toBeLessThan(1);
  });
});

describe("buildGroundedCoachingSuite — tenant fixture overlay", () => {
  it("appends tenant fixtures with 'tenant:' id prefix", () => {
    const suite = buildGroundedCoachingSuite({
      runLlm: goodLlm,
      tenantFixtures: [
        {
          id: "hipaa-budget",
          description: "tenant-specific",
          question: "Did Sarah confirm the HIPAA budget?",
          chunks: [],
          expectsRefusal: true,
        },
      ],
    });
    expect(suite.cases.length).toBe(9);
    const ids = suite.cases.map((c) => c.id);
    expect(ids).toContain("tenant:hipaa-budget");
  });

  it("respects tenant: prefix when caller already prefixed", () => {
    const suite = buildGroundedCoachingSuite({
      runLlm: goodLlm,
      tenantFixtures: [
        {
          id: "tenant:already-prefixed",
          description: "fixture for prefix-handling test",
          question: "x",
          chunks: [],
          expectsRefusal: true,
        },
      ],
    });
    const ids = suite.cases.map((c) => c.id);
    expect(ids).toContain("tenant:already-prefixed");
    // No double-prefix.
    expect(ids).not.toContain("tenant:tenant:already-prefixed");
  });

  it("static cases still come first in declaration order", () => {
    const suite = buildGroundedCoachingSuite({
      runLlm: goodLlm,
      tenantFixtures: [
        {
          id: "z-tenant",
          description: "fixture for ordering test",
          question: "x",
          chunks: [],
          expectsRefusal: true,
        },
      ],
    });
    expect(suite.cases[0].id).toBe("budget-direct-quote");
    expect(suite.cases[suite.cases.length - 1].id).toBe("tenant:z-tenant");
  });

  it("empty tenantFixtures behaves identically to omitted", () => {
    const a = buildGroundedCoachingSuite({ runLlm: goodLlm });
    const b = buildGroundedCoachingSuite({ runLlm: goodLlm, tenantFixtures: [] });
    expect(a.cases.length).toBe(b.cases.length);
  });
});

describe("buildGroundedCoachingSuite — predicate threshold", () => {
  it("custom defaultMinScore tightens / loosens the pass bar", async () => {
    // With a permissive bar, even badLlm's grounding outputs should
    // pass at least one case (vacuous citation accuracy when no
    // citation parses).
    const lenientSuite = buildGroundedCoachingSuite({
      runLlm: badLlm,
      defaultMinScore: 0.05,
    });
    const lenient = await runEvalSuite(lenientSuite);
    const strictSuite = buildGroundedCoachingSuite({
      runLlm: badLlm,
      defaultMinScore: 0.95,
    });
    const strict = await runEvalSuite(strictSuite);
    expect(lenient.casesPassed).toBeGreaterThanOrEqual(strict.casesPassed);
  });
});
