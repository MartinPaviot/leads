-- AUTOPILOT-AUTOPAUSE — circuit-breaker audit columns on `sequences`.
-- Additive + idempotent (safe to re-run; apply via db:push on localdev, or the
-- custom runner / DATABASE_URL_OWNER on prod — drizzle journal is frozen at idx 12).
-- A flip to status='paused' is ALREADY effective (sequence-cron joins
-- sequences.status='active'; daily-autopilot enrolls only into 'active'); these
-- columns just record why/who and the human-resume protection.

ALTER TABLE "sequences" ADD COLUMN IF NOT EXISTS "paused_reason" text;
ALTER TABLE "sequences" ADD COLUMN IF NOT EXISTS "paused_by" text;          -- 'autopilot' | userId
ALTER TABLE "sequences" ADD COLUMN IF NOT EXISTS "paused_at" timestamptz;
ALTER TABLE "sequences" ADD COLUMN IF NOT EXISTS "autopilot_protected" boolean NOT NULL DEFAULT false;
