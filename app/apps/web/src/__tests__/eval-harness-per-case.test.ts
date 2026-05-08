/**
 * Tests for the per-case eval persistence wiring.
 *
 * The harness now writes BOTH the aggregate row to `eval_runs` AND
 * one row per case to `eval_case_runs`. Both writes are best-effort
 * (a DB outage doesn't unwind the in-memory summary).
 *
 * We mock `@/db` so we can capture the insert payloads and prove :
 *   - aggregate row carries the right shape
 *   - per-case rows are inserted with snippet truncation
 *   - aggregate failure short-circuits per-case insertion (FK safety)
 *   - per-case failure doesn't unwind the in-memory summary
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mocks must be hoisted before harness import.
const aggregateInsertSpy = vi.fn();
const caseInsertSpy = vi.fn();
const aggregateReturning = vi.fn(async () => [{ id: "run-123" }]);

vi.mock("@/db", () => ({
  db: {
    insert: vi.fn((table: { _: { name?: string }; [k: string]: unknown }) => {
      // Drizzle exposes the table name in the object's symbol map ;
      // for our mock we cheat with a string key the schema mock
      // attaches.
      const tableId = (table as unknown as { _mockId?: string })._mockId;
      if (tableId === "llm_eval_runs") {
        return {
          values: (payload: unknown) => {
            aggregateInsertSpy(payload);
            return { returning: aggregateReturning };
          },
        };
      }
      if (tableId === "llm_eval_case_runs") {
        return {
          values: async (payload: unknown) => {
            caseInsertSpy(payload);
          },
        };
      }
      return { values: vi.fn() };
    }),
  },
}));

vi.mock("@/db/schema", () => ({
  llmEvalRuns: { _mockId: "llm_eval_runs", id: "id-col" },
  llmEvalCaseRuns: { _mockId: "llm_eval_case_runs" },
}));

import { runEvalSuite, type EvalSuite } from "@/lib/evals/harness";

beforeEach(() => {
  aggregateInsertSpy.mockClear();
  caseInsertSpy.mockClear();
  aggregateReturning.mockReset();
  aggregateReturning.mockImplementation(async () => [{ id: "run-123" }]);
});

function buildSuite(opts: {
  cases: Array<{
    id: string;
    output: string | unknown;
    pass: boolean;
    throws?: boolean;
  }>;
}): EvalSuite<unknown> {
  return {
    surfaceId: "test-surface",
    promptId: "test.v1",
    cases: opts.cases.map((c) => ({
      id: c.id,
      run: async () => {
        if (c.throws) throw new Error("boom");
        return c.output;
      },
      predicate: () => c.pass,
    })),
  };
}

describe("runEvalSuite — aggregate + per-case persistence", () => {
  it("inserts aggregate then per-case rows when DB is healthy", async () => {
    const suite = buildSuite({
      cases: [
        { id: "c1", output: "out-1", pass: true },
        { id: "c2", output: "out-2", pass: false },
      ],
    });
    const summary = await runEvalSuite(suite);
    expect(summary.casesTotal).toBe(2);
    expect(summary.casesPassed).toBe(1);

    expect(aggregateInsertSpy).toHaveBeenCalledTimes(1);
    const aggregate = aggregateInsertSpy.mock.calls[0][0];
    expect(aggregate).toMatchObject({
      surfaceId: "test-surface",
      promptId: "test.v1",
      casesTotal: 2,
      casesPassed: 1,
      casesErrored: 0,
    });

    expect(caseInsertSpy).toHaveBeenCalledTimes(1);
    const caseRows = caseInsertSpy.mock.calls[0][0] as Array<{
      runId: string;
      caseId: string;
      passed: boolean;
      outputSnippet: string | null;
    }>;
    expect(caseRows).toHaveLength(2);
    expect(caseRows[0]).toMatchObject({
      runId: "run-123",
      caseId: "c1",
      passed: true,
    });
    expect(caseRows[1]).toMatchObject({
      runId: "run-123",
      caseId: "c2",
      passed: false,
    });
  });

  it("snippet captures string output verbatim under 500 chars", async () => {
    const suite = buildSuite({
      cases: [{ id: "c1", output: "hello world", pass: true }],
    });
    await runEvalSuite(suite);
    const rows = caseInsertSpy.mock.calls[0][0];
    expect(rows[0].outputSnippet).toBe("hello world");
  });

  it("snippet truncates long outputs to 500 chars", async () => {
    const longOutput = "x".repeat(2000);
    const suite = buildSuite({
      cases: [{ id: "c1", output: longOutput, pass: true }],
    });
    await runEvalSuite(suite);
    const rows = caseInsertSpy.mock.calls[0][0];
    expect(rows[0].outputSnippet?.length).toBe(500);
  });

  it("snippet JSON-serialises non-string outputs", async () => {
    const suite = buildSuite({
      cases: [{ id: "c1", output: { foo: 1, bar: "baz" }, pass: true }],
    });
    await runEvalSuite(suite);
    const rows = caseInsertSpy.mock.calls[0][0];
    expect(rows[0].outputSnippet).toBe('{"foo":1,"bar":"baz"}');
  });

  it("captures errored cases with truncated errorMessage and null snippet", async () => {
    const suite = buildSuite({
      cases: [{ id: "c1", output: null, pass: false, throws: true }],
    });
    const summary = await runEvalSuite(suite);
    expect(summary.casesErrored).toBe(1);
    const rows = caseInsertSpy.mock.calls[0][0];
    expect(rows[0]).toMatchObject({
      caseId: "c1",
      passed: false,
      errored: true,
      errorMessage: "boom",
      outputSnippet: null,
    });
  });

  it("aggregate failure short-circuits per-case insertion", async () => {
    aggregateReturning.mockRejectedValueOnce(new Error("db down"));
    const suite = buildSuite({
      cases: [{ id: "c1", output: "x", pass: true }],
    });
    const summary = await runEvalSuite(suite);
    // In-memory summary still arrives.
    expect(summary.casesPassed).toBe(1);
    // No FK-violation because we didn't even try.
    expect(caseInsertSpy).not.toHaveBeenCalled();
  });

  it("per-case insert failure does not unwind in-memory summary", async () => {
    // Make per-case insert reject ; aggregate still ok.
    const restoreInsertSpy = caseInsertSpy.mockImplementationOnce(() => {
      throw new Error("table missing");
    });
    const suite = buildSuite({
      cases: [{ id: "c1", output: "x", pass: true }],
    });
    const summary = await runEvalSuite(suite);
    expect(summary.casesPassed).toBe(1);
    expect(aggregateInsertSpy).toHaveBeenCalledTimes(1);
    restoreInsertSpy.mockRestore();
  });

  it("empty suite skips per-case insert (no rows to write)", async () => {
    const suite: EvalSuite<unknown> = {
      surfaceId: "empty",
      promptId: "empty.v1",
      cases: [],
    };
    await runEvalSuite(suite);
    expect(aggregateInsertSpy).toHaveBeenCalledTimes(1);
    expect(caseInsertSpy).not.toHaveBeenCalled();
  });

  it("preserves caseId stability for cross-run diffing", async () => {
    const suite = buildSuite({
      cases: [
        { id: "stable-id-a", output: 1, pass: true },
        { id: "stable-id-b", output: 2, pass: false },
      ],
    });
    await runEvalSuite(suite);
    const rows = caseInsertSpy.mock.calls[0][0];
    expect(rows.map((r: { caseId: string }) => r.caseId)).toEqual([
      "stable-id-a",
      "stable-id-b",
    ]);
  });

  it("per-case latencyMs is recorded as integer ms", async () => {
    const suite = buildSuite({
      cases: [{ id: "c1", output: "x", pass: true }],
    });
    await runEvalSuite(suite);
    const rows = caseInsertSpy.mock.calls[0][0];
    expect(typeof rows[0].latencyMs).toBe("number");
    expect(rows[0].latencyMs).toBeGreaterThanOrEqual(0);
  });

  it("returnsing summary still contains perCase array", async () => {
    const suite = buildSuite({
      cases: [
        { id: "c1", output: "x", pass: true },
        { id: "c2", output: "y", pass: false },
      ],
    });
    const summary = await runEvalSuite(suite);
    expect(summary.perCase).toHaveLength(2);
    expect(summary.perCase[0]).toMatchObject({ caseId: "c1", passed: true });
  });
});
