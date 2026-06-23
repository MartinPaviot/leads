// Agent service run log (spec 04, _specs/04-agent-service). One row per governed
// runAgent call: inputs, tools called, output, tokens, latency, and the eval
// result — the audit trail AC3 requires. Idempotent on (tenant_id, request_id).
import {
  pgTable,
  text,
  integer,
  real,
  boolean,
  jsonb,
  timestamp,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { tenants } from "./core";

export const agentRuns = pgTable(
  "agent_run",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    tenantId: text("tenant_id").references(() => tenants.id).notNull(),
    kind: text("kind").notNull(),
    /** Caller-supplied idempotency key. */
    requestId: text("request_id").notNull(),
    input: jsonb("input"),
    /** Names of the tools actually offered to the model (scoped set). */
    toolsCalled: jsonb("tools_called").default([]),
    output: jsonb("output"),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    latencyMs: integer("latency_ms"),
    evalPassed: boolean("eval_passed"),
    evalReason: text("eval_reason"),
    evalScore: real("eval_score"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("agent_run_request_idx").on(table.tenantId, table.requestId),
    index("agent_run_tenant_kind_idx").on(table.tenantId, table.kind),
    index("agent_run_created_idx").on(table.tenantId, table.createdAt),
  ],
);
