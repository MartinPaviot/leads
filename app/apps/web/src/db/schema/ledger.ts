// Credit metering ledger + budget counters (spec 02,
// _specs/02-metering-and-budget). credit_ledger is the authoritative per-call
// charge record (one row per metered call, idempotent on `ref`); workspace_budgets
// is the atomically-decremented counter the pre-call gate checks. Amounts are
// integer credit-units (exact; no float drift). See RECONCILE.md.
import {
  pgTable,
  text,
  integer,
  boolean,
  jsonb,
  timestamp,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { tenants } from "./core";

export const creditLedger = pgTable(
  "credit_ledger",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    tenantId: text("tenant_id").references(() => tenants.id).notNull(),
    // Optional scoping (nullable) for cost attribution + metrics.
    campaignId: text("campaign_id"),
    accountId: text("account_id"),
    kind: text("kind").notNull(), // e.g. "enrich" | "search" | "verify" | "send" | "llm"
    provider: text("provider").notNull(),
    amount: integer("amount").notNull(), // credit-units charged
    balanceAfter: integer("balance_after"), // workspace remaining after this charge
    // Caller-supplied idempotency key — unique per workspace so a retried call
    // never double-charges (AC3).
    ref: text("ref").notNull(),
    // Whether the metered op was served from cache (AC5 cache-hit-rate).
    cacheHit: boolean("cache_hit").notNull().default(false),
    // Stored result so a repeated ref returns the prior result without re-running
    // the provider call (AC3).
    result: jsonb("result"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("credit_ledger_ref_idx").on(table.tenantId, table.ref),
    index("credit_ledger_tenant_idx").on(table.tenantId),
    index("credit_ledger_account_idx").on(table.tenantId, table.accountId),
    index("credit_ledger_campaign_idx").on(table.tenantId, table.campaignId),
    index("credit_ledger_created_idx").on(table.tenantId, table.createdAt),
  ],
);

export const workspaceBudgets = pgTable(
  "workspace_budgets",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    tenantId: text("tenant_id").references(() => tenants.id).notNull(),
    // Scope key: "ws" (workspace) | "campaign:<id>" | "segment:<id>".
    scopeKey: text("scope_key").notNull(),
    limitAmount: integer("limit_amount").notNull(),
    remainingAmount: integer("remaining_amount").notNull(),
    periodStart: timestamp("period_start", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("workspace_budgets_scope_idx").on(table.tenantId, table.scopeKey),
  ],
);
