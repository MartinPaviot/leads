-- Direct IMAP/SMTP mailbox support (provider "smtp_custom", no EmailEngine).
-- The connected_mailboxes columns are declared in db/schema/outbound.ts but
-- were never migrated onto the live DB, so inserts/reads that touch them would
-- 42703. This adds them idempotently. The password is stored AES-256-GCM
-- encrypted (lib/crypto/settings-encryption); imap_last_uid lets the poll cron
-- fetch only new mail.
ALTER TABLE "connected_mailboxes" ADD COLUMN IF NOT EXISTS "imap_host" text;
ALTER TABLE "connected_mailboxes" ADD COLUMN IF NOT EXISTS "imap_port" integer;
ALTER TABLE "connected_mailboxes" ADD COLUMN IF NOT EXISTS "smtp_host" text;
ALTER TABLE "connected_mailboxes" ADD COLUMN IF NOT EXISTS "smtp_port" integer;
ALTER TABLE "connected_mailboxes" ADD COLUMN IF NOT EXISTS "secret_encrypted" text;
ALTER TABLE "connected_mailboxes" ADD COLUMN IF NOT EXISTS "imap_last_uid" integer;
