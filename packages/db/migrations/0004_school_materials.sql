CREATE TABLE IF NOT EXISTS "user_materials" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "kind" text NOT NULL,
  "title" text NOT NULL,
  "filename" text,
  "url" text,
  "text" text NOT NULL,
  "char_count" integer NOT NULL,
  "status" text DEFAULT 'ok' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "user_materials_user_idx" ON "user_materials" ("user_id");
CREATE TABLE IF NOT EXISTS "draft_generations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "type_id" uuid NOT NULL REFERENCES "material_types"("id"),
  "model" text,
  "char_count" integer DEFAULT 0 NOT NULL,
  "usage" jsonb,
  "cost_usd" numeric(10, 5),
  "error" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "draft_generations_user_idx" ON "draft_generations" ("user_id", "created_at");
