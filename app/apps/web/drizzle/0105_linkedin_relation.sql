-- Spec 36 (T9) — a connected seat's 1st-degree relations (network snapshot) so
-- matching a sourced contact to "who on the team is already connected" is
-- instant. Idempotent; localdev then prod via DATABASE_URL_OWNER.

CREATE TABLE IF NOT EXISTS "linkedin_relation" (
  "id" text PRIMARY KEY NOT NULL,
  "tenant_id" text NOT NULL REFERENCES "tenants"("id"),
  "linkedin_account_id" text NOT NULL REFERENCES "linkedin_account"("id"),
  "provider_id" text NOT NULL,
  "profile_url" text NOT NULL,
  "public_identifier" text,
  "display_name" text,
  "headline" text,
  "connection_degree" text NOT NULL DEFAULT '1st',
  "last_synced_at" timestamptz DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "linkedin_relation_account_provider_uniq" ON "linkedin_relation" ("linkedin_account_id", "provider_id");
CREATE INDEX IF NOT EXISTS "linkedin_relation_tenant_profile_idx" ON "linkedin_relation" ("tenant_id", "profile_url");
