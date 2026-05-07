-- Pipeline Observability: end-to-end attribution across Inngest + BullMQ + Webhooks

DO $$ BEGIN
  CREATE TYPE pipeline_stage AS ENUM (
    'enriched',
    'signal_detected',
    'enrolled',
    'email_generated',
    'email_queued',
    'email_sent',
    'email_delivered',
    'email_opened',
    'email_clicked',
    'email_replied',
    'email_bounced',
    'meeting_booked',
    'deal_created',
    'deal_won',
    'deal_lost'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS pipeline_events (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  trace_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  company_id TEXT REFERENCES companies(id),
  contact_id TEXT REFERENCES contacts(id),
  deal_id TEXT REFERENCES deals(id),
  enrollment_id TEXT,
  outbound_email_id TEXT,
  stage pipeline_stage NOT NULL,
  source_system TEXT NOT NULL,
  duration_ms INTEGER,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS pe_trace_idx ON pipeline_events(trace_id);
CREATE INDEX IF NOT EXISTS pe_tenant_created_idx ON pipeline_events(tenant_id, created_at);
CREATE INDEX IF NOT EXISTS pe_company_created_idx ON pipeline_events(company_id, created_at);
CREATE INDEX IF NOT EXISTS pe_stage_created_idx ON pipeline_events(stage, created_at);
CREATE INDEX IF NOT EXISTS pe_contact_idx ON pipeline_events(contact_id);
CREATE INDEX IF NOT EXISTS pe_enrollment_idx ON pipeline_events(enrollment_id);
