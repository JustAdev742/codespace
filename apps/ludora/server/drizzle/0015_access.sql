-- Extra time a teacher gives a student in a class: a percentage of each timed question's limit
-- (0, 25, 50 or 100), applied when the teacher hosts a live game for that class.
ALTER TABLE "class_members" ADD COLUMN "extra_time" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
-- A session started on a shared device ("This is a shared device" at sign-in): a browser-session
-- cookie, and it ends after a short time with no activity instead of lasting 30 days.
ALTER TABLE "sessions" ADD COLUMN "shared" boolean DEFAULT false NOT NULL;
