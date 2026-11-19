-- D58: the economy manager role, sales, refunds and class rewards.
-- Every change adds nullable columns, a column with a constant default, or a new table, so it is
-- quick on a live database and leaves existing rows as they were. The new CHECK only constrains the
-- new sale columns, which are null on every existing row, so it validates at once.
ALTER TABLE "shop_listings" ADD COLUMN IF NOT EXISTS "sale_price" integer;--> statement-breakpoint
ALTER TABLE "shop_listings" ADD COLUMN IF NOT EXISTS "sale_starts_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "shop_listings" ADD COLUMN IF NOT EXISTS "sale_ends_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "shop_listings" ADD COLUMN IF NOT EXISTS "featured" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "shop_listings" ADD CONSTRAINT "listings_sale_valid" CHECK ("shop_listings"."sale_price" is null or ("shop_listings"."sale_price" >= 0 and "shop_listings"."sale_starts_at" is not null and "shop_listings"."sale_ends_at" is not null and "shop_listings"."sale_starts_at" < "shop_listings"."sale_ends_at"));--> statement-breakpoint
ALTER TABLE "purchases" ADD COLUMN IF NOT EXISTS "refunded_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "purchases" ADD COLUMN IF NOT EXISTS "refunded_by" uuid;--> statement-breakpoint
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_refunded_by_users_id_fk" FOREIGN KEY ("refunded_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "class_rewards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"class_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"teacher_id" uuid,
	"teacher_name" text NOT NULL,
	"amount" integer NOT NULL,
	"note" text NOT NULL,
	"batch_id" uuid NOT NULL,
	"whole_class" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "class_rewards_amount_positive" CHECK ("class_rewards"."amount" > 0)
);--> statement-breakpoint
ALTER TABLE "class_rewards" ADD CONSTRAINT "class_rewards_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_rewards" ADD CONSTRAINT "class_rewards_student_id_users_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_rewards" ADD CONSTRAINT "class_rewards_teacher_id_users_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "class_rewards_class_idx" ON "class_rewards" USING btree ("class_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "class_rewards_student_idx" ON "class_rewards" USING btree ("student_id","created_at");
