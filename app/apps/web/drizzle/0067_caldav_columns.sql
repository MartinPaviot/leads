-- CalDAV calendar support for "smtp_custom" (IMAP/SMTP) mailboxes.
-- The IMAP/SMTP path carries no calendar; these columns let a custom mailbox
-- sync meetings over CalDAV using the same encrypted password.
-- Additive + idempotent (re-applying is safe), per the apply-migrations runner.
ALTER TABLE "connected_mailboxes" ADD COLUMN IF NOT EXISTS "caldav_url" text;
ALTER TABLE "connected_mailboxes" ADD COLUMN IF NOT EXISTS "caldav_last_sync_at" timestamp with time zone;
