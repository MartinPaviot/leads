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
export const evalRuns = pgTable(
  "eval_runs",
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
    index("eval_runs_surface_idx").on(table.surfaceId),
    index("eval_runs_created_at_idx").on(table.createdAt),
  ],
);
