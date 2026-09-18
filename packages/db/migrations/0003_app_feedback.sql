DO $$ BEGIN
  CREATE TYPE "feedback_category" AS ENUM ('bug', 'question', 'suggestion', 'other');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE "feedback_status" AS ENUM ('open', 'in_progress', 'resolved', 'dismissed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS "app_feedback" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "created_by_user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "category" "feedback_category" NOT NULL,
  "status" "feedback_status" DEFAULT 'open' NOT NULL,
  "message" text NOT NULL,
  "page_url" text,
  "page_path" text,
  "page_title" text,
  "screenshot_data_url" text,
  "context" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "admin_notes" text,
  "resolved_by_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "resolved_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "app_feedback_message_not_blank" CHECK (length(trim("message")) > 0),
  CONSTRAINT "app_feedback_context_size" CHECK (pg_column_size("context") <= 20480),
  CONSTRAINT "app_feedback_screenshot_size" CHECK ("screenshot_data_url" IS NULL OR octet_length("screenshot_data_url") <= 1000000)
);
CREATE INDEX IF NOT EXISTS "app_feedback_status_created_idx" ON "app_feedback" ("status", "created_at");
CREATE INDEX IF NOT EXISTS "app_feedback_creator_created_idx" ON "app_feedback" ("created_by_user_id", "created_at");
