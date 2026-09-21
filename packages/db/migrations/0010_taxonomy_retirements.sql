-- Staff merged "State-by-state nonprofit formation" into "501c3 status and the group exemption" and it came
-- back empty on the next deploy. The seed inserts every sub-job in seed-taxonomy.json and skips the ones that
-- already exist, so deleting one left nothing for the insert to conflict with and it was recreated.
--
-- A retirement records that a job or sub-job's absence is deliberate. The seed now skips any key listed here,
-- and creating one with the same key again clears its retirement.
CREATE TABLE IF NOT EXISTS "taxonomy_retirements" (
  "kind" text NOT NULL,
  "key" text NOT NULL,
  "retired_at" timestamp with time zone DEFAULT now() NOT NULL,
  "retired_by" text,
  "reason" text,
  CONSTRAINT "taxonomy_retirements_kind" CHECK ("kind" IN ('job', 'subjob')),
  PRIMARY KEY ("kind", "key")
);
