CREATE TABLE "custom_games" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"mode_id" text NOT NULL,
	"variant_id" text,
	"set_id" uuid,
	"settings" jsonb NOT NULL,
	"common" jsonb NOT NULL,
	"options" jsonb NOT NULL,
	"glyph" text NOT NULL,
	"hue" integer NOT NULL,
	"visibility" text DEFAULT 'private' NOT NULL,
	"hidden_at" timestamp with time zone,
	"plays" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "custom_games_visibility_valid" CHECK ("custom_games"."visibility" in ('private','unlisted','public'))
);
--> statement-breakpoint
ALTER TABLE "custom_games" ADD CONSTRAINT "custom_games_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_games" ADD CONSTRAINT "custom_games_set_id_question_sets_id_fk" FOREIGN KEY ("set_id") REFERENCES "public"."question_sets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "custom_games_owner_idx" ON "custom_games" USING btree ("owner_id","updated_at");--> statement-breakpoint
CREATE INDEX "custom_games_public_idx" ON "custom_games" USING btree ("visibility","plays");