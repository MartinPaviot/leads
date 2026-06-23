-- Credit metering ledger + budget counters — spec 02
-- (_specs/02-metering-and-budget). Idempotent + additive only. The custom
-- runner wraps this in a transaction.
--
-- DB-first: apply BEFORE deploying the matching Drizzle schema change, or an
-- unmigrated select-all on these tables 500s.

CREATE TABLE IF NOT EXISTS credit_ledger (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id),
  campaign_id text,
  account_id text,
  kind text NOT NULL,
  provider text NOT NULL,
  amount integer NOT NULL,
  balance_after integer,
  ref text NOT NULL,
  cache_hit boolean NOT NULL DEFAULT false,
  result jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
-- Idempotency: one charge per (workspace, ref).
CREATE UNIQUE INDEX IF NOT EXISTS credit_ledger_ref_idx ON credit_ledger (tenant_id, ref);
CREATE INDEX IF NOT EXISTS credit_ledger_tenant_idx ON credit_ledger (tenant_id);
CREATE INDEX IF NOT EXISTS credit_ledger_account_idx ON credit_ledger (tenant_id, account_id);
CREATE INDEX IF NOT EXISTS credit_ledger_campaign_idx ON credit_ledger (tenant_id, campaign_id);
CREATE INDEX IF NOT EXISTS credit_ledger_created_idx ON credit_ledger (tenant_id, created_at);

CREATE TABLE IF NOT EXISTS workspace_budgets (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id),
  scope_key text NOT NULL,
  limit_amount integer NOT NULL,
  remaining_amount integer NOT NULL,
  period_start timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS workspace_budgets_scope_idx ON workspace_budgets (tenant_id, scope_key);
