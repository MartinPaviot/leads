-- TAM lifecycle: the proposal queue that makes the TAM "live" under an
-- approval-queue posture. The living loops enqueue add/refresh/exclude
-- proposals; the founder approves in one click. Additive + idempotent.

CREATE TABLE IF NOT EXISTS tam_proposals (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id),
  kind text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  dedup_key text,
  entity_type text,
  entity_id text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  summary text,
  reason text,
  source text,
  score real,
  applied_entity_id text,
  reviewed_by_user_id text REFERENCES users(id),
  reviewed_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS tam_proposals_tenant_status_idx
  ON tam_proposals (tenant_id, status);
CREATE INDEX IF NOT EXISTS tam_proposals_tenant_kind_status_idx
  ON tam_proposals (tenant_id, kind, status);
CREATE INDEX IF NOT EXISTS tam_proposals_dedup_idx
  ON tam_proposals (tenant_id, kind, dedup_key);
