-- P0-1 task 1.1 — sequence_drafts queue.
-- Idempotent. Adds the per-email approval queue table that replaces
-- the implicit "draft sequence status" pattern with an explicit
-- per-email lifecycle state machine.
--
-- State machine :
--   pending_approval → approved → sent
--   pending_approval → rejected (terminal)
--   pending_approval → expired (terminal, after 24h cron)
--
-- All terminal states keep the row for audit. The
-- `sequence_drafts_tenant_status_idx` makes the review-queue read
-- (filter by tenant + status, sort by age desc) one index probe.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'sequence_draft_status') THEN
    CREATE TYPE sequence_draft_status AS ENUM (
      'pending_approval',
      'approved',
      'rejected',
      'expired',
      'sent'
    );
  END IF;
END$$;

CREATE TABLE IF NOT EXISTS sequence_drafts (
  id              text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id       text NOT NULL,
  sequence_id     text NOT NULL,
  step_id         text NOT NULL,
  enrollment_id   text NOT NULL,
  contact_id      text NOT NULL,

  -- Drafted content (snapshot at generation time — not mutated by
  -- ulterior step-template edits ; the founder approves what they see)
  subject         text NOT NULL,
  body_html       text NOT NULL,
  body_text       text NOT NULL,

  -- Why this draft was generated — surfaced in the approval UI
  -- "Why this draft?" panel for context.
  trigger_reason  text NOT NULL,
  personalization_sources jsonb NOT NULL DEFAULT '[]'::jsonb,

  -- State machine
  status          sequence_draft_status NOT NULL DEFAULT 'pending_approval',
  generated_at    timestamptz NOT NULL DEFAULT now(),
  reviewed_at     timestamptz,
  reviewed_by     text,
  review_reason   text,
  scheduled_send_at timestamptz,
  sent_at         timestamptz,

  -- Optimistic-locking guard against double-approve race.
  version         integer NOT NULL DEFAULT 1,

  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- Review-queue read pattern : tenant + status + age desc.
CREATE INDEX IF NOT EXISTS sequence_drafts_tenant_status_idx
  ON sequence_drafts (tenant_id, status, generated_at DESC);

-- Enrollment-scoped lookup (resequence after reject, dedup checks).
CREATE INDEX IF NOT EXISTS sequence_drafts_enrollment_idx
  ON sequence_drafts (enrollment_id);

-- Sequence-scoped lookup for analytics ("how many drafts rejected
-- on sequence X this week").
CREATE INDEX IF NOT EXISTS sequence_drafts_sequence_idx
  ON sequence_drafts (sequence_id, generated_at DESC);

-- Expiry cron's hot path : pending drafts past TTL.
CREATE INDEX IF NOT EXISTS sequence_drafts_pending_age_idx
  ON sequence_drafts (generated_at)
  WHERE status = 'pending_approval';
