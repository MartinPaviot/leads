-- Orchestration — approval gates + workflow runs — spec 03
-- (_specs/03-orchestration-and-gates). Idempotent + additive only. New tables
-- with no existing consumers, so deploy-safe, but DB-first per protocol.

CREATE TABLE IF NOT EXISTS workflow_runs (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id),
  kind text NOT NULL,
  current_module text,
  state text NOT NULL DEFAULT 'running',
  payload jsonb DEFAULT '{}'::jsonb,
  inngest_event_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS workflow_runs_tenant_idx ON workflow_runs (tenant_id);
CREATE INDEX IF NOT EXISTS workflow_runs_state_idx ON workflow_runs (tenant_id, state);

CREATE TABLE IF NOT EXISTS approval_gate (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id),
  run_id text NOT NULL REFERENCES workflow_runs(id),
  kind text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  decision text,
  edited_payload jsonb,
  reason text,
  decided_by text,
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS approval_gate_tenant_idx ON approval_gate (tenant_id);
CREATE INDEX IF NOT EXISTS approval_gate_run_idx ON approval_gate (run_id);
