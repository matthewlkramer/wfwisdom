ALTER TABLE "items" ADD COLUMN IF NOT EXISTS "body_html" text;
ALTER TABLE "items" ADD COLUMN IF NOT EXISTS "child_post_ids" jsonb DEFAULT '[]'::jsonb NOT NULL;
