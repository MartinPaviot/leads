-- MONACO-PARITY-03 (onboarding_progress) + MONACO-PARITY-04 (visits).
-- Idempotent — safe to apply twice.

-- ── onboarding_progress ────────────────────────────────────
CREATE TABLE IF NOT EXISTS onboarding_progress (
  id                text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id         text NOT NULL,
  current_phase     integer NOT NULL DEFAULT 1,
  completed_phases  jsonb NOT NULL DEFAULT '[]'::jsonb,
  phase_data        jsonb NOT NULL DEFAULT '{}'::jsonb,
  checklist_state   jsonb NOT NULL DEFAULT '{}'::jsonb,
  started_at        timestamptz NOT NULL DEFAULT now(),
  completed_at      timestamptz,
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS onboarding_progress_tenant_idx
  ON onboarding_progress (tenant_id);

-- ── visits ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS visits (
  id              text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id       text NOT NULL,
  visitor_id      text NOT NULL,
  ip_hash         text NOT NULL,
  url             text NOT NULL,
  referrer        text,
  utm             jsonb DEFAULT '{}'::jsonb,
  user_agent      text,
  company_domain  text,
  company_id      text,
  identified_at   timestamptz,
  identified_by   text,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS visits_tenant_idx       ON visits (tenant_id);
CREATE INDEX IF NOT EXISTS visits_visitor_idx      ON visits (visitor_id);
CREATE INDEX IF NOT EXISTS visits_company_idx      ON visits (company_id);
CREATE INDEX IF NOT EXISTS visits_created_at_idx   ON visits (created_at);
