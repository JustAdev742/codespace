CREATE TABLE "studio_drafts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"rarity" text NOT NULL,
	"art" jsonb NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"item_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "studio_drafts_status_valid" CHECK ("studio_drafts"."status" in ('draft','published'))
);
--> statement-breakpoint
ALTER TABLE "studio_drafts" ADD CONSTRAINT "studio_drafts_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "studio_drafts" ADD CONSTRAINT "studio_drafts_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "studio_drafts_status_idx" ON "studio_drafts" USING btree ("status","updated_at");