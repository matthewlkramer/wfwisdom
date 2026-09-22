-- Staff's own author and description, alongside display_title (0011), for the same reason: the indexer
-- writes author_name and description from Connected on every run, so correcting them there is undone by
-- the next index. These columns are staff's and the indexer never touches them.
--
-- The case that prompted them: essays Sep Kamvar wrote are credited to whoever posted them to Connected,
-- with the real authorship demoted to a note in the description ("This essay was originally published by
-- Sep Kamvar") and repeated again as a "By Sep Kamvar" line at the top of the body.
--
-- display_published_at is here for the same reason: a date the material states about itself ("June 2017")
-- rather than the day it was posted to Connected.
--
-- display_description distinguishes three states, which display_title does not need: NULL falls back to
-- Connected's description, an empty string shows none at all, and anything else replaces it.
ALTER TABLE "item_meta" ADD COLUMN IF NOT EXISTS "display_author" text;
--> statement-breakpoint
ALTER TABLE "item_meta" ADD COLUMN IF NOT EXISTS "display_description" text;
--> statement-breakpoint
ALTER TABLE "item_meta" ADD COLUMN IF NOT EXISTS "display_published_at" timestamp with time zone;
