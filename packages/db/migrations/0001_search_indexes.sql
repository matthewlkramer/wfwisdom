ALTER TABLE "items" ADD COLUMN IF NOT EXISTS "fts" tsvector GENERATED ALWAYS AS (
  setweight(to_tsvector('english', coalesce("title", '')), 'A') ||
  setweight(to_tsvector('english', coalesce("description", '')), 'B') ||
  setweight(to_tsvector('english', left(coalesce("body_text", ''), 200000)), 'C')
) STORED;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "items_fts_idx" ON "items" USING GIN ("fts");
