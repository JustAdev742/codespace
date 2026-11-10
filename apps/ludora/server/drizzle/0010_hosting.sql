ALTER TABLE "game_sessions" ADD COLUMN "options" jsonb;--> statement-breakpoint
ALTER TABLE "classes" ADD COLUMN "host_generated_names" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "classes" ADD COLUMN "host_quiet" boolean DEFAULT false NOT NULL;
