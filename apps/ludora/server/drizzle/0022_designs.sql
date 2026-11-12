CREATE TABLE "designs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"art" jsonb NOT NULL,
	"hidden_at" timestamp with time zone,
	"hidden_reason" text,
	"hidden_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "designs_kind_valid" CHECK ("designs"."kind" in ('glim','accessory'))
);
--> statement-breakpoint
CREATE TABLE "worn_designs" (
	"user_id" uuid NOT NULL,
	"slot" text NOT NULL,
	"design_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "worn_designs_user_id_slot_pk" PRIMARY KEY("user_id","slot")
);
--> statement-breakpoint
ALTER TABLE "designs" ADD CONSTRAINT "designs_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "designs" ADD CONSTRAINT "designs_hidden_by_users_id_fk" FOREIGN KEY ("hidden_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "worn_designs" ADD CONSTRAINT "worn_designs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "worn_designs" ADD CONSTRAINT "worn_designs_design_id_designs_id_fk" FOREIGN KEY ("design_id") REFERENCES "public"."designs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "designs_owner_idx" ON "designs" USING btree ("owner_id","updated_at");--> statement-breakpoint
CREATE INDEX "designs_hidden_idx" ON "designs" USING btree ("hidden_at");
