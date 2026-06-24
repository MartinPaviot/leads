// Canonical data model — provenance ledger (spec 00,
// _specs/00-canonical-data-model). One row per (entity, field, provider): the
// source-of-truth log that companies.canonical_fields / contacts.canonical_fields
// are recomputed from by provider precedence (AC6). Shapes are authoritative in
// _specs/00-canonical-data-model/data-contract.md.
import {
  pgTable,
  text,
  jsonb,
  timestamp,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { tenants, companies, contacts } from "./core";

export const accountFieldSource = pgTable(
  "account_field_source",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    tenantId: text("tenant_id").references(() => tenants.id).notNull(),
    entityId: text("entity_id").references(() => companies.id).notNull(),
    field: text("field").notNull(),
    provider: text("provider").notNull(),
    value: jsonb("value"),
    observedAt: timestamp("observed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    // Re-asserting a (field, provider) updates the row, never duplicates (AC1).
    uniqueIndex("account_field_source_unique_idx").on(
      table.entityId,
      table.field,
      table.provider,
    ),
    index("account_field_source_tenant_idx").on(table.tenantId),
    index("account_field_source_entity_idx").on(table.entityId),
  ],
);

export const contactFieldSource = pgTable(
  "contact_field_source",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    tenantId: text("tenant_id").references(() => tenants.id).notNull(),
    entityId: text("entity_id").references(() => contacts.id).notNull(),
    field: text("field").notNull(),
    provider: text("provider").notNull(),
    value: jsonb("value"),
    observedAt: timestamp("observed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    uniqueIndex("contact_field_source_unique_idx").on(
      table.entityId,
      table.field,
      table.provider,
    ),
    index("contact_field_source_tenant_idx").on(table.tenantId),
    index("contact_field_source_entity_idx").on(table.entityId),
  ],
);
