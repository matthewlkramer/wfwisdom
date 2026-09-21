-- A title staff can set when the one Connected carries is wrong for the material.
--
-- The indexer writes items.title from Connected on every run, so editing that column is undone the next
-- time the library is indexed. This column is never written by the indexer: it is staff's, and every
-- title a reader sees prefers it over the Connected one. Clearing it falls back to Connected's title.
--
-- The case that prompted it: Spanish translations carrying their English title ("Network Membership
-- Agreement - Spanish", "New School Funding Overview (Spanish)"), which a Spanish-speaking reader has
-- to translate in their head to know what they are looking at.
ALTER TABLE "item_meta" ADD COLUMN IF NOT EXISTS "display_title" text;
