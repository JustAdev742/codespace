ALTER TABLE "uploads" DROP CONSTRAINT "uploads_mime_valid";--> statement-breakpoint
ALTER TABLE "uploads" ADD CONSTRAINT "uploads_mime_valid" CHECK ("uploads"."mime" in ('image/png','image/jpeg','image/gif','image/webp','audio/wav'));--> statement-breakpoint
CREATE TABLE "upload_files" (
	"upload_id" text PRIMARY KEY NOT NULL,
	"data" bytea NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "upload_files" ADD CONSTRAINT "upload_files_upload_id_uploads_id_fk" FOREIGN KEY ("upload_id") REFERENCES "public"."uploads"("id") ON DELETE cascade ON UPDATE no action;
