CREATE TABLE "blueprints" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"name" text NOT NULL,
	"blueprint" jsonb NOT NULL,
	"visibility" text DEFAULT 'private' NOT NULL,
	"hidden_at" timestamp with time zone,
	"plays" integer DEFAULT 0 NOT NULL,
	"copied_from" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "blueprints_visibility_valid" CHECK ("blueprints"."visibility" in ('private','unlisted','public'))
);
--> statement-breakpoint
ALTER TABLE "blueprints" ADD CONSTRAINT "blueprints_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "blueprints_owner_idx" ON "blueprints" USING btree ("owner_id","updated_at");--> statement-breakpoint
CREATE INDEX "blueprints_public_idx" ON "blueprints" USING btree ("visibility","plays");
