-- Take Connected's "SERIES:" prefix off the titles it is already stored on. The indexer strips it from
-- here on (apps/api/src/lib/titles.ts), so this only has to catch what was indexed before that.
-- Matches every casing and both spellings, with or without the space: "SERIES: ", "SERIES:", "Series: ",
-- "SERIE: " on the Spanish material. A title that is nothing but the prefix is left alone.
UPDATE "items"
   SET "title" = btrim(regexp_replace("title", '^(series|serie)\s*:\s*', '', 'i'))
 WHERE "title" ~* '^(series|serie)\s*:'
   AND btrim(regexp_replace("title", '^(series|serie)\s*:\s*', '', 'i')) <> '';
--> statement-breakpoint
-- A roster of people or programs is built as a series so its entries nest inside one card, but it reads
-- as a list rather than as something to work through in order. Those are the series already typed as a
-- directory: the coach, consultant and facilitator rosters. They now carry their own type, so they are
-- labelled "Resource list" and answer to that filter instead of to "Series".
UPDATE "items"
   SET "content_type" = 'resource_list'
 WHERE "content_type" = 'directory'
   AND ("source_kind" = 'series' OR "native_kind" = 'series');
