CREATE TABLE "ai_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"task" text NOT NULL,
	"provider" text,
	"model" text,
	"outcome" text DEFAULT 'pending' NOT NULL,
	"ip_hash" text,
	"input_tokens" integer,
	"output_tokens" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_requests_outcome_valid" CHECK ("ai_requests"."outcome" in ('pending','ok','refused','filtered','failed'))
);
--> statement-breakpoint
CREATE TABLE "ai_failures" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"kind" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_settings" (
	"id" text PRIMARY KEY DEFAULT 'site' NOT NULL,
	"per_account" integer DEFAULT 20 NOT NULL,
	"window_hours" integer DEFAULT 5 NOT NULL,
	"site_daily_cap" integer,
	"disabled_models" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	CONSTRAINT "ai_settings_single_row" CHECK ("ai_settings"."id" = 'site')
);
--> statement-breakpoint
ALTER TABLE "ai_requests" ADD CONSTRAINT "ai_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_settings" ADD CONSTRAINT "ai_settings_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_requests_user_idx" ON "ai_requests" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "ai_requests_created_idx" ON "ai_requests" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "ai_failures_created_idx" ON "ai_failures" USING btree ("created_at");
