CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor" text,
	"action" text NOT NULL,
	"target" text,
	"detail" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "base_prompt_versions" (
	"version" serial PRIMARY KEY NOT NULL,
	"text" text NOT NULL,
	"note" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_turns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"conversation_id" uuid NOT NULL,
	"question" text NOT NULL,
	"answer" text,
	"citations" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"covered" boolean,
	"model" text,
	"usage" jsonb,
	"cost_usd" numeric(10, 6),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "index_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"triggered_by" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"stats" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"log" text DEFAULT '' NOT NULL,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "item_chunks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"item_id" uuid NOT NULL,
	"ord" integer NOT NULL,
	"text" text NOT NULL,
	"text_hash" text NOT NULL,
	"embedding" real[],
	"model" text
);
--> statement-breakpoint
CREATE TABLE "item_meta" (
	"item_id" uuid PRIMARY KEY NOT NULL,
	"curation" text,
	"hidden" boolean DEFAULT false NOT NULL,
	"dated_label" text,
	"pinned_stage" text,
	"pinned_position" integer,
	"staff_note" text,
	"stages" text[] DEFAULT '{}'::text[] NOT NULL,
	"model_outdated" boolean DEFAULT false NOT NULL,
	"model_outdated_reason" text,
	"review_status" text DEFAULT 'none' NOT NULL,
	"reviewed_by" text,
	"reviewed_at" timestamp with time zone,
	"score" real DEFAULT 0 NOT NULL,
	"score_components" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"score_updated_at" timestamp with time zone,
	"wf_clicks_30d" integer DEFAULT 0 NOT NULL,
	"wf_helpful_yes" integer DEFAULT 0 NOT NULL,
	"wf_helpful_no" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_kind" text NOT NULL,
	"source_id" bigint NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"url" text NOT NULL,
	"author_name" text,
	"published_at" timestamp with time zone,
	"source_updated_at" timestamp with time zone,
	"views" integer DEFAULT 0 NOT NULL,
	"likes" integer DEFAULT 0 NOT NULL,
	"comments" integer DEFAULT 0 NOT NULL,
	"series_titles" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"categories" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"audiences" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"content_type" text,
	"body_text" text,
	"attachments" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"linked_docs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"link_only" boolean DEFAULT false NOT NULL,
	"has_text" boolean DEFAULT false NOT NULL,
	"summary" text,
	"summary_hash" text,
	"indexed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"removed_at" timestamp with time zone,
	"content_hash" text
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"sort" integer DEFAULT 0 NOT NULL,
	"staff_only" boolean DEFAULT false NOT NULL,
	"hidden" boolean DEFAULT false NOT NULL,
	CONSTRAINT "jobs_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "material_type_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"name" text NOT NULL,
	"short_description" text,
	"guide_md" text NOT NULL,
	"rubric" jsonb NOT NULL,
	"reviewer_notes" text NOT NULL,
	"note" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "material_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"short_description" text,
	"job_key" text,
	"sort" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"guide_md" text NOT NULL,
	"rubric" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"reviewer_notes" text DEFAULT '' NOT NULL,
	"model" text,
	"reasoning_effort" text,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text,
	CONSTRAINT "material_types_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "placement_seeds" (
	"id" serial PRIMARY KEY NOT NULL,
	"source_kind" text NOT NULL,
	"source_id" bigint NOT NULL,
	"primary_subjob" text NOT NULL,
	"secondary_subjobs" text[] DEFAULT '{}'::text[] NOT NULL,
	"stages" text[] DEFAULT '{}'::text[] NOT NULL,
	"content_type" text,
	"outdated" boolean DEFAULT false NOT NULL,
	"outdated_reason" text,
	"why" text,
	"applied" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "placements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"item_id" uuid NOT NULL,
	"subjob_id" uuid NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"source" text DEFAULT 'model' NOT NULL,
	"why" text,
	"position" integer
);
--> statement-breakpoint
CREATE TABLE "search_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"query" text NOT NULL,
	"rewritten" text,
	"mode" text,
	"result_count" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text
);
--> statement-breakpoint
CREATE TABLE "signals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"item_id" uuid NOT NULL,
	"user_id" uuid,
	"kind" text NOT NULL,
	"context" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subjobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"sort" integer DEFAULT 0 NOT NULL,
	"stages" text[] DEFAULT '{}'::text[] NOT NULL,
	CONSTRAINT "subjobs_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"type_id" uuid NOT NULL,
	"type_version" integer NOT NULL,
	"base_prompt_version" integer,
	"parent_id" uuid,
	"title" text,
	"source" text NOT NULL,
	"filename" text,
	"draft_text" text NOT NULL,
	"char_count" integer NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"model" text,
	"reasoning_effort" text,
	"review" jsonb,
	"verdict" text,
	"usage" jsonb,
	"cost_usd" numeric(10, 5),
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"emailed_at" timestamp with time zone,
	"contributed" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "type_resource_seeds" (
	"id" serial PRIMARY KEY NOT NULL,
	"type_key" text NOT NULL,
	"source_id" bigint NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "type_resources" (
	"type_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "type_resources_type_id_item_id_pk" PRIMARY KEY("type_id","item_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"google_sub" text NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"role" text DEFAULT 'teacher_leader' NOT NULL,
	"hosted_domain" text,
	"stage" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_login_at" timestamp with time zone,
	CONSTRAINT "users_google_sub_unique" UNIQUE("google_sub"),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "chat_turns" ADD CONSTRAINT "chat_turns_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_chunks" ADD CONSTRAINT "item_chunks_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_meta" ADD CONSTRAINT "item_meta_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_type_versions" ADD CONSTRAINT "material_type_versions_type_id_material_types_id_fk" FOREIGN KEY ("type_id") REFERENCES "public"."material_types"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "placements" ADD CONSTRAINT "placements_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "placements" ADD CONSTRAINT "placements_subjob_id_subjobs_id_fk" FOREIGN KEY ("subjob_id") REFERENCES "public"."subjobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "search_log" ADD CONSTRAINT "search_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signals" ADD CONSTRAINT "signals_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signals" ADD CONSTRAINT "signals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subjobs" ADD CONSTRAINT "subjobs_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_type_id_material_types_id_fk" FOREIGN KEY ("type_id") REFERENCES "public"."material_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "type_resources" ADD CONSTRAINT "type_resources_type_id_material_types_id_fk" FOREIGN KEY ("type_id") REFERENCES "public"."material_types"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "type_resources" ADD CONSTRAINT "type_resources_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "chat_user_idx" ON "chat_turns" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "chat_created_idx" ON "chat_turns" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "chunks_item_idx" ON "item_chunks" USING btree ("item_id");--> statement-breakpoint
CREATE UNIQUE INDEX "items_source_idx" ON "items" USING btree ("source_kind","source_id");--> statement-breakpoint
CREATE UNIQUE INDEX "type_versions_idx" ON "material_type_versions" USING btree ("type_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "placement_seeds_source_idx" ON "placement_seeds" USING btree ("source_kind","source_id");--> statement-breakpoint
CREATE UNIQUE INDEX "placements_item_subjob_idx" ON "placements" USING btree ("item_id","subjob_id");--> statement-breakpoint
CREATE INDEX "placements_subjob_idx" ON "placements" USING btree ("subjob_id");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "signals_item_idx" ON "signals" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "signals_created_idx" ON "signals" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "subjobs_job_idx" ON "subjobs" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "submissions_user_idx" ON "submissions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "submissions_created_idx" ON "submissions" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "type_resource_seeds_idx" ON "type_resource_seeds" USING btree ("type_key","source_id");