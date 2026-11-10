CREATE TABLE "mistakes" (
	"user_id" uuid NOT NULL,
	"set_id" uuid NOT NULL,
	"question_id" text NOT NULL,
	"misses" integer DEFAULT 1 NOT NULL,
	"right_days" integer DEFAULT 0 NOT NULL,
	"last_right_day" date,
	"first_missed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_missed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mistakes_user_id_set_id_question_id_pk" PRIMARY KEY("user_id","set_id","question_id"),
	CONSTRAINT "mistakes_right_days_valid" CHECK ("mistakes"."right_days" >= 0 and "mistakes"."right_days" < 2)
);
--> statement-breakpoint
CREATE TABLE "practice_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"day" date NOT NULL,
	"room_code" text NOT NULL,
	"set_id" uuid,
	"mode_id" text NOT NULL,
	"questions" jsonb,
	"game_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "practice_runs_kind_valid" CHECK ("practice_runs"."kind" in ('mistakes','daily'))
);
--> statement-breakpoint
CREATE TABLE "player_extras" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"link" text,
	"actor_id" uuid,
	"dedupe_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"read_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "quest_swaps" (
	"user_id" uuid NOT NULL,
	"day" date NOT NULL,
	"old_quest_id" text NOT NULL,
	"new_quest_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "quest_swaps_user_id_day_pk" PRIMARY KEY("user_id","day")
);
--> statement-breakpoint
ALTER TABLE "mistakes" ADD CONSTRAINT "mistakes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mistakes" ADD CONSTRAINT "mistakes_set_id_question_sets_id_fk" FOREIGN KEY ("set_id") REFERENCES "public"."question_sets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practice_runs" ADD CONSTRAINT "practice_runs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practice_runs" ADD CONSTRAINT "practice_runs_set_id_question_sets_id_fk" FOREIGN KEY ("set_id") REFERENCES "public"."question_sets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_extras" ADD CONSTRAINT "player_extras_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quest_swaps" ADD CONSTRAINT "quest_swaps_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "mistakes_user_idx" ON "mistakes" USING btree ("user_id","last_missed_at");--> statement-breakpoint
CREATE INDEX "practice_runs_room_idx" ON "practice_runs" USING btree ("room_code","created_at");--> statement-breakpoint
CREATE INDEX "practice_runs_user_idx" ON "practice_runs" USING btree ("user_id","kind","day");--> statement-breakpoint
CREATE INDEX "notifications_user_idx" ON "notifications" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "notifications_dedupe_uq" ON "notifications" USING btree ("user_id","dedupe_key");
