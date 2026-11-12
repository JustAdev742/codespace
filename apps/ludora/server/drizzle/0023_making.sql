CREATE TABLE "making_drafts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"body" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "making_drafts_kind_valid" CHECK ("making_drafts"."kind" in ('quick'))
);
--> statement-breakpoint
CREATE TABLE "making_tool_state" (
	"owner_id" uuid NOT NULL,
	"class_id" uuid NOT NULL,
	"state" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "making_tool_state_owner_id_class_id_pk" PRIMARY KEY("owner_id","class_id")
);
--> statement-breakpoint
CREATE TABLE "making_prefs" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"dismissed" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "making_drafts" ADD CONSTRAINT "making_drafts_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "making_tool_state" ADD CONSTRAINT "making_tool_state_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "making_tool_state" ADD CONSTRAINT "making_tool_state_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "making_prefs" ADD CONSTRAINT "making_prefs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "making_drafts_owner_idx" ON "making_drafts" USING btree ("owner_id","updated_at");
