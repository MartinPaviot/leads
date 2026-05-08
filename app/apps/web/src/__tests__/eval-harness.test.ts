import { describe, it, expect, vi } from "vitest";

vi.mock("@/db", () => ({
  db: {
    insert: vi.fn(() => ({
      values: vi.fn().mockResolvedValue(undefined),
    })),
  },
}));
vi.mock("@/db/schema", () => ({ llmEvalRuns: {}, llmEvalCaseRuns: {} }));
vi.mock("@/lib/observability/logger", () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { runEvalSuite, type EvalSuite } from "@/lib/evals/harness";
import { runCitationParserEval } from "@/lib/evals/suites/citation-parser.eval";

describe("runEvalSuite", () => {
  it("counts pass/fail/errored correctly", async () => {
    const suite: EvalSuite<number> = {
      surfaceId: "test",
      promptId: "test.v1",
      cases: [
        { id: "a", run: async () => 1, predicate: (n) => n === 1 },
        { id: "b", run: async () => 2, predicate: (n) => n === 1 },
        {
          id: "c",
          run: async () => {
            throw new Error("boom");
          },
          predicate: () => true,
        },
      ],
    };

    const summary = await runEvalSuite(suite);
    expect(summary.casesTotal).toBe(3);
    expect(summary.casesPassed).toBe(1);
    expect(summary.casesErrored).toBe(1);
    expect(summary.perCase[0].passed).toBe(true);
    expect(summary.perCase[1].passed).toBe(false);
    expect(summary.perCase[1].errored).toBe(false);
    expect(summary.perCase[2].errored).toBe(true);
  });

  it("invokes aggregateMetrics with successful cases only", async () => {
    const aggregate = vi.fn(
      (_results: Array<{ caseId: string; output: number; passed: boolean }>) =>
        ({ score: 0.5 }),
    );
    const suite: EvalSuite<number> = {
      surfaceId: "test",
      promptId: "test.v1",
      cases: [
        { id: "a", run: async () => 1, predicate: () => true },
        {
          id: "b",
          run: async () => {
            throw new Error("nope");
          },
          predicate: () => true,
        },
      ],
      aggregateMetrics: aggregate,
    };

    const summary = await runEvalSuite(suite);
    expect(aggregate).toHaveBeenCalledOnce();
    const passedToAgg = aggregate.mock.calls[0]![0];
    // Only the successful case should reach the aggregator.
    expect(passedToAgg).toHaveLength(1);
    expect(passedToAgg[0]!.caseId).toBe("a");
    expect(summary.metrics.score).toBe(0.5);
  });

  it("treats predicate-throws as fail (not errored)", async () => {
    const suite: EvalSuite<number> = {
      surfaceId: "test",
      promptId: "test.v1",
      cases: [
        {
          id: "a",
          run: async () => 1,
          predicate: () => {
            throw new Error("predicate boom");
          },
        },
      ],
    };
    const summary = await runEvalSuite(suite);
    expect(summary.casesErrored).toBe(0);
    expect(summary.casesPassed).toBe(0);
  });
});

describe("citation-parser eval suite", () => {
  it("runs end-to-end and reports a non-zero pass rate", async () => {
    const summary = await runCitationParserEval();
    expect(summary.surfaceId).toBe("citation-parser");
    expect(summary.casesTotal).toBe(8);
    // Every case should pass — the parser is deterministic.
    expect(summary.casesPassed).toBe(8);
    expect(summary.casesErrored).toBe(0);
    expect(summary.metrics.pass_rate).toBe(1);
  });
});
