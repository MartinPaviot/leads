/**
 * Schema for Sprint-1 LLM observability (audit follow-up).
 *
 * `llm_calls` is the per-call ledger : every wrapped LLM invocation
 * writes one row with cost, latency, retry/fallback markers, and
 * the prompt-id. The eval harness reads from it to chart drift, the
 * cost dashboard reads it to attribute spend per tenant × surface,
 * and on-call uses it for incident root-cause.
 *
 * Prompt-id versioning : every call MUST carry a `prompt_id` like
 * `deal-briefing.v3` so a prompt change is detectable as a row-shape
 * shift in this table.
 */

import {
  pgTable,
  text,
  timestamp,
  integer,
  jsonb,
  doublePrecision,
  boolean,
  index,
} from "drizzle-orm/pg-core";

export const llmCalls = pgTable(
  "llm_calls",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    /** Tenant context — null for system calls (cron jobs, evals). */
    tenantId: text("tenant_id"),
    /** Logical surface name (e.g. "deal-briefing", "transcript-coaching"). */
    surfaceId: text("surface_id").notNull(),
    /** Versioned prompt id — `<surface>.v<n>`. Lets us A/B test. */
    promptId: text("prompt_id").notNull(),
    /** Provider model that actually answered (after any fallback). */
    model: text("model").notNull(),
    /** True when the primary model errored and we fell back. */
    fallbackTriggered: boolean("fallback_triggered").notNull().default(false),
    /** Number of retry attempts including the final success/failure. */
    attempts: integer("attempts").notNull().default(1),
    /** Token counts. Null when the provider didn't return usage. */
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    /** USD cost rounded to 6 decimals. Null when we couldn't price. */
    costUsd: doublePrecision("cost_usd"),
    /** Wall-clock ms of the successful (or last attempted) call. */
    latencyMs: integer("latency_ms").notNull(),
    /** "ok" | "error" | "timeout" — final outcome after retries. */
    outcome: text("outcome").notNull(),
    /** Error message when outcome != ok. Truncated to 500 chars. */
    errorMessage: text("error_message"),
    /** Free-form metadata (agentId, traceId, surfaceType, etc.). */
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("llm_calls_tenant_idx").on(table.tenantId),
    index("llm_calls_surface_idx").on(table.surfaceId),
    index("llm_calls_prompt_idx").on(table.promptId),
    index("llm_calls_created_at_idx").on(table.createdAt),
  ],
);

/**
 * Eval runs — one row per (eval suite × cron tick). Aggregates
 * accuracy, recall@k, MRR, etc. The dashboard reads this to chart
 * weekly drift per surface.
 */
/**
 * Lives under the `llm_eval_runs` namespace to coexist with the
 * legacy agent-evaluator `eval_runs` table (intelligence.ts) — the
 * two systems target different problems and were colliding on the
 * shared `eval_runs` name. The split is enforced by migration 0050.
 */
export const llmEvalRuns = pgTable(
  "llm_eval_runs",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    /** Surface + suite the run targets, e.g. "transcript-coaching". */
    surfaceId: text("surface_id").notNull(),
    /** Prompt version evaluated. */
    promptId: text("prompt_id").notNull(),
    /** Total cases attempted in this run. */
    casesTotal: integer("cases_total").notNull(),
    /** Cases that passed the predicate (case-defined). */
    casesPassed: integer("cases_passed").notNull(),
    /** Cases that errored (LLM/network failure, not predicate fail). */
    casesErrored: integer("cases_errored").notNull().default(0),
    /** Aggregate metrics — surface-specific. e.g.
     *  { recall_at_8: 0.91, mrr: 0.82, mean_latency_ms: 1240 } */
    metrics: jsonb("metrics")
      .$type<Record<string, number>>()
      .notNull()
      .default({}),
    /** Total wall-clock ms for the entire run. */
    totalLatencyMs: integer("total_latency_ms").notNull(),
    /** Total $ spent on this run (sum of llm_calls.cost_usd). */
    totalCostUsd: doublePrecision("total_cost_usd"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("llm_eval_runs_surface_idx").on(table.surfaceId),
    index("llm_eval_runs_created_at_idx").on(table.createdAt),
  ],
);

/**
 * Per-case eval results — one row per `EvalCase` invocation within
 * an `eval_runs` aggregate. The aggregate row tells you "5 of 8
 * cases failed" ; this table lets the dashboard drill into WHICH 5.
 *
 * Sprint-3 audit follow-up. Without per-case persistence, an alarm
 * on `mean_citation_accuracy < 0.8` is blind — on-call has to re-
 * run the suite locally to see which case broke. With it, the
 * "explain this regression" path is a single SQL query.
 *
 * The `outputSnippet` is capped at 500 chars on insert by the
 * harness — long enough to recognise the failure mode, short
 * enough that retaining 4 weeks of weekly history doesn't blow up
 * row size.
 */
export const llmEvalCaseRuns = pgTable(
  "llm_eval_case_runs",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    /** FK to the parent `llm_eval_runs.id`. Cascade delete : when a
     *  run is purged from history, its cases go with it. */
    runId: text("run_id").notNull(),
    /** Stable case id within the suite — used for case-level diffing
     *  across runs. Same value as `EvalCase.id` in the suite source. */
    caseId: text("case_id").notNull(),
    passed: boolean("passed").notNull(),
    errored: boolean("errored").notNull().default(false),
    /** Wall-clock ms for this single case. */
    latencyMs: integer("latency_ms").notNull(),
    /** Truncated error message when errored=true. */
    errorMessage: text("error_message"),
    /** First 500 chars of the case output (or its JSON serialisation
     *  for non-string outputs). Lets the dashboard show why the
     *  predicate failed without the full trace. */
    outputSnippet: text("output_snippet"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("llm_eval_case_runs_run_idx").on(table.runId),
    index("llm_eval_case_runs_case_idx").on(table.caseId),
    index("llm_eval_case_runs_created_at_idx").on(table.createdAt),
  ],
);
