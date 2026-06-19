ALTER TABLE "activities" ADD COLUMN "thread_id" text;--> statement-breakpoint
ALTER TABLE "activities" ADD COLUMN "intent" text[];--> statement-breakpoint
CREATE INDEX "activities_thread_id_idx" ON "activities" ("thread_id");