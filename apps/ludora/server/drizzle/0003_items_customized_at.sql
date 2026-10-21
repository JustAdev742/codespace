ALTER TABLE "items" ADD COLUMN "customized_at" timestamp with time zone;--> statement-breakpoint
-- Anything changed since it was created may be a staff edit: keep it, never overwrite it with shipped content.
UPDATE "items" SET "customized_at" = "updated_at" WHERE "updated_at" <> "created_at";
