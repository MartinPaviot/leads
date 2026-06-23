-- Agent service run log — spec 04 (_specs/04-agent-service). Idempotent +
-- additive; new table, no existing consumers. DB-first per protocol.

CREATE TABLE IF NOT EXISTS agent_run (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id),
  kind text NOT NULL,
  request_id text NOT NULL,
  input jsonb,
  tools_called jsonb DEFAULT '[]'::jsonb,
  output jsonb,
  input_tokens integer,
  output_tokens integer,
  latency_ms integer,
  eval_passed boolean,
  eval_reason text,
  eval_score real,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS agent_run_request_idx ON agent_run (tenant_id, request_id);
CREATE INDEX IF NOT EXISTS agent_run_tenant_kind_idx ON agent_run (tenant_id, kind);
CREATE INDEX IF NOT EXISTS agent_run_created_idx ON agent_run (tenant_id, created_at);
