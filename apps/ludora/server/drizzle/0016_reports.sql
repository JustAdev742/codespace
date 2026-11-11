ALTER TABLE "answer_events" ADD COLUMN "given" text;--> statement-breakpoint
ALTER TABLE "game_sessions" ADD COLUMN "teams" jsonb;--> statement-breakpoint
CREATE TABLE "report_notes" (
	"game_id" uuid NOT NULL,
	"author_id" uuid NOT NULL,
	"body" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "report_notes_game_id_author_id_pk" PRIMARY KEY("game_id","author_id")
);
--> statement-breakpoint
CREATE TABLE "report_settings" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"retention_months" integer,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "report_settings_retention_valid" CHECK ("report_settings"."retention_months" is null or "report_settings"."retention_months" in (3, 6, 12, 24))
);
--> statement-breakpoint
ALTER TABLE "report_notes" ADD CONSTRAINT "report_notes_game_id_game_sessions_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."game_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_notes" ADD CONSTRAINT "report_notes_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_settings" ADD CONSTRAINT "report_settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "report_notes_author_idx" ON "report_notes" USING btree ("author_id");
