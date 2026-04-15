-- S2 + I6: email verification + sign-in lockout.
-- Two additive tables, no existing rows touched.

CREATE TABLE "email_verification_tokens" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"requested_ip" text,
	"requested_user_agent" text
);
--> statement-breakpoint
ALTER TABLE "email_verification_tokens" ADD CONSTRAINT "email_verification_tokens_user_id_auth_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "email_verification_tokens_token_hash_idx" ON "email_verification_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "email_verification_tokens_user_id_idx" ON "email_verification_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "email_verification_tokens_expires_at_idx" ON "email_verification_tokens" USING btree ("expires_at");--> statement-breakpoint

CREATE TABLE "failed_signin_attempts" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier_hash" text NOT NULL,
	"ip" text,
	"attempted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "failed_signin_attempts_identifier_idx" ON "failed_signin_attempts" USING btree ("identifier_hash");--> statement-breakpoint
CREATE INDEX "failed_signin_attempts_attempted_at_idx" ON "failed_signin_attempts" USING btree ("attempted_at");
