import {
  pgTable,
  text,
  timestamp,
  jsonb,
  integer,
  boolean,
  index,
  customType,
} from "drizzle-orm/pg-core";
import { tenants, users } from "./core";

// Raw binary column. DOCX/PPTX/PDF templates are small (<= 10 MB in v1),
// so the default storage backend keeps the bytes in Postgres behind the
// ProposalStorage interface (see lib/proposals/storage.ts). Swappable for
// Supabase Storage / S3 later without a schema change.
const bytea = customType<{ data: Buffer; default: false }>({
  dataType() {
    return "bytea";
  },
});

// A reusable proposal template uploaded by a user. We ingest it once
// (extract text + heading outline), detect its components with an LLM,
// the user confirms the map once, and then it is filled per-prospect in
// PROPOSAL-002. No template mutation happens in PROPOSAL-001.
export const proposalTemplates = pgTable(
  "proposal_templates",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    tenantId: text("tenant_id").references(() => tenants.id).notNull(),
    createdByUserId: text("created_by_user_id").references(() => users.id),
    name: text("name").notNull(),
    sourceFormat: text("source_format").notNull(), // 'docx' (only in v1)
    originalFileName: text("original_file_name").notNull(),
    storageRef: text("storage_ref").notNull(),
    // uploaded -> detected -> mapped ; or failed
    status: text("status").notNull().default("uploaded"),
    extractedText: text("extracted_text"),
    extractedOutline: jsonb("extracted_outline").default([]), // [{ level, text, offset }]
    componentMap: jsonb("component_map"), // proposed (detected) OR confirmed (mapped)
    mapConfirmed: boolean("map_confirmed").default(false),
    detectionMeta: jsonb("detection_meta").default({}), // { truncated, model, componentCount }
    extractionError: text("extraction_error"),
    mappedByUserId: text("mapped_by_user_id").references(() => users.id),
    mappedAt: timestamp("mapped_at", { withTimezone: true }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("proposal_templates_tenant_id_idx").on(table.tenantId),
    index("proposal_templates_tenant_status_idx").on(table.tenantId, table.status),
  ],
);

// DB-blob backing store for uploaded template bytes (and, later, filled
// proposal output). storageRef on a template equals proposalAssets.id.
export const proposalAssets = pgTable(
  "proposal_assets",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    tenantId: text("tenant_id").references(() => tenants.id).notNull(),
    contentType: text("content_type").notNull(),
    byteSize: integer("byte_size").notNull(),
    bytes: bytea("bytes").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [index("proposal_assets_tenant_id_idx").on(table.tenantId)],
);
