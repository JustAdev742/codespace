CREATE TABLE "houses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"hue" integer NOT NULL,
	"emblem" text NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	CONSTRAINT "houses_hue_valid" CHECK ("houses"."hue" >= 0 and "houses"."hue" < 360)
);
--> statement-breakpoint
CREATE TABLE "house_members" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"house_id" uuid NOT NULL,
	"set_by" uuid,
	"chosen" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"welcomed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "house_points" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"house_id" uuid NOT NULL,
	"user_id" uuid,
	"points" integer NOT NULL,
	"reason" text NOT NULL,
	"source_id" text NOT NULL,
	"year_group" integer,
	"day" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "house_points_reason_valid" CHECK ("house_points"."reason" in ('game','assignment','merit')),
	CONSTRAINT "house_points_positive" CHECK ("house_points"."points" > 0)
);
--> statement-breakpoint
CREATE TABLE "house_cups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"starts_on" date NOT NULL,
	"ends_on" date NOT NULL,
	"totals" jsonb,
	"winner_name" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone,
	CONSTRAINT "house_cups_dates_valid" CHECK ("house_cups"."starts_on" <= "house_cups"."ends_on")
);
--> statement-breakpoint
CREATE TABLE "merits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_id" uuid NOT NULL,
	"teacher_id" uuid,
	"teacher_name" text NOT NULL,
	"value" text NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"day" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "school_notices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"audience" text NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "school_notices_audience_valid" CHECK ("school_notices"."audience" in ('students','teachers','everyone'))
);
--> statement-breakpoint
CREATE TABLE "school_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"message" text DEFAULT '' NOT NULL,
	"decor" text NOT NULL,
	"hue" integer NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "student_sport_days" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"days" integer[] NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "class_sport_days" (
	"class_id" uuid PRIMARY KEY NOT NULL,
	"days" integer[] NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tournaments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"name" text NOT NULL,
	"format" text NOT NULL,
	"entrants" jsonb NOT NULL,
	"winner_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	CONSTRAINT "tournaments_format_valid" CHECK ("tournaments"."format" in ('knockout','round_robin'))
);
--> statement-breakpoint
CREATE TABLE "tournament_matches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tournament_id" uuid NOT NULL,
	"round" integer NOT NULL,
	"slot" integer NOT NULL,
	"a" integer,
	"b" integer,
	"winner" integer,
	"a_score" integer,
	"b_score" integer,
	"game_id" uuid,
	"played_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "class_challenges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_by" uuid NOT NULL,
	"class_a" uuid NOT NULL,
	"class_b" uuid NOT NULL,
	"set_id" uuid NOT NULL,
	"mode_id" text NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"assignment_a" uuid,
	"assignment_b" uuid,
	"accepted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "house_members" ADD CONSTRAINT "house_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "house_members" ADD CONSTRAINT "house_members_house_id_houses_id_fk" FOREIGN KEY ("house_id") REFERENCES "public"."houses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "house_members" ADD CONSTRAINT "house_members_set_by_users_id_fk" FOREIGN KEY ("set_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "house_points" ADD CONSTRAINT "house_points_house_id_houses_id_fk" FOREIGN KEY ("house_id") REFERENCES "public"."houses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "house_points" ADD CONSTRAINT "house_points_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "house_cups" ADD CONSTRAINT "house_cups_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merits" ADD CONSTRAINT "merits_student_id_users_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merits" ADD CONSTRAINT "merits_teacher_id_users_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "school_notices" ADD CONSTRAINT "school_notices_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "school_events" ADD CONSTRAINT "school_events_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_sport_days" ADD CONSTRAINT "student_sport_days_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_sport_days" ADD CONSTRAINT "class_sport_days_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournaments" ADD CONSTRAINT "tournaments_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournament_matches" ADD CONSTRAINT "tournament_matches_tournament_id_tournaments_id_fk" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_challenges" ADD CONSTRAINT "class_challenges_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_challenges" ADD CONSTRAINT "class_challenges_class_a_classes_id_fk" FOREIGN KEY ("class_a") REFERENCES "public"."classes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_challenges" ADD CONSTRAINT "class_challenges_class_b_classes_id_fk" FOREIGN KEY ("class_b") REFERENCES "public"."classes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_challenges" ADD CONSTRAINT "class_challenges_set_id_question_sets_id_fk" FOREIGN KEY ("set_id") REFERENCES "public"."question_sets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "house_points_source_uq" ON "house_points" USING btree ("user_id","reason","source_id");--> statement-breakpoint
CREATE INDEX "house_points_day_idx" ON "house_points" USING btree ("day");--> statement-breakpoint
CREATE INDEX "house_points_user_day_idx" ON "house_points" USING btree ("user_id","day");--> statement-breakpoint
CREATE INDEX "house_cups_dates_idx" ON "house_cups" USING btree ("ends_on");--> statement-breakpoint
CREATE INDEX "merits_student_idx" ON "merits" USING btree ("student_id","created_at");--> statement-breakpoint
CREATE INDEX "merits_teacher_day_idx" ON "merits" USING btree ("teacher_id","day");--> statement-breakpoint
CREATE INDEX "school_notices_ends_idx" ON "school_notices" USING btree ("ends_at");--> statement-breakpoint
CREATE INDEX "school_events_ends_idx" ON "school_events" USING btree ("ends_at");--> statement-breakpoint
CREATE INDEX "tournaments_owner_idx" ON "tournaments" USING btree ("owner_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tournament_matches_slot_uq" ON "tournament_matches" USING btree ("tournament_id","round","slot");--> statement-breakpoint
CREATE INDEX "class_challenges_a_idx" ON "class_challenges" USING btree ("class_a");--> statement-breakpoint
CREATE INDEX "class_challenges_b_idx" ON "class_challenges" USING btree ("class_b");
