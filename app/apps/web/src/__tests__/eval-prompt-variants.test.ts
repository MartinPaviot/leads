import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock DB so the runner's persist call is a no-op recorder.
const insertSpy = vi.fn();

vi.mock("@/db", () => ({
  db: {
    insert: vi.fn(() => ({
      values: vi.fn(async (payload: unknown) => {
        insertSpy(payload);
      }),
    })),
  },
}));

vi.mock("@/db/schema", () => ({
  evalRuns: { _mockId: "eval_runs" },
}));

import {
  compareVariants,
  runEvalSuiteFamily,
  type EvalSuite,
  type EvalSuiteFamily,
  type VariantSummary,
} from "@/lib/evals/harness";

beforeEach(() => {
  insertSpy.mockClear();
});

function summary(
  variantId: string,
  passRate: number,
  promptId: string = `${variantId}.v1`,
): VariantSummary {
  return {
    variantId,
    promptId,
    label: variantId,
    passRate,
    casesTotal: 10,
    casesPassed: Math.round(passRate * 10),
    casesErrored: 0,
    totalLatencyMs: 1000,
    metrics: {},
  };
}

describe("compareVariants", () => {
  it("empty input returns empty comparison", () => {
    const c = compareVariants("test-surface", []);
    expect(c).toEqual({
      surfaceId: "test-surface",
      variants: [],
      winnerId: null,
      marginDelta: 0,
    });
  });

  it("single variant has no runner-up, marginDelta=0, winner=that one", () => {
    const c = compareVariants("test-surface", [summary("a", 0.8)]);
    expect(c.winnerId).toBe("a");
    expect(c.marginDelta).toBe(0);
  });

  it("ranks by pass rate, picks winner by highest", () => {
    const c = compareVariants("test-surface", [
      summary("a", 0.6),
      summary("b", 0.9),
      summary("c", 0.5),
    ]);
    expect(c.variants[0].variantId).toBe("b");
    expect(c.winnerId).toBe("b");
    expect(c.marginDelta).toBeCloseTo(0.3, 4);
  });

  it("returns null winnerId on tie", () => {
    const c = compareVariants("test-surface", [
      summary("a", 0.7),
      summary("b", 0.7),
    ]);
    expect(c.winnerId).toBeNull();
    expect(c.marginDelta).toBe(0);
  });

  it("rounds marginDelta to 4 decimals", () => {
    const c = compareVariants("test-surface", [
      summary("a", 0.8333333),
      summary("b", 0.5),
    ]);
    expect(c.marginDelta).toBe(0.3333);
  });

  it("does not mutate the input array", () => {
    const input = [summary("a", 0.5), summary("b", 0.9)];
    const before = input.map((s) => s.variantId);
    compareVariants("x", input);
    expect(input.map((s) => s.variantId)).toEqual(before);
  });
});

