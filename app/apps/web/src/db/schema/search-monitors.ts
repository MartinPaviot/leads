// Search monitors — a saved LinkedIn / Sales-Navigator ICP query that re-runs on
// a schedule and sources the NET-NEW matches into the CRM (deduped via the
// canonical upsert). The autonomous endgame of the sourcing engine: the CRM
// stays fresh with prospects matching an ICP without anyone re-running a search.
//
// SAFE BY DESIGN: a monitor only SOURCES (populates the CRM). It never enrolls /
// contacts — that stays the HITL-gated sequence step. `criteria` is the same
// `SourcingInput` shape the chat tools + route use (re-resolved to LinkedIn ids
// each run, so it self-heals as the resolver / ids change).
import { pgTable, text, integer, timestamp, jsonb, index, uniqueIndex } from "drizzle-orm/pg-core";
import { tenants, users } from "./core";

export const searchMonitors = pgTable(
  "search_monitors",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    tenantId: text("tenant_id").references(() => tenants.id).notNull(),
    /** Who created the monitor (NULL when unknown). */
    createdBy: text("created_by").references(() => users.id),
    label: text("label").notNull(),
    /** people | companies | jobs | posts. */
    category: text("category").notNull(),
    /** The SourcingInput criteria (re-resolved each run). */
    criteria: jsonb("criteria").notNull(),
    /** active | paused. */
    status: text("status").notNull().default("active"),
    /** Cap each run's sourcing (defends the seat's view budget on hydration). */
    maxPerRun: integer("max_per_run").notNull().default(100),
    lastRunAt: timestamp("last_run_at", { withTimezone: true }),
    /** The last run's summary {at, accounts, contacts, openRoles, error?}. */
    lastRunSummary: jsonb("last_run_summary"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("search_monitors_tenant_idx").on(t.tenantId),
    index("search_monitors_tenant_status_idx").on(t.tenantId, t.status),
    // One monitor per (tenant, label) — re-creating a label updates it.
    uniqueIndex("search_monitors_tenant_label_idx").on(t.tenantId, t.label),
  ],
);
