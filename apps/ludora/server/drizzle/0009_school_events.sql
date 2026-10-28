CREATE TABLE "class_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"class_id" uuid NOT NULL,
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
ALTER TABLE "classes" ADD COLUMN "school_name" text;--> statement-breakpoint
ALTER TABLE "class_events" ADD CONSTRAINT "class_events_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_events" ADD CONSTRAINT "class_events_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "class_events_class_idx" ON "class_events" USING btree ("class_id","ends_at");