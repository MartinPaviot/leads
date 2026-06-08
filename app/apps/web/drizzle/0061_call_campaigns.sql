-- Goal-driven call campaigns + per-prospect cadence targets.
-- Additive + idempotent (guarded CREATE TYPE, IF NOT EXISTS everywhere) so
-- the custom runner (scripts/apply-migrations.ts) can re-apply safely.

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'call_campaign_status') THEN
    CREATE TYPE call_campaign_status AS ENUM ('active', 'paused', 'completed', 'archived');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'call_target_status') THEN
    CREATE TYPE call_target_status AS ENUM ('queued', 'in_progress', 'connected', 'converted', 'exhausted', 'dnc');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS call_campaigns (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  owner_id TEXT REFERENCES users(id),
  name TEXT NOT NULL,
  status call_campaign_status NOT NULL DEFAULT 'active',
  weekly_target INTEGER NOT NULL DEFAULT 0,
  days_per_week INTEGER NOT NULL DEFAULT 5,
  daily_quota INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 8,
  window_days INTEGER NOT NULL DEFAULT 15,
  target_filter JSONB DEFAULT '{}'::jsonb,
  start_date TIMESTAMPTZ DEFAULT now(),
  end_date TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS call_campaigns_tenant_idx ON call_campaigns (tenant_id);
CREATE INDEX IF NOT EXISTS call_campaigns_status_idx ON call_campaigns (tenant_id, status);

CREATE TABLE IF NOT EXISTS call_campaign_targets (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES call_campaigns(id) ON DELETE CASCADE,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  contact_id TEXT NOT NULL REFERENCES contacts(id),
  status call_target_status NOT NULL DEFAULT 'queued',
  attempt_count INTEGER NOT NULL DEFAULT 0,
  last_outcome call_outcome,
  last_attempt_at TIMESTAMPTZ,
  next_attempt_at TIMESTAMPTZ DEFAULT now(),
  listed_on TEXT,
  added_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS call_target_campaign_contact_idx ON call_campaign_targets (campaign_id, contact_id);
CREATE INDEX IF NOT EXISTS call_target_due_idx ON call_campaign_targets (tenant_id, status, next_attempt_at);
CREATE INDEX IF NOT EXISTS call_target_campaign_idx ON call_campaign_targets (campaign_id, status);
