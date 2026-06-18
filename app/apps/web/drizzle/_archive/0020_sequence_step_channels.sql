-- Channel-agnostic sequencer (primitive ③).
-- Additive migration. Existing sequence_steps rows default to step_type='email'
-- and channel_config='{}', so the change is backward-compatible: current
-- sequences keep running unchanged while new LinkedIn / SMS / gift / phone
-- steps can now be persisted with their channel-specific config.

ALTER TABLE "sequence_steps"
  ADD COLUMN "step_type" text NOT NULL DEFAULT 'email';
--> statement-breakpoint
ALTER TABLE "sequence_steps"
  ADD COLUMN "channel_config" jsonb NOT NULL DEFAULT '{}'::jsonb;
--> statement-breakpoint
CREATE INDEX "sequence_steps_step_type_idx"
  ON "sequence_steps" ("sequence_id", "step_type");
