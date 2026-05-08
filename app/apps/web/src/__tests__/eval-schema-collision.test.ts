/**
 * Audit-2026-05-08 L2 regression — F11 schema collision split.
 *
 * Pins the contract that `evalRuns` (legacy agent-evaluator,
 * intelligence.ts) and `llmEvalRuns` (new LLM-observability,
 * ai-observability.ts) are distinct exports backing distinct tables.
 *
 * Background : a prior version of the schema barrel re-exported two
 * `evalRuns` symbols from two files, with two different column
 * shapes, both pointing at the literal table name "eval_runs". In
 * production the legacy 0004 migration won the CREATE TABLE race
 * (the new 0041 used `IF NOT EXISTS`), so every consumer in
 * `lib/evals/harness.ts`, `app/api/admin/llm-evals`, and
 * `app/api/admin/eval-runs/[id]/cases` queried columns that didn't
 * exist on the actual production table — runtime crash latent.
 *
 * Migration 0050 split the namespace : `eval_runs` stayed for the
 * legacy system, the LLM-observability tables moved to
 * `llm_eval_runs` / `llm_eval_case_runs`. Drizzle exports were
 * renamed to `llmEvalRuns` / `llmEvalCaseRuns`.
 *
 * If a future refactor accidentally re-introduces the collision —
 * e.g. by renaming `llmEvalRuns` back to `evalRuns` to match the
 * "old" name — this test fires before the build merges.
 */

import { describe, it, expect } from "vitest";
import * as schema from "@/db/schema";

describe("F11 — eval_runs / llm_eval_runs schema split", () => {
  it("both symbols exist in the schema barrel", () => {
    expect(schema.evalRuns).toBeDefined();
    expect(schema.llmEvalRuns).toBeDefined();
    expect(schema.llmEvalCaseRuns).toBeDefined();
  });

  it("the two evalRuns objects are NOT the same reference", () => {
    // Reference identity guard — an accidental re-export of the same
    // table under both names (e.g. via `export { evalRuns as
    // llmEvalRuns }`) would silently re-create the collision and pass
    // the existence check above. This catches that.
    expect(schema.evalRuns).not.toBe(schema.llmEvalRuns);
  });

  it("legacy evalRuns has tenantId + datasetId, new llmEvalRuns does not", () => {
    // Drizzle PgTable instances expose their column descriptors as
    // own properties keyed by the JS field name. We check the
    // distinguishing columns of each schema so even a deliberate
    // alias would not pass.
    const legacy = schema.evalRuns as unknown as Record<string, unknown>;
    const llm = schema.llmEvalRuns as unknown as Record<string, unknown>;

    expect(legacy.tenantId).toBeDefined();
    expect(legacy.datasetId).toBeDefined();
    expect(legacy.surfaceId).toBeUndefined();
    expect(legacy.casesTotal).toBeUndefined();

    expect(llm.surfaceId).toBeDefined();
    expect(llm.casesTotal).toBeDefined();
    expect(llm.casesPassed).toBeDefined();
    expect(llm.tenantId).toBeUndefined();
    expect(llm.datasetId).toBeUndefined();
  });
});
