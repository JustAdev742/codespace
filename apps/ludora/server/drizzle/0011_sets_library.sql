ALTER TABLE "question_sets" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "question_sets" ADD COLUMN "folder" text;--> statement-breakpoint
ALTER TABLE "question_sets" ADD COLUMN "topic" text;--> statement-breakpoint
ALTER TABLE "question_sets" ADD COLUMN "share_token" text;--> statement-breakpoint
ALTER TABLE "question_sets" ADD COLUMN "defaults" jsonb;--> statement-breakpoint
CREATE UNIQUE INDEX "sets_share_token_idx" ON "question_sets" USING btree ("share_token");--> statement-breakpoint
CREATE INDEX "sets_deleted_idx" ON "question_sets" USING btree ("owner_id","deleted_at");--> statement-breakpoint
CREATE TABLE "set_versions" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"set_id" uuid NOT NULL,
	"saved_by" uuid,
	"title" text NOT NULL,
	"question_count" integer NOT NULL,
	"snapshot" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "set_favourites" (
	"user_id" uuid NOT NULL,
	"set_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "set_favourites_user_id_set_id_pk" PRIMARY KEY("user_id","set_id")
);
--> statement-breakpoint
CREATE TABLE "set_editors" (
	"set_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"added_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "set_editors_set_id_user_id_pk" PRIMARY KEY("set_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "set_versions" ADD CONSTRAINT "set_versions_set_id_question_sets_id_fk" FOREIGN KEY ("set_id") REFERENCES "public"."question_sets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "set_versions" ADD CONSTRAINT "set_versions_saved_by_users_id_fk" FOREIGN KEY ("saved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "set_favourites" ADD CONSTRAINT "set_favourites_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "set_favourites" ADD CONSTRAINT "set_favourites_set_id_question_sets_id_fk" FOREIGN KEY ("set_id") REFERENCES "public"."question_sets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "set_editors" ADD CONSTRAINT "set_editors_set_id_question_sets_id_fk" FOREIGN KEY ("set_id") REFERENCES "public"."question_sets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "set_editors" ADD CONSTRAINT "set_editors_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "set_editors" ADD CONSTRAINT "set_editors_added_by_users_id_fk" FOREIGN KEY ("added_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "set_versions_set_idx" ON "set_versions" USING btree ("set_id","created_at");--> statement-breakpoint
CREATE INDEX "set_editors_user_idx" ON "set_editors" USING btree ("user_id");
