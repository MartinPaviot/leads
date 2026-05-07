/**
 * Schema for MONACO-PARITY-03 (onboarding 7-phases with hard gates)
 * and MONACO-PARITY-04 (anonymous-visitor identification).
 *
 * Both tables created at runtime by `ensureCoachingTables` (extended)
 * and via the SQL migration `drizzle/0040_onboarding_and_visits.sql`.
 *
 * onboarding_progress  one row per tenant — the spine of the
 *                      "Onboarding-as-FDAE" wizard. Currently the
 *                      wizard persists to tenant.settings JSONB; this
 *                      table is a typed parallel home that the new
 *                      7-phase API uses. Both can coexist.
 *
 * visits               one row per anonymous web visit. Identification
 *                      from the configured provider (Snitcher first
 *                      per Monaco's own choice on monaco.com) fills
 *                      `company_domain` asynchronously.
 */

import {
  pgTable,
  text,
  timestamp,
  integer,
  jsonb,
  index,
  uniqueIndex,
  doublePrecision,
  boolean,
} from "drizzle-orm/pg-core";

// ── onboarding_progress ──────────────────────────────────────
export const onboardingProgress = pgTable(
  "onboarding_progress",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    tenantId: text("tenant_id").notNull(),
    /** 1..7 — the phase the user is currently on. Server-validated; a
     *  user cannot skip ahead past a failed gate. */
    currentPhase: integer("current_phase").notNull().default(1),
    /** Sorted array of phase numbers that have passed validation. */
    completedPhases: jsonb("completed_phases")
      .$type<number[]>()
      .notNull()
      .default([]),
    /** Per-phase user input — keyed by phase number (1..7). Schema
     *  varies per phase; validated by `lib/onboarding/phase-validators.ts`
     *  before write. */
    phaseData: jsonb("phase_data")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    /** Hard-gate state: each gate flag is "pending" | "pass" | "fail".
     *  See lib/onboarding/checklist.ts for the canonical list. */
    checklistState: jsonb("checklist_state")
      .$type<Record<string, "pending" | "pass" | "fail">>()
      .notNull()
      .default({}),
    startedAt: timestamp("started_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("onboarding_progress_tenant_idx").on(table.tenantId),
  ],
);

// ── visits (visitor ID) ──────────────────────────────────────
export const visits = pgTable(
  "visits",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    tenantId: text("tenant_id").notNull(),
    /** First-party cookie value `_eve_v` — UUID, 90d. */
    visitorId: text("visitor_id").notNull(),
    /** SHA-256(remote IP) — never store the raw IP. */
    ipHash: text("ip_hash").notNull(),
    /** SHA-256("/24 subnet of ip"). Optional ; pixel endpoint
     *  populates it for IPv4. Used by the dedup window to catch
     *  the "same office, different NAT IP" case so we don't pay
     *  the provider twice. Null for IPv6 / malformed inputs. */
    subnetHash: text("subnet_hash"),
    url: text("url").notNull(),
    referrer: text("referrer"),
    /** UTM params and other marketing tags. */
    utm: jsonb("utm").$type<Record<string, string>>().default({}),
    /** User-agent string, capped at 500 chars on insert. */
    userAgent: text("user_agent"),
    /** Filled async by the identification job. Null when the provider
     *  returned no match (~50% of B2B traffic) or when no provider is
     *  configured. */
    companyDomain: text("company_domain"),
    /** Internal `companies.id` once we resolve / upsert. */
    companyId: text("company_id"),
    identifiedAt: timestamp("identified_at", { withTimezone: true }),
    /** "snitcher" | "rb2b" | "clearbit_reveal" | null. */
    identifiedBy: text("identified_by"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("visits_tenant_idx").on(table.tenantId),
    index("visits_visitor_idx").on(table.visitorId),
    index("visits_company_idx").on(table.companyId),
    index("visits_created_at_idx").on(table.createdAt),
  ],
);

// ── visitor_id_charges (P0-2 follow-up) ──────────────────────
//
// One row per paid lookup at the visitor-ID provider (Snitcher /
// RB2B / Clearbit Reveal). The spend cap reads sum(cost_usd) from
// here for accurate budgeting ; the dashboard reads
// `visitor_id_monthly_spend_by_tenant` (view) for ROI charts.
//
// Why a separate table from `visits` : a single visit can produce
// zero, one, or many charges (cache hit → 0 ; first lookup → 1 ;
// retried lookup after provider 5xx → 2). Joining 1:1 with `visits`
// would conflate IO surface with cost surface.
export const visitorIdCharges = pgTable(
  "visitor_id_charges",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    tenantId: text("tenant_id").notNull(),
    /** Visit that triggered the lookup. NULL when the worker
     *  retried for a now-deleted visit. */
    visitId: text("visit_id"),
    /** Provider name : "snitcher" | "rb2b" | "clearbit_reveal". */
    provider: text("provider").notNull(),
    /** USD cost rounded to 6 decimals (matches `llm_calls.cost_usd`).
     *  NULL when we couldn't price (provider didn't return rate ;
     *  spend-cap.ts falls back to DEFAULT_RATE_PER_MATCH_USD). */
    costUsd: doublePrecision("cost_usd"),
    /** True iff the provider returned a company match. Lets the
     *  dashboard show match-rate alongside cost. */
    matched: boolean("matched").notNull().default(false),
    /** Provider's raw response — confidence, request id, etc.
     *  Capped at 1 KB on insert. */
    responseMeta: jsonb("response_meta")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    chargedAt: timestamp("charged_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("visitor_id_charges_tenant_charged_at_idx").on(
      table.tenantId,
      table.chargedAt,
    ),
    index("visitor_id_charges_provider_idx").on(table.provider),
  ],
);
