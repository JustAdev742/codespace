CREATE TABLE "achievements" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"metric" text NOT NULL,
	"target" integer NOT NULL,
	"reward" jsonb NOT NULL,
	"tier" integer DEFAULT 1 NOT NULL,
	"hue" integer DEFAULT 42 NOT NULL,
	"secret" boolean DEFAULT false NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "answer_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"game_id" uuid NOT NULL,
	"user_id" uuid,
	"player_key" text NOT NULL,
	"set_id" uuid,
	"question_id" text NOT NULL,
	"correct" boolean NOT NULL,
	"partial" real NOT NULL,
	"response_ms" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"class_id" uuid NOT NULL,
	"set_id" uuid NOT NULL,
	"mode_id" text NOT NULL,
	"variant_id" text,
	"title" text NOT NULL,
	"instructions" text DEFAULT '' NOT NULL,
	"due_at" timestamp with time zone,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"actor_id" uuid,
	"actor_name" text NOT NULL,
	"actor_roles" text[] NOT NULL,
	"action" text NOT NULL,
	"target_type" text,
	"target_id" text,
	"target_name" text,
	"reason" text,
	"before" jsonb,
	"after" jsonb,
	"ip_hash" text,
	"environment" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "blocks" (
	"blocker_id" uuid NOT NULL,
	"blocked_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "blocks_blocker_id_blocked_id_pk" PRIMARY KEY("blocker_id","blocked_id")
);
--> statement-breakpoint
CREATE TABLE "class_members" (
	"class_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" text DEFAULT 'student' NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "class_members_class_id_user_id_pk" PRIMARY KEY("class_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "classes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"name" text NOT NULL,
	"join_code" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "collections" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"hue" integer NOT NULL,
	"reward" jsonb,
	"release_state" text DEFAULT 'live' NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "currencies" (
	"code" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"kind" text NOT NULL,
	"hue" integer NOT NULL,
	"how_to_earn" text NOT NULL,
	"how_to_spend" text NOT NULL,
	"expires_at" timestamp with time zone,
	"active" boolean DEFAULT true NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "economy_config" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid
);
--> statement-breakpoint
CREATE TABLE "economy_ops" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"idem_key" text NOT NULL,
	"kind" text NOT NULL,
	"result" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "entitlements" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"granted_by" uuid,
	"reason" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "equipped" (
	"user_id" uuid NOT NULL,
	"slot" text NOT NULL,
	"item_id" text NOT NULL,
	CONSTRAINT "equipped_user_id_slot_pk" PRIMARY KEY("user_id","slot")
);
--> statement-breakpoint
CREATE TABLE "error_reports" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"source" text NOT NULL,
	"message" text NOT NULL,
	"stack" text,
	"context" jsonb,
	"user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "feature_flags" (
	"key" text PRIMARY KEY NOT NULL,
	"description" text NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"rollout_percent" integer DEFAULT 0 NOT NULL,
	"roles" text[] DEFAULT '{}'::text[] NOT NULL,
	"user_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid
);
--> statement-breakpoint
CREATE TABLE "friendships" (
	"user_a" uuid NOT NULL,
	"user_b" uuid NOT NULL,
	"status" text NOT NULL,
	"requested_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"accepted_at" timestamp with time zone,
	CONSTRAINT "friendships_user_a_user_b_pk" PRIMARY KEY("user_a","user_b"),
	CONSTRAINT "friendships_ordered" CHECK ("friendships"."user_a" < "friendships"."user_b")
);
--> statement-breakpoint
CREATE TABLE "game_participants" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"game_id" uuid NOT NULL,
	"user_id" uuid,
	"player_key" text NOT NULL,
	"display_name" text NOT NULL,
	"is_guest" boolean NOT NULL,
	"is_bot" boolean NOT NULL,
	"team_id" text,
	"rank" integer NOT NULL,
	"score" bigint NOT NULL,
	"label" text NOT NULL,
	"answered" integer NOT NULL,
	"correct" integer NOT NULL,
	"avg_response_ms" integer NOT NULL,
	"best_streak" integer NOT NULL,
	"left_early" boolean DEFAULT false NOT NULL,
	"rewards" jsonb
);
--> statement-breakpoint
CREATE TABLE "game_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"room_code" text NOT NULL,
	"mode_id" text NOT NULL,
	"variant_id" text,
	"host_user_id" uuid,
	"set_id" uuid,
	"set_title" text NOT NULL,
	"settings" jsonb NOT NULL,
	"common" jsonb NOT NULL,
	"status" text NOT NULL,
	"ended_by" text NOT NULL,
	"player_count" integer NOT NULL,
	"summary" text DEFAULT '' NOT NULL,
	"class_id" uuid,
	"assignment_id" uuid,
	"is_solo" boolean DEFAULT false NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone NOT NULL,
	"duration_ms" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inventory" (
	"user_id" uuid NOT NULL,
	"item_id" text NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"first_acquired_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_acquired_at" timestamp with time zone DEFAULT now() NOT NULL,
	"source" text NOT NULL,
	CONSTRAINT "inventory_user_id_item_id_pk" PRIMARY KEY("user_id","item_id"),
	CONSTRAINT "inventory_quantity_nonneg" CHECK ("inventory"."quantity" >= 0)
);
--> statement-breakpoint
CREATE TABLE "items" (
	"id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"rarity" text NOT NULL,
	"collection_id" text,
	"art" jsonb NOT NULL,
	"release_state" text DEFAULT 'live' NOT NULL,
	"is_test_only" boolean DEFAULT false NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ledger_entries" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"currency" text NOT NULL,
	"delta" bigint NOT NULL,
	"balance_after" bigint NOT NULL,
	"reason" text NOT NULL,
	"ref_type" text,
	"ref_id" text,
	"op_id" bigint,
	"actor_id" uuid,
	"unlimited" boolean DEFAULT false NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ledger_balance_after_nonneg" CHECK ("ledger_entries"."balance_after" >= 0)
);
--> statement-breakpoint
CREATE TABLE "mode_overrides" (
	"id" text PRIMARY KEY NOT NULL,
	"visibility" text NOT NULL,
	"note" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid
);
--> statement-breakpoint
CREATE TABLE "moderation_actions" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"target_user_id" uuid NOT NULL,
	"actor_id" uuid,
	"action" text NOT NULL,
	"reason" text NOT NULL,
	"until" timestamp with time zone,
	"report_id" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "outbox_emails" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"to_address" text NOT NULL,
	"subject" text NOT NULL,
	"body" text NOT NULL,
	"provider" text NOT NULL,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pack_openings" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"pack_id" text NOT NULL,
	"op_id" bigint NOT NULL,
	"item_id" text NOT NULL,
	"rarity" text NOT NULL,
	"duplicate" boolean NOT NULL,
	"pity" boolean DEFAULT false NOT NULL,
	"unlimited" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "packs" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"art" jsonb NOT NULL,
	"price_currency" text NOT NULL,
	"price_amount" integer NOT NULL,
	"drop_table" jsonb NOT NULL,
	"release_state" text DEFAULT 'live' NOT NULL,
	"available_from" timestamp with time zone,
	"available_until" timestamp with time zone,
	"sort" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pity_counters" (
	"user_id" uuid NOT NULL,
	"pack_id" text NOT NULL,
	"since_epic" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "pity_counters_user_id_pack_id_pk" PRIMARY KEY("user_id","pack_id")
);
--> statement-breakpoint
CREATE TABLE "purchases" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"listing_id" text NOT NULL,
	"op_id" bigint NOT NULL,
	"price_currency" text NOT NULL,
	"price_amount" integer NOT NULL,
	"unlimited" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "question_sets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"subject" text NOT NULL,
	"grade_band" text,
	"language" text DEFAULT 'en' NOT NULL,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"visibility" text DEFAULT 'private' NOT NULL,
	"cover" jsonb,
	"questions" jsonb NOT NULL,
	"question_count" integer NOT NULL,
	"is_official" boolean DEFAULT false NOT NULL,
	"is_featured" boolean DEFAULT false NOT NULL,
	"hidden_at" timestamp with time zone,
	"hidden_reason" text,
	"plays" integer DEFAULT 0 NOT NULL,
	"seed_key" text,
	"search" "tsvector" GENERATED ALWAYS AS (to_tsvector('simple', coalesce(title,'') || ' ' || coalesce(description,'') || ' ' || coalesce(subject,''))) STORED,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sets_visibility_valid" CHECK ("question_sets"."visibility" in ('private','unlisted','public'))
);
--> statement-breakpoint
CREATE TABLE "quests" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"metric" text NOT NULL,
	"target" integer NOT NULL,
	"reward" jsonb NOT NULL,
	"weight" integer DEFAULT 1 NOT NULL,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reports" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"reporter_id" uuid,
	"target_type" text NOT NULL,
	"target_id" text NOT NULL,
	"reason" text NOT NULL,
	"details" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"resolved_by" uuid,
	"resolution" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip_hash" text,
	"user_agent" text,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "shop_listings" (
	"id" text PRIMARY KEY NOT NULL,
	"section" text NOT NULL,
	"item_id" text,
	"pack_id" text,
	"bundle" jsonb,
	"title" text,
	"description" text,
	"price_currency" text NOT NULL,
	"price_amount" integer NOT NULL,
	"worth" integer,
	"per_user_limit" integer,
	"rotation" text,
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"active" boolean DEFAULT true NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "listings_price_nonneg" CHECK ("shop_listings"."price_amount" >= 0),
	CONSTRAINT "listings_target" CHECK (num_nonnulls("shop_listings"."item_id", "shop_listings"."pack_id", "shop_listings"."bundle") = 1)
);
--> statement-breakpoint
CREATE TABLE "user_achievements" (
	"user_id" uuid NOT NULL,
	"achievement_id" text NOT NULL,
	"unlocked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"claimed_at" timestamp with time zone,
	CONSTRAINT "user_achievements_user_id_achievement_id_pk" PRIMARY KEY("user_id","achievement_id")
);
--> statement-breakpoint
CREATE TABLE "user_quests" (
	"user_id" uuid NOT NULL,
	"quest_id" text NOT NULL,
	"period" text NOT NULL,
	"progress" integer DEFAULT 0 NOT NULL,
	"target" integer NOT NULL,
	"completed_at" timestamp with time zone,
	"claimed_at" timestamp with time zone,
	CONSTRAINT "user_quests_user_id_quest_id_period_pk" PRIMARY KEY("user_id","quest_id","period")
);
--> statement-breakpoint
CREATE TABLE "user_roles" (
	"user_id" uuid NOT NULL,
	"role" text NOT NULL,
	"granted_by" uuid,
	"reason" text,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_roles_user_id_role_pk" PRIMARY KEY("user_id","role")
);
--> statement-breakpoint
CREATE TABLE "user_stats" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"games_played" integer DEFAULT 0 NOT NULL,
	"games_won" integer DEFAULT 0 NOT NULL,
	"podiums" integer DEFAULT 0 NOT NULL,
	"games_hosted" integer DEFAULT 0 NOT NULL,
	"questions_answered" integer DEFAULT 0 NOT NULL,
	"questions_correct" integer DEFAULT 0 NOT NULL,
	"best_streak" integer DEFAULT 0 NOT NULL,
	"total_response_ms" bigint DEFAULT 0 NOT NULL,
	"modes_played" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"packs_opened" integer DEFAULT 0 NOT NULL,
	"daily_streak" integer DEFAULT 0 NOT NULL,
	"longest_daily_streak" integer DEFAULT 0 NOT NULL,
	"last_play_day" date,
	"sparks_today" integer DEFAULT 0 NOT NULL,
	"sparks_day" date,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"username" text,
	"display_name" text NOT NULL,
	"password_hash" text,
	"is_guest" boolean DEFAULT false NOT NULL,
	"account_type" text DEFAULT 'player' NOT NULL,
	"age_band" text,
	"email" text,
	"email_verified_at" timestamp with time zone,
	"friend_code" text NOT NULL,
	"is_test_account" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"suspended_until" timestamp with time zone,
	"muted_until" timestamp with time zone,
	"failed_logins" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	"recovery_code_hash" text,
	"xp" bigint DEFAULT 0 NOT NULL,
	"level" integer DEFAULT 1 NOT NULL,
	"preferences" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"name_changed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone,
	CONSTRAINT "users_xp_nonneg" CHECK ("users"."xp" >= 0),
	CONSTRAINT "users_status_valid" CHECK ("users"."status" in ('active','suspended','banned')),
	CONSTRAINT "users_account_type_valid" CHECK ("users"."account_type" in ('player','student','teacher'))
);
--> statement-breakpoint
CREATE TABLE "wallets" (
	"user_id" uuid NOT NULL,
	"currency" text NOT NULL,
	"balance" bigint DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "wallets_user_id_currency_pk" PRIMARY KEY("user_id","currency"),
	CONSTRAINT "wallets_balance_nonneg" CHECK ("wallets"."balance" >= 0)
);
--> statement-breakpoint
ALTER TABLE "answer_events" ADD CONSTRAINT "answer_events_game_id_game_sessions_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."game_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "answer_events" ADD CONSTRAINT "answer_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_set_id_question_sets_id_fk" FOREIGN KEY ("set_id") REFERENCES "public"."question_sets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blocks" ADD CONSTRAINT "blocks_blocker_id_users_id_fk" FOREIGN KEY ("blocker_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blocks" ADD CONSTRAINT "blocks_blocked_id_users_id_fk" FOREIGN KEY ("blocked_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_members" ADD CONSTRAINT "class_members_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_members" ADD CONSTRAINT "class_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "classes" ADD CONSTRAINT "classes_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "economy_config" ADD CONSTRAINT "economy_config_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "economy_ops" ADD CONSTRAINT "economy_ops_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entitlements" ADD CONSTRAINT "entitlements_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entitlements" ADD CONSTRAINT "entitlements_granted_by_users_id_fk" FOREIGN KEY ("granted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "equipped" ADD CONSTRAINT "equipped_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "equipped" ADD CONSTRAINT "equipped_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "error_reports" ADD CONSTRAINT "error_reports_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feature_flags" ADD CONSTRAINT "feature_flags_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "friendships" ADD CONSTRAINT "friendships_user_a_users_id_fk" FOREIGN KEY ("user_a") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "friendships" ADD CONSTRAINT "friendships_user_b_users_id_fk" FOREIGN KEY ("user_b") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_participants" ADD CONSTRAINT "game_participants_game_id_game_sessions_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."game_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_participants" ADD CONSTRAINT "game_participants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_sessions" ADD CONSTRAINT "game_sessions_host_user_id_users_id_fk" FOREIGN KEY ("host_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_sessions" ADD CONSTRAINT "game_sessions_set_id_question_sets_id_fk" FOREIGN KEY ("set_id") REFERENCES "public"."question_sets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory" ADD CONSTRAINT "inventory_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory" ADD CONSTRAINT "inventory_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_collection_id_collections_id_fk" FOREIGN KEY ("collection_id") REFERENCES "public"."collections"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mode_overrides" ADD CONSTRAINT "mode_overrides_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moderation_actions" ADD CONSTRAINT "moderation_actions_target_user_id_users_id_fk" FOREIGN KEY ("target_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moderation_actions" ADD CONSTRAINT "moderation_actions_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pack_openings" ADD CONSTRAINT "pack_openings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pack_openings" ADD CONSTRAINT "pack_openings_pack_id_packs_id_fk" FOREIGN KEY ("pack_id") REFERENCES "public"."packs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "packs" ADD CONSTRAINT "packs_price_currency_currencies_code_fk" FOREIGN KEY ("price_currency") REFERENCES "public"."currencies"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pity_counters" ADD CONSTRAINT "pity_counters_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pity_counters" ADD CONSTRAINT "pity_counters_pack_id_packs_id_fk" FOREIGN KEY ("pack_id") REFERENCES "public"."packs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_sets" ADD CONSTRAINT "question_sets_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_reporter_id_users_id_fk" FOREIGN KEY ("reporter_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_resolved_by_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_listings" ADD CONSTRAINT "shop_listings_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_listings" ADD CONSTRAINT "shop_listings_pack_id_packs_id_fk" FOREIGN KEY ("pack_id") REFERENCES "public"."packs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_listings" ADD CONSTRAINT "shop_listings_price_currency_currencies_code_fk" FOREIGN KEY ("price_currency") REFERENCES "public"."currencies"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_achievements" ADD CONSTRAINT "user_achievements_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_achievements" ADD CONSTRAINT "user_achievements_achievement_id_achievements_id_fk" FOREIGN KEY ("achievement_id") REFERENCES "public"."achievements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_quests" ADD CONSTRAINT "user_quests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_quests" ADD CONSTRAINT "user_quests_quest_id_quests_id_fk" FOREIGN KEY ("quest_id") REFERENCES "public"."quests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_granted_by_users_id_fk" FOREIGN KEY ("granted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_stats" ADD CONSTRAINT "user_stats_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_currency_currencies_code_fk" FOREIGN KEY ("currency") REFERENCES "public"."currencies"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "answers_game_idx" ON "answer_events" USING btree ("game_id");--> statement-breakpoint
CREATE INDEX "answers_user_idx" ON "answer_events" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "answers_set_question_idx" ON "answer_events" USING btree ("set_id","question_id");--> statement-breakpoint
CREATE INDEX "assignments_class_idx" ON "assignments" USING btree ("class_id");--> statement-breakpoint
CREATE INDEX "audit_created_idx" ON "audit_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "audit_actor_idx" ON "audit_log" USING btree ("actor_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_target_idx" ON "audit_log" USING btree ("target_type","target_id");--> statement-breakpoint
CREATE INDEX "audit_action_idx" ON "audit_log" USING btree ("action","created_at");--> statement-breakpoint
CREATE INDEX "class_members_user_idx" ON "class_members" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "classes_join_code_uq" ON "classes" USING btree ("join_code");--> statement-breakpoint
CREATE INDEX "classes_owner_idx" ON "classes" USING btree ("owner_id");--> statement-breakpoint
CREATE UNIQUE INDEX "economy_ops_user_key_uq" ON "economy_ops" USING btree ("user_id","idem_key");--> statement-breakpoint
CREATE INDEX "entitlements_user_idx" ON "entitlements" USING btree ("user_id","kind");--> statement-breakpoint
CREATE INDEX "errors_created_idx" ON "error_reports" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "friendships_b_idx" ON "friendships" USING btree ("user_b");--> statement-breakpoint
CREATE INDEX "participants_game_idx" ON "game_participants" USING btree ("game_id");--> statement-breakpoint
CREATE INDEX "participants_user_idx" ON "game_participants" USING btree ("user_id","game_id");--> statement-breakpoint
CREATE INDEX "games_host_idx" ON "game_sessions" USING btree ("host_user_id","ended_at");--> statement-breakpoint
CREATE INDEX "games_ended_idx" ON "game_sessions" USING btree ("ended_at");--> statement-breakpoint
CREATE INDEX "games_class_idx" ON "game_sessions" USING btree ("class_id");--> statement-breakpoint
CREATE INDEX "items_type_idx" ON "items" USING btree ("type","rarity");--> statement-breakpoint
CREATE INDEX "items_collection_idx" ON "items" USING btree ("collection_id");--> statement-breakpoint
CREATE INDEX "ledger_user_idx" ON "ledger_entries" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "ledger_reason_idx" ON "ledger_entries" USING btree ("reason","created_at");--> statement-breakpoint
CREATE INDEX "moderation_target_idx" ON "moderation_actions" USING btree ("target_user_id","created_at");--> statement-breakpoint
CREATE INDEX "pack_openings_user_idx" ON "pack_openings" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "purchases_user_listing_idx" ON "purchases" USING btree ("user_id","listing_id");--> statement-breakpoint
CREATE INDEX "sets_owner_idx" ON "question_sets" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "sets_public_idx" ON "question_sets" USING btree ("visibility","subject");--> statement-breakpoint
CREATE INDEX "sets_search_idx" ON "question_sets" USING gin ("search");--> statement-breakpoint
CREATE UNIQUE INDEX "sets_seed_key_uq" ON "question_sets" USING btree ("seed_key");--> statement-breakpoint
CREATE INDEX "reports_status_idx" ON "reports" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "reports_target_idx" ON "reports" USING btree ("target_type","target_id");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_expires_idx" ON "sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "listings_section_idx" ON "shop_listings" USING btree ("section","active");--> statement-breakpoint
CREATE INDEX "user_roles_role_idx" ON "user_roles" USING btree ("role");--> statement-breakpoint
CREATE UNIQUE INDEX "users_username_uq" ON "users" USING btree ("username");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_uq" ON "users" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "users_friend_code_uq" ON "users" USING btree ("friend_code");--> statement-breakpoint
CREATE INDEX "users_created_idx" ON "users" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "users_guest_seen_idx" ON "users" USING btree ("is_guest","last_seen_at");