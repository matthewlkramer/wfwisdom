ALTER TABLE "items" ADD COLUMN IF NOT EXISTS "imported_from" jsonb;
ALTER TABLE "items" ADD COLUMN IF NOT EXISTS "imported_at" timestamp with time zone;
ALTER TABLE "items" ADD COLUMN IF NOT EXISTS "import_error" text;
ALTER TABLE "items" ADD COLUMN IF NOT EXISTS "native_attachments" jsonb DEFAULT '[]'::jsonb NOT NULL;
ALTER TABLE "items" ADD COLUMN IF NOT EXISTS "attachment_text" text;
ALTER TABLE "items" ADD COLUMN IF NOT EXISTS "intro_html" text;
CREATE INDEX IF NOT EXISTS "items_imported_from_idx" ON "items" USING gin ("imported_from");
CREATE INDEX IF NOT EXISTS "items_native_attachments_idx" ON "items" USING gin ("native_attachments");
