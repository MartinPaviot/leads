-- Search monitors — saved LinkedIn/Sales-Nav ICP queries that re-run on a
-- schedule and source the net-new matches into the CRM (source-only; never
-- enrolls). Additive + idempotent.

CREATE TABLE IF NOT EXISTS "search_monitors" (
  "id" text PRIMARY KEY NOT NULL,
  "tenant_id" text NOT NULL REFERENCES "tenants"("id"),
  "created_by" text REFERENCES "users"("id"),
  "label" text NOT NULL,
  "category" text NOT NULL,
  "criteria" jsonb NOT NULL,
  "status" text NOT NULL DEFAULT 'active',
  "max_per_run" integer NOT NULL DEFAULT 100,
  "last_run_at" timestamptz,
  "last_run_summary" jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "search_monitors_tenant_idx" ON "search_monitors" ("tenant_id");
CREATE INDEX IF NOT EXISTS "search_monitors_tenant_status_idx" ON "search_monitors" ("tenant_id", "status");
CREATE UNIQUE INDEX IF NOT EXISTS "search_monitors_tenant_label_idx" ON "search_monitors" ("tenant_id", "label");
