/**
 * Schema for Sprint-2 audit follow-up — Customer Success surface.
 *
 * `account_health_snapshots` is a daily roll-up per (tenant, account)
 * with a composite 0-100 score plus the sub-component breakdown.
 * Driven by `lib/cs/health-score.ts` and a daily Inngest cron. The
 * `/cs/today` page reads this to rank accounts by intervention
 * priority — the daily queue a Founding CS would look at first.
 */

import {
  pgTable,
  text,
  timestamp,
  integer,
  jsonb,
  doublePrecision,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const accountHealthSnapshots = pgTable(
  "account_health_snapshots",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    tenantId: text("tenant_id").notNull(),
    accountId: text("account_id").notNull(),
    /** Computed health score 0-100 — higher = healthier. Persisted
     *  alongside components so the UI can show breakdown without
     *  re-computing from scratch. */
    healthScore: integer("health_score").notNull(),
    /** Per-axis breakdown : usage / sentiment / engagement / velocity
     *  / support. Each 0-100. The composite is a weighted average
     *  defined in `health-score.ts`. */
    components: jsonb("components")
      .$type<{
        usage: number;
        sentiment: number;
        engagement: number;
        velocity: number;
        support: number;
      }>()
      .notNull(),
    /** Risk level derived from the score : "high" | "medium" | "low" | "thriving". */
    riskLevel: text("risk_level").notNull(),
    /** AI-generated suggested next action with citation pointer. */
    suggestedAction: text("suggested_action"),
    suggestedActionReason: text("suggested_action_reason"),
    /** Total estimated ARR exposure for sorting (USD). Optional. */
    arrExposureUsd: doublePrecision("arr_exposure_usd"),
    /** When the snapshot was computed — daily granularity. */
    computedAt: timestamp("computed_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("account_health_tenant_idx").on(table.tenantId),
    index("account_health_account_idx").on(table.accountId),
    index("account_health_computed_at_idx").on(table.computedAt),
    // One snapshot per (account, day) — `(account_id, computed_at::date)` is
    // approximated by truncating to day. Drizzle doesn't support partial
    // unique on expressions natively, so we rely on the cron writing once
    // per day and the application-level dedupe.
    uniqueIndex("account_health_account_day_idx").on(
      table.accountId,
      table.computedAt,
    ),
  ],
);
