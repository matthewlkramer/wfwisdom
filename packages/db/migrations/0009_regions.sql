ALTER TABLE "items" ADD COLUMN IF NOT EXISTS "regions" text[] DEFAULT '{}'::text[] NOT NULL;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "resource_regions" text[] DEFAULT '{}'::text[] NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "items_regions_idx" ON "items" USING GIN ("regions");
--> statement-breakpoint
-- Fill in what is already indexed from the audience taxa Connected carries, which is where the indexer
-- reads them from now on (packages/shared/src/region.ts). No model is involved: every region-specific
-- title in the library ([MN], [MA], [CA], [NJ], [PA]) already carries the matching audience.
-- Rerunnable: it recomputes the whole array from the audiences rather than adding to it.
UPDATE "items" SET "regions" = COALESCE((
  SELECT array_agg(m.key ORDER BY m.key)
    FROM (VALUES
      ('co','Colorado'), ('dc','Washington DC'), ('ma','Massachusetts'), ('mn','Minnesota'),
      ('nj','New Jersey'), ('nca','Northern California'), ('ny','New York'),
      ('pa','Pennsylvania'), ('pr','Puerto Rico')
    ) AS m(key, audience)
   WHERE "items"."audiences" ? m.audience
), '{}'::text[]);
