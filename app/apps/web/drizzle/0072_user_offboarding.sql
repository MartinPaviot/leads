-- SOC2 T5/T7 — user offboarding + session revocation on password change.
-- users.deactivated_at: set => member can no longer authenticate (reversible).
-- auth_user.password_changed_at: JWTs issued before this are rejected.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "deactivated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "auth_user" ADD COLUMN IF NOT EXISTS "password_changed_at" timestamp;
