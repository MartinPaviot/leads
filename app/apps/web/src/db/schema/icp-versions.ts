// Versioned ICP models (spec 11, _specs/11-icp-model-store-and-nl-to-icp).
// Editing an ICP inserts a NEW immutable version (snapshotting name + weighted
// criteria) and supersedes the prior active one — prior versions are retained
// for reproducibility (the existing icps table mutated in place). One active
// version per (tenant, icp_id).
import {
  pgTable,
  text,
  integer,
  jsonb,
  timestamp,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { tenants } from "./core";

export const icpVersions = pgTable(
  "icp_versions",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    tenantId: text("tenant_id").references(() => tenants.id).notNull(),
    /** Logical ICP id (stable across versions). */
    icpId: text("icp_id").notNull(),
    version: integer("version").notNull(),
    name: text("name").notNull(),
    /** Snapshot of the weighted criteria (firmo/techno/signal/exclusion). */
    criteria: jsonb("criteria").notNull().default([]),
    // draft | active | superseded
    status: text("status").notNull().default("draft"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    supersededAt: timestamp("superseded_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("icp_versions_icp_version_idx").on(table.tenantId, table.icpId, table.version),
    index("icp_versions_status_idx").on(table.tenantId, table.icpId, table.status),
  ],
);
