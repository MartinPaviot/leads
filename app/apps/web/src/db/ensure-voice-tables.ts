/**
 * Idempotent runtime creation of the voice/cold-call tables.
 *
 * Mirrors `ensure-coaching-tables.ts`. Hand-written migrations cover
 * fresh prod environments; this function makes dev startup work
 * without an explicit migration step. Safe to call repeatedly. Errors
 * are logged and swallowed so a partial setup never crashes the app —
 * Call Mode degrades gracefully if the tables aren't there.
 */

import postgres from "postgres";

export async function ensureVoiceTables(): Promise<void> {
  if (!process.env.DATABASE_URL) return;
  const sql = postgres(process.env.DATABASE_URL);

  try {
    // ── call_outcome enum ────────────────────────────────────
    await sql`
      DO $$ BEGIN
        CREATE TYPE call_outcome AS ENUM (
          'connected', 'voicemail_left', 'no_answer', 'busy',
          'gatekeeper', 'wrong_number', 'do_not_call',
          'meeting_booked', 'callback_requested', 'not_interested', 'failed'
        );
      EXCEPTION WHEN duplicate_object THEN null; END $$
    `;

    // ── calls ────────────────────────────────────────────────
    await sql`
      CREATE TABLE IF NOT EXISTS calls (
        id                          text PRIMARY KEY DEFAULT gen_random_uuid()::text,
        tenant_id                   text NOT NULL,
        contact_id                  text NOT NULL,
        user_id                     text NOT NULL,
        deal_id                     text,
        enrollment_id               text,
        twilio_call_sid             text,
        from_number                 text NOT NULL,
        to_number                   text NOT NULL,
        started_at                  timestamptz NOT NULL DEFAULT now(),
        connected_at                timestamptz,
        ended_at                    timestamptz,
        duration_sec                integer,
        talk_time_sec               integer,
        outcome                     call_outcome,
        sentiment                   sentiment,
        recording_url               text,
        recording_duration_sec      integer,
        transcript                  jsonb DEFAULT '[]'::jsonb,
        summary                     text,
        buying_signals              jsonb DEFAULT '{}'::jsonb,
        action_items                jsonb DEFAULT '[]'::jsonb,
        voicemail_dropped           boolean DEFAULT false,
        voicemail_template_id       text,
        recording_consent           text DEFAULT 'n_a',
        two_party_consent_region    boolean DEFAULT false,
        answered_by                 text,
        coaching_cards              jsonb DEFAULT '[]'::jsonb,
        processing_state            text DEFAULT 'pending',
        processing_error            text,
        created_at                  timestamptz DEFAULT now(),
        updated_at                  timestamptz DEFAULT now()
      )
    `;
    await sql`CREATE UNIQUE INDEX IF NOT EXISTS calls_twilio_sid_idx ON calls (twilio_call_sid)`;
    await sql`CREATE INDEX IF NOT EXISTS calls_tenant_idx ON calls (tenant_id)`;
    await sql`CREATE INDEX IF NOT EXISTS calls_contact_idx ON calls (contact_id)`;
    await sql`CREATE INDEX IF NOT EXISTS calls_started_idx ON calls (started_at)`;
    await sql`CREATE INDEX IF NOT EXISTS calls_outcome_idx ON calls (tenant_id, outcome)`;
    // Phase 2 — back-compat ALTERs for environments that ran the
    // Phase 1 ensure before the answered_by column existed.
    await sql`ALTER TABLE calls ADD COLUMN IF NOT EXISTS answered_by text`;
    // Phase 3 — coaching cards jsonb.
    await sql`ALTER TABLE calls ADD COLUMN IF NOT EXISTS coaching_cards jsonb DEFAULT '[]'::jsonb`;

    // ── voicemail_templates ──────────────────────────────────
    await sql`
      CREATE TABLE IF NOT EXISTS voicemail_templates (
        id            text PRIMARY KEY DEFAULT gen_random_uuid()::text,
        tenant_id     text NOT NULL,
        name          text NOT NULL,
        audio_url     text NOT NULL,
        duration_sec  integer,
        language      text DEFAULT 'fr',
        variables     jsonb DEFAULT '[]'::jsonb,
        active        boolean DEFAULT true,
        created_at    timestamptz DEFAULT now()
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS vm_templates_tenant_idx ON voicemail_templates (tenant_id)`;

    // ── do_not_call_list ─────────────────────────────────────
    await sql`
      CREATE TABLE IF NOT EXISTS do_not_call_list (
        id            text PRIMARY KEY DEFAULT gen_random_uuid()::text,
        tenant_id     text,
        phone_number  text NOT NULL,
        reason        text NOT NULL,
        source        text DEFAULT 'manual',
        added_at      timestamptz DEFAULT now()
      )
    `;
    await sql`CREATE UNIQUE INDEX IF NOT EXISTS dnc_phone_tenant_idx ON do_not_call_list (tenant_id, phone_number)`;
    await sql`CREATE INDEX IF NOT EXISTS dnc_phone_idx ON do_not_call_list (phone_number)`;

    // ── phone_number_pool ────────────────────────────────────
    await sql`
      CREATE TABLE IF NOT EXISTS phone_number_pool (
        id              text PRIMARY KEY DEFAULT gen_random_uuid()::text,
        tenant_id       text NOT NULL,
        e164            text NOT NULL,
        twilio_sid      text NOT NULL,
        country_code    text NOT NULL,
        area_code       text,
        voice           boolean DEFAULT true,
        sms             boolean DEFAULT false,
        active          boolean DEFAULT true,
        created_at      timestamptz DEFAULT now()
      )
    `;
    await sql`CREATE UNIQUE INDEX IF NOT EXISTS pool_e164_idx ON phone_number_pool (e164)`;
    await sql`CREATE INDEX IF NOT EXISTS pool_tenant_idx ON phone_number_pool (tenant_id)`;
    await sql`CREATE INDEX IF NOT EXISTS pool_area_idx ON phone_number_pool (country_code, area_code)`;

    // ── voice_usage_monthly ──────────────────────────────────
    await sql`
      CREATE TABLE IF NOT EXISTS voice_usage_monthly (
        id                text PRIMARY KEY DEFAULT gen_random_uuid()::text,
        tenant_id         text NOT NULL,
        year_month        text NOT NULL,
        minutes_used      integer NOT NULL DEFAULT 0,
        calls_attempted   integer NOT NULL DEFAULT 0,
        calls_connected   integer NOT NULL DEFAULT 0,
        updated_at        timestamptz DEFAULT now()
      )
    `;
    await sql`CREATE UNIQUE INDEX IF NOT EXISTS voice_usage_tenant_month_idx ON voice_usage_monthly (tenant_id, year_month)`;
  } catch (err) {
    console.warn(
      "[ensureVoiceTables] setup error:",
      err instanceof Error ? err.message : err,
    );
  } finally {
    await sql.end({ timeout: 1 });
  }
}
