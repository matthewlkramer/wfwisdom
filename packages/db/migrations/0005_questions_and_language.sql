ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "resource_language" text DEFAULT 'all' NOT NULL;

ALTER TABLE "items" ADD COLUMN IF NOT EXISTS "language" text DEFAULT 'unknown' NOT NULL;
CREATE INDEX IF NOT EXISTS "items_language_idx" ON "items" ("language");

ALTER TABLE "chat_turns" ADD COLUMN IF NOT EXISTS "staff_review_requested" boolean DEFAULT false NOT NULL;
ALTER TABLE "chat_turns" ADD COLUMN IF NOT EXISTS "reviewed_by" text;
ALTER TABLE "chat_turns" ADD COLUMN IF NOT EXISTS "reviewed_at" timestamp with time zone;
ALTER TABLE "chat_turns" ADD COLUMN IF NOT EXISTS "share_requested" boolean DEFAULT false NOT NULL;
ALTER TABLE "chat_turns" ADD COLUMN IF NOT EXISTS "share_attribution" text DEFAULT 'anonymous' NOT NULL;
ALTER TABLE "chat_turns" ADD COLUMN IF NOT EXISTS "share_status" text DEFAULT 'none' NOT NULL;
ALTER TABLE "chat_turns" ADD COLUMN IF NOT EXISTS "share_decided_by" text;
ALTER TABLE "chat_turns" ADD COLUMN IF NOT EXISTS "share_decided_at" timestamp with time zone;
CREATE INDEX IF NOT EXISTS "chat_review_idx" ON "chat_turns" ("staff_review_requested", "created_at");
CREATE INDEX IF NOT EXISTS "chat_share_idx" ON "chat_turns" ("share_status", "created_at");

CREATE TABLE IF NOT EXISTS "chat_turn_notes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "turn_id" uuid NOT NULL REFERENCES "chat_turns"("id") ON DELETE CASCADE,
  "author_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "author_name" text NOT NULL,
  "body" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "chat_turn_notes_body_not_blank" CHECK (length(trim("body")) > 0)
);
CREATE INDEX IF NOT EXISTS "chat_turn_notes_turn_idx" ON "chat_turn_notes" ("turn_id", "created_at");

-- Strong-signal language backfill: Connected labels Spanish material in the title or category.
-- The rest is filled in by `pnpm backfill:language`, which runs the same detector as the indexer.
UPDATE "items" SET "language" = 'es'
WHERE "language" = 'unknown'
  AND ("title" ILIKE '%español%' OR "title" ILIKE '%espanol%' OR "title" ILIKE '%spanish%'
       OR "categories"::text ILIKE '%español%' OR "categories"::text ILIKE '%espanol%' OR "categories"::text ILIKE '%spanish%');
