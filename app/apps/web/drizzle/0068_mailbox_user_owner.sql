-- (B) Connected mailboxes are personal: add a per-user owner.
-- The owner is the auth-user id (same space as auth_account.userId /
-- authCtx.userId). Backfilled by matching the mailbox address to the
-- auth user's login email. Idempotent.
ALTER TABLE "connected_mailboxes" ADD COLUMN IF NOT EXISTS "user_id" text;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "mailbox_user_idx" ON "connected_mailboxes" USING btree ("user_id");
--> statement-breakpoint
UPDATE "connected_mailboxes" cm
SET "user_id" = au."id"
FROM "auth_user" au
WHERE lower(cm."email_address") = lower(au."email")
  AND cm."user_id" IS NULL;
