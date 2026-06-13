-- 0002 — Connection graph (warm-path from the founder's LinkedIn network).
--
-- DORMANT INFRA — DO NOT APPLY IN PRODUCTION YET. This is the DDL artifact
-- for _specs/CONNECTION-GRAPH. It is additive (three new tables, no change
-- to existing ones) and is applied deliberately, by hand, only when Unipile
-- (or a self-hosted provider) is integrated. The feature is gated off in
-- code (LINKEDIN_GRAPH_ENABLED) so these tables stay empty until then.
--
-- Kept under drizzle/manual/ (not the auto-migration journal) so it does
-- not interfere with `drizzle-kit generate`. When integrating, either run
-- this file or regenerate via drizzle-kit from the schema.

CREATE TABLE IF NOT EXISTS "linkedin_accounts" (
  "id" text PRIMARY KEY NOT NULL,
  "tenant_id" text NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "user_id" text NOT NULL REFERENCES "users"("id"),
  "provider" text NOT NULL,
  "external_account_id" text NOT NULL,
  "tier" text NOT NULL DEFAULT 'unknown',
  "status" text NOT NULL DEFAULT 'disconnected',
  "sync_cursor" text,
  "connected_at" timestamptz,
  "last_synced_at" timestamptz,
  "metadata" jsonb NOT NULL DEFAULT '{}',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "linkedin_accounts_provider_external_idx"
  ON "linkedin_accounts" ("provider", "external_account_id");
CREATE INDEX IF NOT EXISTS "linkedin_accounts_tenant_user_idx"
  ON "linkedin_accounts" ("tenant_id", "user_id");

CREATE TABLE IF NOT EXISTS "connection_edges" (
  "id" text PRIMARY KEY NOT NULL,
  "tenant_id" text NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "owner_user_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "linkedin_account_id" text NOT NULL REFERENCES "linkedin_accounts"("id") ON DELETE CASCADE,
  "person_external_id" text NOT NULL,
  "person_name" text NOT NULL,
  "person_headline" text,
  "raw_company_name" text,
  "raw_company_domain" text,
  "resolved_company_id" text REFERENCES "companies"("id") ON DELETE SET NULL,
  "network_distance" text NOT NULL DEFAULT 'out_of_network',
  "shared_connections_count" integer NOT NULL DEFAULT 0,
  "source" text NOT NULL,
  "ingested_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "connection_edges_owner_person_idx"
  ON "connection_edges" ("owner_user_id", "person_external_id");
CREATE INDEX IF NOT EXISTS "connection_edges_tenant_owner_idx"
  ON "connection_edges" ("tenant_id", "owner_user_id");
CREATE INDEX IF NOT EXISTS "connection_edges_resolved_company_idx"
  ON "connection_edges" ("tenant_id", "resolved_company_id");

CREATE TABLE IF NOT EXISTS "warm_paths" (
  "id" text PRIMARY KEY NOT NULL,
  "tenant_id" text NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "owner_user_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "company_id" text NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
  "kind" text NOT NULL,
  "strength" real NOT NULL DEFAULT 0,
  "connector_count" integer NOT NULL DEFAULT 0,
  "evidence" jsonb NOT NULL DEFAULT '{}',
  "computed_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "warm_paths_owner_company_idx"
  ON "warm_paths" ("owner_user_id", "company_id");
CREATE INDEX IF NOT EXISTS "warm_paths_tenant_company_idx"
  ON "warm_paths" ("tenant_id", "company_id");
