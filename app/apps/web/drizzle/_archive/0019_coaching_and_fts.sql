-- Sprint 2: Coaching tables + Full-Text Search index
-- Applies to: C5 (real-time coaching), C7 (feedback loop), C2 (verbatim search)

-- ── Coaching Insights ────────────────────────────────────

CREATE TABLE IF NOT EXISTS coaching_insights (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  user_id TEXT REFERENCES users(id),
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  activity_id TEXT REFERENCES activities(id),
  insight_type TEXT NOT NULL,
  category TEXT NOT NULL,
  score REAL,
  summary TEXT NOT NULL,
  detail TEXT NOT NULL,
  suggestion TEXT,
  acknowledged BOOLEAN DEFAULT FALSE,
  applied BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS coaching_insights_tenant_idx ON coaching_insights(tenant_id);
CREATE INDEX IF NOT EXISTS coaching_insights_user_idx ON coaching_insights(user_id);
CREATE INDEX IF NOT EXISTS coaching_insights_entity_idx ON coaching_insights(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS coaching_insights_created_at_idx ON coaching_insights(created_at);

-- ── AE Performance Snapshots ─────────────────────────────

CREATE TABLE IF NOT EXISTS ae_performance_snapshots (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  period_start TIMESTAMP WITH TIME ZONE NOT NULL,
  period_end TIMESTAMP WITH TIME ZONE NOT NULL,
  emails_sent INTEGER DEFAULT 0,
  emails_replied INTEGER DEFAULT 0,
  meetings_booked INTEGER DEFAULT 0,
  meetings_completed INTEGER DEFAULT 0,
  deals_created INTEGER DEFAULT 0,
  deals_advanced INTEGER DEFAULT 0,
  deals_won INTEGER DEFAULT 0,
  deals_lost INTEGER DEFAULT 0,
  avg_tone_score REAL,
  avg_completeness_score REAL,
  avg_objection_handling_score REAL,
  avg_process_adherence_score REAL,
  avg_response_time_minutes REAL,
  win_rate REAL,
  overall_score REAL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS ae_perf_tenant_user_idx ON ae_performance_snapshots(tenant_id, user_id);
CREATE INDEX IF NOT EXISTS ae_perf_period_idx ON ae_performance_snapshots(period_start, period_end);

-- ── Custom Skill Templates ───────────────────────────────

CREATE TABLE IF NOT EXISTS custom_skill_templates (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  slug TEXT NOT NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  description TEXT NOT NULL,
  trigger TEXT,
  context_required JSONB,
  output_format TEXT,
  guidelines TEXT NOT NULL,
  examples JSONB,
  version INTEGER DEFAULT 1,
  is_active BOOLEAN DEFAULT TRUE,
  created_by_user_id TEXT REFERENCES users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS custom_skill_templates_tenant_idx ON custom_skill_templates(tenant_id);
CREATE INDEX IF NOT EXISTS custom_skill_templates_slug_idx ON custom_skill_templates(tenant_id, slug);

-- ── Full-Text Search on Activity Bodies (C2) ─────────────
-- Generated column + GIN index for fast text search on
-- activity rawContent and summary. ILIKE fallback works
-- without this, but FTS is significantly faster for large
-- activity tables.

-- Note: ALTER TABLE with GENERATED ALWAYS requires the column
-- to not exist yet. Using DO block for idempotency.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'activities' AND column_name = 'body_tsvector'
  ) THEN
    ALTER TABLE activities ADD COLUMN body_tsvector tsvector
      GENERATED ALWAYS AS (
        to_tsvector('english', COALESCE(raw_content, '') || ' ' || COALESCE(summary, ''))
      ) STORED;
    CREATE INDEX idx_activities_body_fts ON activities USING gin(body_tsvector);
  END IF;
END $$;
