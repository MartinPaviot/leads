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
import { tenants, users, deals } from "./core";

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

// A filled proposal instance: a mapped template + a deal, with each
// component's resolved/generated content. PROPOSAL-002.
export const proposals = pgTable(
  "proposals",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    tenantId: text("tenant_id").references(() => tenants.id).notNull(),
    templateId: text("template_id").references(() => proposalTemplates.id).notNull(),
    dealId: text("deal_id").references(() => deals.id),
    createdByUserId: text("created_by_user_id").references(() => users.id),
    status: text("status").notNull().default("filled"), // filled | exported
    // ref to a stored, assembled .docx (proposalAssets.id) once exported
    outputStorageRef: text("output_storage_ref"),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("proposals_tenant_id_idx").on(table.tenantId),
    index("proposals_template_id_idx").on(table.templateId),
    index("proposals_deal_id_idx").on(table.dealId),
  ],
);

// One row per filled component (mirrors the template's componentMap order).
// `source` + `confidence` are populated by PROPOSAL-003 (trust stack).
export const proposalComponents = pgTable(
  "proposal_components",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    tenantId: text("tenant_id").references(() => tenants.id).notNull(),
    proposalId: text("proposal_id").references(() => proposals.id).notNull(),
    componentId: text("component_id").notNull(), // the componentMap component id
    kind: text("kind").notNull(), // section | field
    label: text("label").notNull(),
    placeholderToken: text("placeholder_token").notNull(),
    dataKey: text("data_key"),
    content: text("content").notNull().default(""),
    source: jsonb("source").default({}), // PROPOSAL-003 citations
    confidence: text("confidence"), // PROPOSAL-003 high|medium|low
    order: integer("order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("proposal_components_tenant_id_idx").on(table.tenantId),
    index("proposal_components_proposal_id_idx").on(table.proposalId),
  ],
);
