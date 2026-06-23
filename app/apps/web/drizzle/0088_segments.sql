-- Campaign segments — spec 13 (_specs/13-segmentation-and-tam-estimate).
-- Idempotent + additive; new table, no existing consumers. DB-first per protocol.

CREATE TABLE IF NOT EXISTS segments (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id),
  campaign_id text,
  icp_version_id text,
  archetype text NOT NULL,
  definition jsonb NOT NULL DEFAULT '{}'::jsonb,
  signal_binding text,
  estimated_tam integer,
  goal text,
  channel_mix jsonb DEFAULT '{}'::jsonb,
  daily_send_budget integer,
  status text NOT NULL DEFAULT 'draft',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS segments_tenant_idx ON segments (tenant_id);
CREATE INDEX IF NOT EXISTS segments_campaign_idx ON segments (tenant_id, campaign_id);
