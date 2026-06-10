-- Inbox triage state (_specs/inbox-triage): per-conversation done/snoozed.
-- conversation_key = threadId | 'contact:<id>' | 'email:<id>'.
CREATE TABLE IF NOT EXISTS "inbox_triage" (
  "id" text PRIMARY KEY,
  "tenant_id" text NOT NULL REFERENCES "tenants"("id"),
  "conversation_key" text NOT NULL,
  "status" text NOT NULL DEFAULT 'open',
  "done_at" timestamptz,
  "snoozed_until" timestamptz,
  "updated_at" timestamptz DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "inbox_triage_tenant_key_uq" ON "inbox_triage" ("tenant_id", "conversation_key");
CREATE INDEX IF NOT EXISTS "inbox_triage_tenant_idx" ON "inbox_triage" ("tenant_id");
