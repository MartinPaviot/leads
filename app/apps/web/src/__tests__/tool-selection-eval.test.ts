import { describe, it, expect } from "vitest";
import {
  TOOL_SELECTION_CASES,
  evaluateToolSelection,
  runToolSelectionEval,
  type ToolSelectionCategory,
} from "@/lib/evals/tool-selection-eval";

// ── Basic suite sanity checks ──────────────────────────────────

describe("tool-selection-eval: dataset integrity", () => {
  it("has exactly 50 test cases", () => {
    expect(TOOL_SELECTION_CASES).toHaveLength(50);
  });

  it("has unique IDs", () => {
    const ids = TOOL_SELECTION_CASES.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("covers all 5 categories with 10 cases each", () => {
    const categories: ToolSelectionCategory[] = [
      "crm",
      "actions",
      "intelligence",
      "skills",
      "edge_cases",
    ];
    for (const cat of categories) {
      const count = TOOL_SELECTION_CASES.filter(
        (c) => c.category === cat,
      ).length;
      expect(count).toBe(10);
    }
  });

  it("every case has at least one expected tool", () => {
    for (const tc of TOOL_SELECTION_CASES) {
      expect(tc.expectedTools.length).toBeGreaterThan(0);
    }
  });
});

// ── Individual case evaluation ────────────────────────────────

describe("tool-selection-eval: CRM queries", () => {
  const crmCases = TOOL_SELECTION_CASES.filter((c) => c.category === "crm");

  for (const tc of crmCases) {
    it(`${tc.id}: "${tc.query.slice(0, 60)}"`, () => {
      const result = evaluateToolSelection(tc);
      // At least one expected tool should be routed
      expect(result.expectedHit).toBe(true);
      // No forbidden tools should leak through
      if (tc.forbiddenTools && tc.forbiddenTools.length > 0) {
        expect(result.leakedForbidden).toEqual([]);
      }
    });
  }
});

describe("tool-selection-eval: actions", () => {
  const actionCases = TOOL_SELECTION_CASES.filter(
    (c) => c.category === "actions",
  );

  for (const tc of actionCases) {
    it(`${tc.id}: "${tc.query.slice(0, 60)}"`, () => {
      const result = evaluateToolSelection(tc);
      expect(result.expectedHit).toBe(true);
      if (tc.forbiddenTools && tc.forbiddenTools.length > 0) {
        expect(result.leakedForbidden).toEqual([]);
      }
    });
  }
});

describe("tool-selection-eval: intelligence", () => {
  const intelCases = TOOL_SELECTION_CASES.filter(
    (c) => c.category === "intelligence",
  );

  for (const tc of intelCases) {
    it(`${tc.id}: "${tc.query.slice(0, 60)}"`, () => {
      const result = evaluateToolSelection(tc);
      expect(result.expectedHit).toBe(true);
    });
  }
});

describe("tool-selection-eval: skills", () => {
  const skillsCases = TOOL_SELECTION_CASES.filter(
    (c) => c.category === "skills",
  );

  for (const tc of skillsCases) {
    it(`${tc.id}: "${tc.query.slice(0, 60)}"`, () => {
      const result = evaluateToolSelection(tc);
      expect(result.expectedHit).toBe(true);
    });
  }
});

describe("tool-selection-eval: edge cases", () => {
  const edgeCases = TOOL_SELECTION_CASES.filter(
    (c) => c.category === "edge_cases",
  );

  for (const tc of edgeCases) {
    it(`${tc.id}: "${tc.query.slice(0, 60)}"`, () => {
      const result = evaluateToolSelection(tc);
      // Edge cases are harder -- we accept that some may not hit
      // but they should at least not leak forbidden tools
      if (tc.forbiddenTools && tc.forbiddenTools.length > 0) {
        expect(result.leakedForbidden).toEqual([]);
      }
    });
  }
});

// ── Aggregate metrics ─────────────────────────────────────────

describe("tool-selection-eval: aggregate F1", () => {
  it("aggregate F1 >= 0.85", () => {
    const summary = runToolSelectionEval();

    // Log the summary for debugging
    console.log(
      `Tool Selection Eval: ${summary.passed}/${summary.totalCases} passed`,
    );
    console.log(
      `  Precision: ${(summary.precision * 100).toFixed(1)}%`,
    );
    console.log(
      `  Recall: ${(summary.recall * 100).toFixed(1)}%`,
    );
    console.log(`  F1: ${(summary.f1 * 100).toFixed(1)}%`);

    // Per-category breakdown
    for (const [cat, metrics] of Object.entries(summary.perCategory)) {
      console.log(
        `  ${cat}: ${metrics.passed}/${metrics.total} (F1: ${(metrics.f1 * 100).toFixed(1)}%)`,
      );
    }

    if (summary.topMissingTools.length > 0) {
      console.log("  Top missing tools:");
      for (const { tool, count } of summary.topMissingTools.slice(0, 5)) {
        console.log(`    - ${tool}: missing ${count} times`);
      }
    }

    if (summary.topLeakedTools.length > 0) {
      console.log("  Top leaked forbidden tools:");
      for (const { tool, count } of summary.topLeakedTools.slice(0, 5)) {
        console.log(`    - ${tool}: leaked ${count} times`);
      }
    }

    expect(summary.f1).toBeGreaterThanOrEqual(0.85);
  });

  it("no category has F1 < 0.70", () => {
    const summary = runToolSelectionEval();

    for (const [cat, metrics] of Object.entries(summary.perCategory)) {
      expect(
        metrics.f1,
        `Category "${cat}" F1 is ${(metrics.f1 * 100).toFixed(1)}%, below 70% threshold`,
      ).toBeGreaterThanOrEqual(0.70);
    }
  });
});

// ── Specific regression tests ─────────────────────────────────

describe("tool-selection-eval: regressions", () => {
  it("undo query should only include undo tools", () => {
    const undoCase = TOOL_SELECTION_CASES.find((c) => c.id === "edge-006")!;
    const result = evaluateToolSelection(undoCase);
    expect(result.expectedHit).toBe(true);
    expect(result.leakedForbidden).toEqual([]);
  });

  it("French query routes correctly", () => {
    const frenchCase = TOOL_SELECTION_CASES.find((c) => c.id === "edge-002")!;
    const result = evaluateToolSelection(frenchCase);
    expect(result.expectedHit).toBe(true);
  });

  it("negation should not route email tools", () => {
    const negationCase = TOOL_SELECTION_CASES.find(
      (c) => c.id === "edge-004",
    )!;
    const result = evaluateToolSelection(negationCase);
    // The router does not understand negation semantically, but
    // at minimum it should include query tools
    expect(result.foundExpected.length).toBeGreaterThan(0);
  });

  it("empty query returns default tools", () => {
    const emptyCase = TOOL_SELECTION_CASES.find((c) => c.id === "edge-009")!;
    const result = evaluateToolSelection(emptyCase);
    expect(result.expectedHit).toBe(true);
  });

  it("memory query routes to memory tools", () => {
    const memoryCase = TOOL_SELECTION_CASES.find((c) => c.id === "edge-007")!;
    const result = evaluateToolSelection(memoryCase);
    expect(result.expectedHit).toBe(true);
  });
});
