-- SOC2 T4 — TOTP MFA. The table already exists in prod (created out-of-band,
-- empty); IF NOT EXISTS makes this a no-op there and creates it on fresh envs.
CREATE TABLE IF NOT EXISTS "user_mfa_secrets" (
  "id" text PRIMARY KEY,
  "user_id" text NOT NULL,
  "secret" text NOT NULL,
  "backup_codes" text,
  "is_verified" boolean DEFAULT false,
  "created_at" timestamp with time zone DEFAULT now(),
  "last_used_at" timestamp with time zone
);
