import {
  pgTable,
  text,
  timestamp,
  jsonb,
  real,
  index,
} from "drizzle-orm/pg-core";
import { tenants, users } from "./core";

// ============================================================
// TAM proposal queue (tam-lifecycle) — the spine of the "living" TAM.
//
// The living-TAM loops never mutate the list directly. They QUEUE
// proposals here for one-click human approval (the approval-queue posture:
// nothing that spends enrichment credits or changes the working set
// happens without an explicit OK). Mirrors capture_approvals.
//
//   kind = "add"     — a net-new candidate to insert (payload = the
//                      sourced firmographics). Approving inserts the row
//                      and fires enrichment.
//   kind = "refresh" — re-enrich a stale existing row (entityId set,
//                      lastEnrichedAt past TTL). Approving fires the
//                      enrichment event.
//   kind = "exclude" — an anti-ICP suggestion to mark a row not-a-fit
//                      (entityId set). Approving sets excludedReason.
// ============================================================
export const tamProposals = pgTable(
  "tam_proposals",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    tenantId: text("tenant_id").references(() => tenants.id).notNull(),
    kind: text("kind").notNull(),
    // pending | approved | rejected | applied | failed
    status: text("status").notNull().default("pending"),
    // Idempotency: a pending proposal with the same (tenant, kind,
    // dedupKey) is never queued twice. add => normalised domain;
    // refresh/exclude => "<entityType>:<entityId>".
    dedupKey: text("dedup_key"),
    // What the proposal concerns once it maps to a row (refresh/exclude).
    // add => null (no row exists yet).
    entityType: text("entity_type"), // "company" | "contact" | null
    entityId: text("entity_id"),
    // The proposed change. add => candidate firmographics
    // ({ name, domain, industry?, size?, properties? }); refresh => the
    // stale fields + age; exclude => { reason }.
    payload: jsonb("payload").notNull().default({}),
    // One-line human summary for the review card.
    summary: text("summary"),
    // Why it was proposed + where it came from (telemetry + grouping).
    reason: text("reason"),
    source: text("source"), // "icp_source" | "refresh_cron" | "anti_icp" | ...
    // Ranks the queue (ICP fit for add, staleness for refresh, ...).
    score: real("score"),
    // The row created/affected when applied.
    appliedEntityId: text("applied_entity_id"),
    reviewedByUserId: text("reviewed_by_user_id").references(() => users.id),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (t) => [
    index("tam_proposals_tenant_status_idx").on(t.tenantId, t.status),
    index("tam_proposals_tenant_kind_status_idx").on(
      t.tenantId,
      t.kind,
      t.status,
    ),
    index("tam_proposals_dedup_idx").on(t.tenantId, t.kind, t.dedupKey),
  ],
);
