-- Voice cold call Phase 1 schema (PR #32).
--
-- 5 tables + 1 enum that landed in `src/db/schema/voice.ts` but
-- without a corresponding migration. Hand-crafted from that schema
-- file. Additive, idempotent (IF NOT EXISTS guards everywhere).
--
-- - call_outcome ENUM        — terminal states of a single dial
-- - calls                    — one row per outbound dial attempt
-- - voicemail_templates      — pre-recorded MP3 library per tenant
-- - do_not_call_list         — tenant-scoped + global DNC
-- - phone_number_pool        — Twilio numbers owned by the tenant
-- - voice_usage_monthly      — O(1) cap check on /api/calls/start

-- 1. Enum
DO $$ BEGIN
  CREATE TYPE call_outcome AS ENUM (
    'connected',
    'voicemail_left',
    'no_answer',
    'busy',
    'gatekeeper',
    'wrong_number',
    'do_not_call',
    'meeting_booked',
    'callback_requested',
    'not_interested',
    'failed'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- 2. calls
CREATE TABLE IF NOT EXISTS calls (
  id                       TEXT PRIMARY KEY,
  tenant_id                TEXT NOT NULL REFERENCES tenants(id),
  contact_id               TEXT NOT NULL REFERENCES contacts(id),
  user_id                  TEXT NOT NULL REFERENCES users(id),
  deal_id                  TEXT REFERENCES deals(id),
  enrollment_id            TEXT REFERENCES sequence_enrollments(id),

  twilio_call_sid          TEXT,
  from_number              TEXT NOT NULL,
  to_number                TEXT NOT NULL,

  started_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  connected_at             TIMESTAMPTZ,
  ended_at                 TIMESTAMPTZ,
  duration_sec             INTEGER,
  talk_time_sec            INTEGER,

  outcome                  call_outcome,
  sentiment                sentiment,

  recording_url            TEXT,
  recording_duration_sec   INTEGER,
  transcript               JSONB DEFAULT '[]'::jsonb,
  summary                  TEXT,
  buying_signals           JSONB DEFAULT '{}'::jsonb,
  action_items             JSONB DEFAULT '[]'::jsonb,

  voicemail_dropped        BOOLEAN DEFAULT FALSE,
  voicemail_template_id    TEXT,
  recording_consent        TEXT DEFAULT 'n_a',
  two_party_consent_region BOOLEAN DEFAULT FALSE,
  answered_by              TEXT,

  coaching_cards           JSONB DEFAULT '[]'::jsonb,

  processing_state         TEXT DEFAULT 'pending',
  processing_error         TEXT,

  created_at               TIMESTAMPTZ DEFAULT NOW(),
  updated_at               TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS calls_twilio_sid_idx ON calls (twilio_call_sid);
CREATE INDEX IF NOT EXISTS calls_tenant_idx ON calls (tenant_id);
CREATE INDEX IF NOT EXISTS calls_contact_idx ON calls (contact_id);
CREATE INDEX IF NOT EXISTS calls_started_idx ON calls (started_at);
CREATE INDEX IF NOT EXISTS calls_outcome_idx ON calls (tenant_id, outcome);

-- 3. voicemail_templates
CREATE TABLE IF NOT EXISTS voicemail_templates (
  id           TEXT PRIMARY KEY,
  tenant_id    TEXT NOT NULL REFERENCES tenants(id),
  name         TEXT NOT NULL,
  audio_url    TEXT NOT NULL,
  duration_sec INTEGER,
  language     TEXT DEFAULT 'fr',
  variables    JSONB DEFAULT '[]'::jsonb,
  active       BOOLEAN DEFAULT TRUE,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS vm_templates_tenant_idx ON voicemail_templates (tenant_id);

-- 4. do_not_call_list — composite uniqueness on (tenant_id, phone_number)
--    so global (tenant_id IS NULL) + tenant-scoped entries co-exist.
CREATE TABLE IF NOT EXISTS do_not_call_list (
  id           TEXT PRIMARY KEY,
  tenant_id    TEXT REFERENCES tenants(id),
  phone_number TEXT NOT NULL,
  reason       TEXT NOT NULL,
  source       TEXT DEFAULT 'manual',
  added_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS dnc_phone_tenant_idx
  ON do_not_call_list (tenant_id, phone_number);
CREATE INDEX IF NOT EXISTS dnc_phone_idx ON do_not_call_list (phone_number);

-- 5. phone_number_pool — Twilio numbers owned per tenant.
--    e164 globally unique because two tenants can't own the same SID.
CREATE TABLE IF NOT EXISTS phone_number_pool (
  id            TEXT PRIMARY KEY,
  tenant_id     TEXT NOT NULL REFERENCES tenants(id),
  e164          TEXT NOT NULL,
  twilio_sid    TEXT NOT NULL,
  country_code  TEXT NOT NULL,
  area_code     TEXT,
  voice         BOOLEAN DEFAULT TRUE,
  sms           BOOLEAN DEFAULT FALSE,
  active        BOOLEAN DEFAULT TRUE,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS pool_e164_idx ON phone_number_pool (e164);
CREATE INDEX IF NOT EXISTS pool_tenant_idx ON phone_number_pool (tenant_id);
CREATE INDEX IF NOT EXISTS pool_area_idx ON phone_number_pool (country_code, area_code);

-- 6. voice_usage_monthly — O(1) cap check at /api/calls/start
CREATE TABLE IF NOT EXISTS voice_usage_monthly (
  id               TEXT PRIMARY KEY,
  tenant_id        TEXT NOT NULL REFERENCES tenants(id),
  year_month       TEXT NOT NULL,
  minutes_used     INTEGER NOT NULL DEFAULT 0,
  calls_attempted  INTEGER NOT NULL DEFAULT 0,
  calls_connected  INTEGER NOT NULL DEFAULT 0,
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS voice_usage_tenant_month_idx
  ON voice_usage_monthly (tenant_id, year_month);
