-- Spec 36 — LinkedIn sending-identity + Unipile state (T4).
-- Idempotent (the drizzle journal is frozen at 0012; applied via db:push on
-- localdev, then prod via DATABASE_URL_OWNER per the project migration rule).

CREATE TABLE IF NOT EXISTS "linkedin_account" (
  "id" text PRIMARY KEY NOT NULL,
  "tenant_id" text NOT NULL REFERENCES "tenants"("id"),
  "user_id" text NOT NULL REFERENCES "users"("id"),
  "provider" text NOT NULL DEFAULT 'unipile',
  "unipile_account_id" text UNIQUE,
  "display_name" text,
  "profile_url" text,
  "seat_type" text NOT NULL DEFAULT 'classic',
  "status" text NOT NULL DEFAULT 'pending',
  "last_health_at" timestamptz,
  "health_detail" jsonb DEFAULT '{}'::jsonb,
  "daily_cap_connect" integer NOT NULL DEFAULT 20,
  "daily_cap_message" integer NOT NULL DEFAULT 100,
  "warmup_started_at" timestamptz,
  "connected_at" timestamptz,
  "created_at" timestamptz DEFAULT now(),
  "updated_at" timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "linkedin_account_tenant_idx" ON "linkedin_account" ("tenant_id");
CREATE INDEX IF NOT EXISTS "linkedin_account_tenant_status_idx" ON "linkedin_account" ("tenant_id", "status");

CREATE TABLE IF NOT EXISTS "linkedin_provider_identity" (
  "id" text PRIMARY KEY NOT NULL,
  "tenant_id" text NOT NULL REFERENCES "tenants"("id"),
  "contact_id" text NOT NULL REFERENCES "contacts"("id"),
  "linkedin_account_id" text NOT NULL REFERENCES "linkedin_account"("id"),
  "profile_url" text NOT NULL,
  "provider_id" text NOT NULL,
  "chat_id" text,
  "connection_degree" text,
  "resolved_at" timestamptz DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "linkedin_provider_identity_account_contact_uniq" ON "linkedin_provider_identity" ("linkedin_account_id", "contact_id");
CREATE INDEX IF NOT EXISTS "linkedin_provider_identity_tenant_profile_idx" ON "linkedin_provider_identity" ("tenant_id", "profile_url");

CREATE TABLE IF NOT EXISTS "linkedin_action_event" (
  "id" text PRIMARY KEY NOT NULL,
  "tenant_id" text NOT NULL REFERENCES "tenants"("id"),
  "linkedin_account_id" text NOT NULL REFERENCES "linkedin_account"("id"),
  "step_id" text NOT NULL,
  "contact_id" text NOT NULL REFERENCES "contacts"("id"),
  "action" text NOT NULL,
  "provider_action_id" text,
  "idempotency_key" text NOT NULL UNIQUE,
  "at" timestamptz NOT NULL,
  "created_at" timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "linkedin_action_event_today_idx" ON "linkedin_action_event" ("tenant_id", "linkedin_account_id", "action", "at");
