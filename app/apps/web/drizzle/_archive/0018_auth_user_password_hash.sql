-- H12 — dedicated bcrypt hash column for the credentials provider.
--
-- Before this migration, credential passwords were stored in
-- auth_account.access_token (a column the NextAuth adapter otherwise
-- uses for OAuth access tokens). That overloading meant a debug
-- query or future OAuth code change could accidentally expose or
-- overwrite a bcrypt hash. The new column keeps password material
-- in its own, clearly-named place on the auth_user row.
--
-- Backfill: populate password_hash for credential users from the
-- provider='credentials' account row. OAuth-only accounts stay NULL.
-- The application reads password_hash first and falls back to
-- auth_account.access_token at sign-in time, so this migration is
-- non-disruptive — it seeds the new column and lets the app take
-- over the slow roll-forward on subsequent logins (at which point
-- the hash will also be re-written under the new bcrypt cost).

ALTER TABLE "auth_user" ADD COLUMN "password_hash" text;

UPDATE "auth_user" u
SET "password_hash" = a."access_token"
FROM "auth_account" a
WHERE a."userId" = u."id"
  AND a."provider" = 'credentials'
  AND a."access_token" IS NOT NULL
  AND u."password_hash" IS NULL;
