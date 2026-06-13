import {
  pgTable,
  text,
  timestamp,
  jsonb,
  integer,
  real,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { tenants, users, companies } from "./core";

// ============================================================
// CONNECTION GRAPH (_specs/CONNECTION-GRAPH) — the founder's LinkedIn
// relationship graph, mapped to the ICP, as a warm-path source.
//
// DORMANT INFRA. Nothing here runs in production: the ingestion job is
// gated behind `isConnectionGraphEnabled()` (env LINKEDIN_GRAPH_ENABLED,
// default off) and is NOT registered in the Inngest route. These tables
// are declared so the code typechecks and the migration exists, but the
// migration (drizzle/manual/0002_connection_graph.sql) is NOT applied
// until Unipile (or a self-hosted provider) is integrated.
//
// Scope is PERSONAL, like connected mailboxes and calendars: a graph
// belongs to one user (the LinkedIn account owner), never the shared
// tenant CRM. A team of N founders = N overlapping graphs whose union
// is the tenant's warm surface.
// ============================================================

// One connected LinkedIn account per user. Mirrors the per-user owner
// pattern of `connected_mailboxes`: only the owner holds the session and
// sees the graph. `provider` keeps us vendor-agnostic — "unipile" today,
// "self_hosted"/"mock" possible — so the adapter can be swapped without a
// schema change. `tier` (free/premium/sales_navigator/...) gates what the
// feature can do, because the provider only ever returns what the user's
// own LinkedIn plan already shows.
export const linkedinAccounts = pgTable(
  "linkedin_accounts",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    tenantId: text("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    // Auth-user id (same space as connected_mailboxes.userId).
    userId: text("user_id")
      .references(() => users.id)
      .notNull(),
    provider: text("provider").notNull(), // "unipile" | "self_hosted" | "mock"
    // The provider's handle for this connected account.
    externalAccountId: text("external_account_id").notNull(),
    // "free" | "premium" | "sales_navigator" | "recruiter" | "unknown"
    tier: text("tier").notNull().default("unknown"),
    // "disconnected" | "connected" | "error"
    status: text("status").notNull().default("disconnected"),
    // Pagination resume point for the drip ingestion (rate limits force a
    // multi-day crawl, so we persist where we stopped).
    syncCursor: text("sync_cursor"),
    connectedAt: timestamp("connected_at", { withTimezone: true }),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    metadata: jsonb("metadata").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("linkedin_accounts_provider_external_idx").on(
      t.provider,
      t.externalAccountId,
    ),
    index("linkedin_accounts_tenant_user_idx").on(t.tenantId, t.userId),
  ],
);

// One edge per (owner, 1st-degree relation). `resolvedCompanyId` is the
// join into the CRM `companies` table — it is what lets us overlay the
// graph onto the ICP (company_icp_fit). Null when the relation's employer
// isn't in our company set (we fail to null rather than fuzzy-guess).
// `networkDistance` is normalised to first/second/third/out_of_network;
// `sharedConnectionsCount` is meaningful for non-first-degree people
// (the intro-path signal).
export const connectionEdges = pgTable(
  "connection_edges",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    tenantId: text("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    ownerUserId: text("owner_user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    linkedinAccountId: text("linkedin_account_id")
      .references(() => linkedinAccounts.id, { onDelete: "cascade" })
      .notNull(),
    personExternalId: text("person_external_id").notNull(),
    personName: text("person_name").notNull(),
    personHeadline: text("person_headline"),
    rawCompanyName: text("raw_company_name"),
    rawCompanyDomain: text("raw_company_domain"),
    resolvedCompanyId: text("resolved_company_id").references(
      () => companies.id,
      { onDelete: "set null" },
    ),
    // "first" | "second" | "third" | "out_of_network"
    networkDistance: text("network_distance").notNull().default("out_of_network"),
    sharedConnectionsCount: integer("shared_connections_count")
      .notNull()
      .default(0),
    source: text("source").notNull(), // provider id that produced the edge
    ingestedAt: timestamp("ingested_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("connection_edges_owner_person_idx").on(
      t.ownerUserId,
      t.personExternalId,
    ),
    index("connection_edges_tenant_owner_idx").on(t.tenantId, t.ownerUserId),
    index("connection_edges_resolved_company_idx").on(
      t.tenantId,
      t.resolvedCompanyId,
    ),
  ],
);

// Materialised warm path per (owner, account). Recomputable from
// `connection_edges` at any time — we persist it so the priority score
// and routing can join cheaply instead of recomputing the graph on
// every read. `kind`: insider (a 1st-degree connection works AT the
// account) | intro_path (a connection can introduce a cold target) |
// none. `evidence` carries the connector edge ids for the UI.
export const warmPaths = pgTable(
  "warm_paths",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    tenantId: text("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    ownerUserId: text("owner_user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    companyId: text("company_id")
      .references(() => companies.id, { onDelete: "cascade" })
      .notNull(),
    kind: text("kind").notNull(), // "insider" | "intro_path" | "none"
    strength: real("strength").notNull().default(0),
    connectorCount: integer("connector_count").notNull().default(0),
    evidence: jsonb("evidence").notNull().default({}),
    computedAt: timestamp("computed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("warm_paths_owner_company_idx").on(t.ownerUserId, t.companyId),
    index("warm_paths_tenant_company_idx").on(t.tenantId, t.companyId),
  ],
);
