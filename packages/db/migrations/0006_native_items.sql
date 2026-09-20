CREATE SEQUENCE IF NOT EXISTS "native_item_seq" START 1000000000;
ALTER TABLE "items" ADD COLUMN IF NOT EXISTS "native_kind" text;
ALTER TABLE "items" ADD COLUMN IF NOT EXISTS "google_file_id" text;
ALTER TABLE "items" ADD COLUMN IF NOT EXISTS "google_kind" text;
ALTER TABLE "items" ADD COLUMN IF NOT EXISTS "drive_mime" text;
ALTER TABLE "items" ADD COLUMN IF NOT EXISTS "author_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL;
ALTER TABLE "items" ADD COLUMN IF NOT EXISTS "status" text DEFAULT 'published' NOT NULL;
ALTER TABLE "items" ADD COLUMN IF NOT EXISTS "contribution_note" text;
ALTER TABLE "items" ADD COLUMN IF NOT EXISTS "decline_note" text;
ALTER TABLE "items" ADD COLUMN IF NOT EXISTS "material_type_key" text;
ALTER TABLE "items" ADD COLUMN IF NOT EXISTS "child_item_ids" jsonb DEFAULT '[]'::jsonb NOT NULL;
ALTER TABLE "items" ADD COLUMN IF NOT EXISTS "native_modified_at" timestamp with time zone;
ALTER TABLE "items" ADD COLUMN IF NOT EXISTS "body_markdown" text;
CREATE INDEX IF NOT EXISTS "items_status_idx" ON "items" ("status");
CREATE TABLE IF NOT EXISTS "item_versions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "item_id" uuid NOT NULL REFERENCES "items"("id") ON DELETE CASCADE,
  "version" integer NOT NULL,
  "title" text NOT NULL,
  "body_text" text,
  "body_html" text,
  "body_markdown" text,
  "hash" text,
  "source_modified_at" timestamp with time zone,
  "created_by" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "item_versions_item_idx" ON "item_versions" ("item_id", "version");