describe("runEvalSuiteFamily", () => {
  function buildSuiteForVariant(
    variantId: string,
    promptId: string,
    passes: number,
    fails: number,
  ): EvalSuite<string> {
    const cases = [
      ...Array.from({ length: passes }, (_, i) => ({
        id: `${variantId}-pass-${i}`,
        run: async () => `${variantId}-output`,
        predicate: () => true,
      })),
      ...Array.from({ length: fails }, (_, i) => ({
        id: `${variantId}-fail-${i}`,
        run: async () => `${variantId}-output`,
        predicate: () => false,
      })),
    ];
    return {
      surfaceId: "test-surface",
      promptId,
      cases,
    };
  }

  it("runs each variant + persists one row per variant", async () => {
    const family: EvalSuiteFamily<string> = {
      surfaceId: "test-surface",
      variants: [
        { id: "control", promptId: "test.v1" },
        { id: "treatment", promptId: "test.v2" },
      ],
      buildSuite: (v) =>
        v.id === "control"
          ? buildSuiteForVariant(v.id, v.promptId, 8, 2)
          : buildSuiteForVariant(v.id, v.promptId, 9, 1),
    };
    const result = await runEvalSuiteFamily(family);
    expect(result.summaries).toHaveLength(2);
    // Two persist calls — one per variant.
    expect(insertSpy).toHaveBeenCalledTimes(2);
    const persistedPromptIds = insertSpy.mock.calls.map(
      (c) => (c[0] as { promptId: string }).promptId,
    );
    expect(persistedPromptIds.sort()).toEqual(["test.v1", "test.v2"]);
  });

  it("comparison ranks variants by pass rate", async () => {
    const family: EvalSuiteFamily<string> = {
      surfaceId: "test-surface",
      variants: [
        { id: "low", promptId: "low.v1" },
        { id: "high", promptId: "high.v1" },
      ],
      buildSuite: (v) =>
        v.id === "low"
          ? buildSuiteForVariant(v.id, v.promptId, 4, 6) // 0.4
          : buildSuiteForVariant(v.id, v.promptId, 9, 1), // 0.9
    };
    const result = await runEvalSuiteFamily(family);
    expect(result.comparison.variants[0].variantId).toBe("high");
    expect(result.comparison.winnerId).toBe("high");
    expect(result.comparison.marginDelta).toBeCloseTo(0.5, 4);
  });

  it("returns null winner on identical pass rates", async () => {
    const family: EvalSuiteFamily<string> = {
      surfaceId: "test-surface",
      variants: [
        { id: "a", promptId: "a.v1" },
        { id: "b", promptId: "b.v1" },
      ],
      buildSuite: (v) => buildSuiteForVariant(v.id, v.promptId, 7, 3),
    };
    const result = await runEvalSuiteFamily(family);
    expect(result.comparison.winnerId).toBeNull();
  });

  it("0-variant family returns empty without persisting", async () => {
    const family: EvalSuiteFamily<string> = {
      surfaceId: "x",
      variants: [],
      buildSuite: () => {
        throw new Error("not called");
      },
    };
    const result = await runEvalSuiteFamily(family);
    expect(result.summaries).toEqual([]);
    expect(result.comparison.variants).toEqual([]);
    expect(insertSpy).not.toHaveBeenCalled();
  });

  it("overrides surfaceId / promptId drift from a buggy buildSuite", async () => {
    const family: EvalSuiteFamily<string> = {
      surfaceId: "canonical-surface",
      variants: [{ id: "v1", promptId: "canonical.v1" }],
      buildSuite: () => ({
        surfaceId: "wrong-surface", // drift !
        promptId: "wrong-prompt", // drift !
        cases: [
          { id: "c1", run: async () => "x", predicate: () => true },
        ],
      }),
    };
    const result = await runEvalSuiteFamily(family);
    // Persisted row should still carry the family-canonical IDs.
    const persisted = insertSpy.mock.calls[0][0] as {
      surfaceId: string;
      promptId: string;
    };
    expect(persisted.surfaceId).toBe("canonical-surface");
    expect(persisted.promptId).toBe("canonical.v1");
    expect(result.summaries[0].runSummary.surfaceId).toBe("canonical-surface");
  });

  it("variant label falls back to id when omitted", async () => {
    const family: EvalSuiteFamily<string> = {
      surfaceId: "x",
      variants: [{ id: "tight", promptId: "tight.v1" }],
      buildSuite: (v) => buildSuiteForVariant(v.id, v.promptId, 5, 5),
    };
    const result = await runEvalSuiteFamily(family);
    expect(result.comparison.variants[0].label).toBe("tight");
  });

  it("variant label is preserved when set", async () => {
    const family: EvalSuiteFamily<string> = {
      surfaceId: "x",
      variants: [{ id: "tight", promptId: "tight.v1", label: "Tight prompt" }],
      buildSuite: (v) => buildSuiteForVariant(v.id, v.promptId, 5, 5),
    };
    const result = await runEvalSuiteFamily(family);
    expect(result.comparison.variants[0].label).toBe("Tight prompt");
  });

  it("threading the variant.promptId into the suite gets persisted", async () => {
    const family: EvalSuiteFamily<string> = {
      surfaceId: "x",
      variants: [
        { id: "a", promptId: "x.v1" },
        { id: "b", promptId: "x.v2" },
      ],
      buildSuite: (v) => buildSuiteForVariant(v.id, v.promptId, 5, 5),
    };
    await runEvalSuiteFamily(family);
    const calls = insertSpy.mock.calls.map(
      (c) => (c[0] as { promptId: string }).promptId,
    );
    expect(new Set(calls)).toEqual(new Set(["x.v1", "x.v2"]));
  });

  it("3-variant family ranks all three", async () => {
    const family: EvalSuiteFamily<string> = {
      surfaceId: "x",
      variants: [
        { id: "low", promptId: "x.low" },
        { id: "mid", promptId: "x.mid" },
        { id: "high", promptId: "x.high" },
      ],
      buildSuite: (v) =>
        v.id === "low"
          ? buildSuiteForVariant(v.id, v.promptId, 3, 7)
          : v.id === "mid"
            ? buildSuiteForVariant(v.id, v.promptId, 6, 4)
            : buildSuiteForVariant(v.id, v.promptId, 9, 1),
    };
    const result = await runEvalSuiteFamily(family);
    expect(result.comparison.variants.map((v) => v.variantId)).toEqual([
      "high",
      "mid",
      "low",
    ]);
    expect(result.comparison.winnerId).toBe("high");
    expect(result.comparison.marginDelta).toBeCloseTo(0.3, 4);
  });
});
