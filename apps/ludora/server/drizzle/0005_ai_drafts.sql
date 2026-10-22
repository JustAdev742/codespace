CREATE TABLE "ai_draft_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"model" text NOT NULL,
	"requested" integer NOT NULL,
	"returned" integer DEFAULT 0 NOT NULL,
	"outcome" text DEFAULT 'pending' NOT NULL,
	"input_tokens" integer,
	"output_tokens" integer,
	CONSTRAINT "ai_draft_requests_outcome_valid" CHECK ("ai_draft_requests"."outcome" in ('pending','ok','refused','failed'))
);
--> statement-breakpoint
ALTER TABLE "ai_draft_requests" ADD CONSTRAINT "ai_draft_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_draft_requests_user_idx" ON "ai_draft_requests" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "ai_draft_requests_created_idx" ON "ai_draft_requests" USING btree ("created_at");