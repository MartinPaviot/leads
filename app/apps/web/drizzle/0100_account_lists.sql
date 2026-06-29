-- Account lists — user-curated, static collections of accounts (companies).
-- A list is a named bag of company ids selected on the Accounts page; it renders
-- as a selectable chip beside the source tabs and scopes the list to its members.
-- Distinct from `segments` (campaign segmentation) and `call_lists` (call queue).
-- Additive + idempotent (IF NOT EXISTS everywhere) so the custom runner
-- (scripts/apply-migrations.ts) can re-apply safely.

CREATE TABLE IF NOT EXISTS account_lists (
  id          TEXT PRIMARY KEY,
  tenant_id   TEXT NOT NULL REFERENCES tenants(id),
  name        TEXT NOT NULL,
  owner_id    TEXT REFERENCES users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS account_lists_tenant_idx ON account_lists (tenant_id);
CREATE UNIQUE INDEX IF NOT EXISTS account_lists_tenant_name_idx ON account_lists (tenant_id, name);

CREATE TABLE IF NOT EXISTS account_list_members (
  list_id     TEXT NOT NULL REFERENCES account_lists(id) ON DELETE CASCADE,
  company_id  TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  added_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (list_id, company_id)
);
CREATE INDEX IF NOT EXISTS account_list_members_company_idx ON account_list_members (company_id);
