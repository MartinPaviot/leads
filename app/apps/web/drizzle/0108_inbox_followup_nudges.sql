-- P2 (inbox-deal-closer roadmap) — proactive follow-up nudges. A daily cron
-- (inngest/followup-nudge-cron.ts) drafts a gentle re-surface on a thread
-- that's gone quiet past the existing escalation ladder (lib/inbox/followup-
-- due.ts) and persists it here at status 'pending_review'. Nothing in this
-- feature sends automatically — only a human hitting /api/inbox/followups/
-- [id]/send (POST) flips a row to 'sent'. Personal: a connected mailbox is
-- per-user (lib/inbox/user-scope.ts), so user_id scopes every read/write here
-- exactly like connected_mailboxes.user_id does.
--
-- The dedupe index is on ALL FOUR (tenant_id, user_id, conversation_key,
-- stage) UNCONDITIONALLY (not partial on status) — once any row exists for a
-- given escalation rung, regardless of its current status, that rung is never
-- redrafted. A later stage on the same thread is a different row.
-- Additive + idempotent so the custom runner (scripts/apply-migrations.ts)
-- can re-apply safely.

DO $$ BEGIN
  CREATE TYPE inbox_followup_nudge_status AS ENUM ('pending_review', 'sent', 'dismissed', 'expired');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS inbox_followup_nudges (
  id                TEXT PRIMARY KEY,
  tenant_id         TEXT NOT NULL,
  user_id           TEXT NOT NULL,
  conversation_key  TEXT NOT NULL,
  contact_id        TEXT,
  to_address        TEXT NOT NULL,
  subject           TEXT NOT NULL,
  body_text         TEXT NOT NULL,
  stage             INTEGER NOT NULL,
  status            inbox_followup_nudge_status NOT NULL DEFAULT 'pending_review',
  generated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_at       TIMESTAMPTZ,
  sent_at           TIMESTAMPTZ,
  dismissed_at      TIMESTAMPTZ,
  expires_at        TIMESTAMPTZ NOT NULL,
  version           INTEGER NOT NULL DEFAULT 1,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ifn_tenant_user_status_idx
  ON inbox_followup_nudges (tenant_id, user_id, status);
CREATE INDEX IF NOT EXISTS ifn_conversation_idx
  ON inbox_followup_nudges (conversation_key);
CREATE UNIQUE INDEX IF NOT EXISTS ifn_dedupe_idx
  ON inbox_followup_nudges (tenant_id, user_id, conversation_key, stage);
