CREATE TABLE "ai_review_settings" (
	"id" text PRIMARY KEY DEFAULT 'site' NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"model" text,
	"thresholds" jsonb DEFAULT '{"sparks":10000,"moonstones":500}'::jsonb NOT NULL,
	"key_cipher" text,
	"key_hint" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	CONSTRAINT "ai_review_settings_single_row" CHECK ("ai_review_settings"."id" = 'site')
);
--> statement-breakpoint
CREATE TABLE "ai_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" text NOT NULL,
	"request" jsonb NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"source" text,
	"verdict" jsonb,
	"error" text,
	"model" text,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"overridden_by" uuid,
	"override_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"used_at" timestamp with time zone,
	CONSTRAINT "ai_reviews_status_valid" CHECK ("ai_reviews"."status" in ('running','approved','declined','failed','overridden'))
);
--> statement-breakpoint
ALTER TABLE "ai_review_settings" ADD CONSTRAINT "ai_review_settings_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "ai_reviews" ADD CONSTRAINT "ai_reviews_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "ai_reviews" ADD CONSTRAINT "ai_reviews_overridden_by_users_id_fk" FOREIGN KEY ("overridden_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "ai_reviews_actor_idx" ON "ai_reviews" USING btree ("actor_id","created_at");
--> statement-breakpoint
CREATE INDEX "ai_reviews_target_idx" ON "ai_reviews" USING btree ("target_type","target_id");
