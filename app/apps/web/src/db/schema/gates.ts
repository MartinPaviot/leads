// Orchestration — approval gates + workflow runs (spec 03,
// _specs/03-orchestration-and-gates). approval_gate is the durable HITL gate a
// run blocks on (decided via a gate.decided event); workflow_run is the
// canonical per-run record carrying current_module + state. See RECONCILE.md.
import {
  pgTable,
  text,
  jsonb,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { tenants } from "./core";

export const workflowRuns = pgTable(
  "workflow_runs",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    tenantId: text("tenant_id").references(() => tenants.id).notNull(),
    kind: text("kind").notNull(), // which module/playbook this run executes
    currentModule: text("current_module"),
    // running | blocked | halted | completed | failed
    state: text("state").notNull().default("running"),
    payload: jsonb("payload").default({}),
    inngestEventId: text("inngest_event_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("workflow_runs_tenant_idx").on(table.tenantId),
    index("workflow_runs_state_idx").on(table.tenantId, table.state),
  ],
);

export const approvalGates = pgTable(
  "approval_gate",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    tenantId: text("tenant_id").references(() => tenants.id).notNull(),
    runId: text("run_id").references(() => workflowRuns.id).notNull(),
    kind: text("kind").notNull(), // what is being approved
    payload: jsonb("payload").notNull().default({}),
    // null until decided. "approve" | "reject" | "edit".
    decision: text("decision"),
    // present when decision = "edit".
    editedPayload: jsonb("edited_payload"),
    reason: text("reason"),
    decidedBy: text("decided_by"),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("approval_gate_tenant_idx").on(table.tenantId),
    index("approval_gate_run_idx").on(table.runId),
  ],
);
