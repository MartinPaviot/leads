-- Sprint-3 audit follow-up — voice-of-customer queue.
-- Idempotent.

CREATE TABLE IF NOT EXISTS customer_requests (
  id              text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id       text NOT NULL,
  kind            text NOT NULL,
  verbatim        text NOT NULL,
  source          text NOT NULL,
  canonical_key   text,
  tenant_arr_usd  double precision,
  status          text NOT NULL DEFAULT 'open',
  metadata        jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at      timestamptz NOT NULL DEFAULT now(),
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS customer_requests_tenant_idx     ON customer_requests (tenant_id);
CREATE INDEX IF NOT EXISTS customer_requests_status_idx     ON customer_requests (status);
CREATE INDEX IF NOT EXISTS customer_requests_canonical_idx  ON customer_requests (canonical_key);
CREATE INDEX IF NOT EXISTS customer_requests_created_at_idx ON customer_requests (created_at);
