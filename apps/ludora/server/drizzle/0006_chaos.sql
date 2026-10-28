ALTER TABLE "game_sessions" ADD COLUMN "chaos" jsonb;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "chaos_unlocked_at" timestamp with time zone;