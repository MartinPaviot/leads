import {
  pgTable,
  text,
  timestamp,
  jsonb,
  integer,
  real,
  boolean,
  index,
  uniqueIndex,
  primaryKey,
} from "drizzle-orm/pg-core";
import { tenants, users, companies } from "./core";

// ============================================================
// MULTI-ICP (_specs/multi-icp) — N ICPs per tenant, open criteria
// engine anchored on the Apollo search vocabulary.
//
// Today (pre-this-feature) the ICP is 6 flat fields on
// tenants.settings (targetIndustries, targetCompanySizes, ...) and
// companies.score is ONE scalar. This module makes the ICP a
// first-class, multi-instance entity and turns the fit score into a
// matrix (company × icp → score) materialised in `company_icp_fit`.
// company.score stays alive as the PRIMARY-icp fit (priority winner)
// so every existing read keeps working — non-breaking.
// ============================================================

// One ICP per row. A tenant has N (unbounded). `priority` resolves
// the primary ICP when a company matches several — lower number wins
// (priority 0 = top). `status` gates which ICPs the scoring +
// enrollment engines consider ('active' only).
export const icps = pgTable(
  "icps",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    tenantId: text("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    name: text("name").notNull(),
    description: text("description"),
    // 'active' | 'draft' | 'archived'
    status: text("status").notNull().default("draft"),
    // Lower = higher priority. The primary ICP for a company is the
    // highest-priority (lowest number) ICP it fits above threshold.
    priority: integer("priority").notNull().default(100),
    // Free-form metadata: AI-inference provenance, colour, etc.
    metadata: jsonb("metadata").notNull().default({}),
    createdByUserId: text("created_by_user_id").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    // Soft-delete: a deleted ICP keeps its row + criteria (so it stays
    // restorable) but is excluded from every read, scoring, sourcing and TAM
    // build. Its company_icp_fit cells are dropped on delete (scoring stops
    // immediately) and rebuilt by the recompute on restore.
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    index("icps_tenant_idx").on(t.tenantId),
    index("icps_tenant_status_idx").on(t.tenantId, t.status),
    index("icps_tenant_priority_idx").on(t.tenantId, t.priority),
  ],
);

// One criterion per row. An ICP is the AND of its criteria. `fieldKey`
// references a row in icp_field_catalog (Apollo-standard or custom).
// `operator` + `value` define the predicate. `weight` is the
// criterion's contribution to the fit score. `isRequired` makes it a
// hard filter: an unmatched required criterion zeroes the fit (and
// excludes from TAM) rather than just lowering the score.
export const icpCriteria = pgTable(
  "icp_criteria",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    icpId: text("icp_id")
      .references(() => icps.id, { onDelete: "cascade" })
      .notNull(),
    // Matches icp_field_catalog.fieldKey. Not an FK so a tenant can
    // delete a custom catalog entry without cascading away historical
    // criteria; the evaluator treats an unknown fieldKey as "exists:false".
    fieldKey: text("field_key").notNull(),
    // eq | in | gt | lt | gte | lte | contains | exists | between
    operator: text("operator").notNull(),
    // Shape depends on operator: scalar for eq/gt/lt, array for in,
    // { min, max } for between. Stored as jsonb so the engine handles
    // every value_type uniformly.
    value: jsonb("value"),
    // Contribution to the weighted fit score. Defaults to 1.
    weight: real("weight").notNull().default(1),
    isRequired: boolean("is_required").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("icp_criteria_icp_idx").on(t.icpId),
    index("icp_criteria_field_idx").on(t.fieldKey),
  ],
);

// The vocabulary of criteria available to the rule-builder + AI
// inference. tenant_id NULL = global standard field (the ~16 Apollo
// search params, seeded by migration). tenant_id non-null = a custom
// attribute or signal that tenant defined. `source` tells the TAM
// builder whether the field can be pushed to Apollo search
// (apollo_search), is only available post-enrichment for scoring
// (apollo_enrich), or is a tenant custom property / signal applied as
// a post-filter (custom_property / signal). `apolloParam` is the
// literal Apollo request key when source=apollo_search.
export const icpFieldCatalog = pgTable(
  "icp_field_catalog",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    // NULL = global standard field shared by every tenant.
    tenantId: text("tenant_id").references(() => tenants.id, {
      onDelete: "cascade",
    }),
    fieldKey: text("field_key").notNull(),
    label: text("label").notNull(),
    // apollo_search | apollo_enrich | custom_property | signal
    source: text("source").notNull(),
    // enum | range | multi_select | boolean | text | date_range | number
    valueType: text("value_type").notNull(),
    // Operators legal for this field, e.g. ["in","exists"].
    operators: jsonb("operators").notNull().default([]),
    // The literal Apollo request param when source=apollo_search,
    // e.g. "organization_num_employees_ranges". Null otherwise.
    apolloParam: text("apollo_param"),
    // For custom_property: the JSON path under companies.properties.
    // For signal: the customSignals.id or builtin signal type.
    sourcePath: text("source_path"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("icp_field_catalog_tenant_idx").on(t.tenantId),
    // A field key is unique within a scope. Two rows with the same key
    // are allowed only if one is global (NULL tenant) and one is a
    // tenant override — the resolver prefers the tenant row.
    uniqueIndex("icp_field_catalog_scope_key_idx").on(
      t.tenantId,
      t.fieldKey,
    ),
  ],
);

// The scoring MATRIX. One row per (company, icp) the scorer has
// evaluated. fit_score in [0,1]. matched_criteria captures which
// criteria fired (for explainability in the UI). A company that
// fails an ICP's required criteria still gets a row with fit_score=0
// so "evaluated but excluded" is distinguishable from "never scored".
export const companyIcpFit = pgTable(
  "company_icp_fit",
  {
    companyId: text("company_id")
      .references(() => companies.id, { onDelete: "cascade" })
      .notNull(),
    icpId: text("icp_id")
      .references(() => icps.id, { onDelete: "cascade" })
      .notNull(),
    tenantId: text("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    fitScore: real("fit_score").notNull().default(0),
    // { matched: string[], unmatched: string[], excludedBy: string|null }
    matchedCriteria: jsonb("matched_criteria").notNull().default({}),
    computedAt: timestamp("computed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.companyId, t.icpId] }),
    index("company_icp_fit_tenant_idx").on(t.tenantId),
    index("company_icp_fit_icp_score_idx").on(t.icpId, t.fitScore),
    index("company_icp_fit_company_idx").on(t.companyId),
  ],
);
