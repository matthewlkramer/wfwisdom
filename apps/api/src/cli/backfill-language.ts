import "dotenv/config";
import { closeDb, eq, getDb, isNull, and, items, sql } from "@wfw/db";
import { detectLanguage } from "@wfw/shared";

/**
 * Fill in items.language for everything already indexed, without a re-index: it reads the stored
 * title, categories and body text and runs the same detector the indexer uses.
 *
 *   pnpm backfill:language           # only items still marked unknown
 *   pnpm backfill:language --all     # re-detect every item
 */
const all = process.argv.includes("--all");
const db = getDb();
const BATCH = 500;
const counts: Record<string, number> = { en: 0, es: 0, unknown: 0 };
let scanned = 0;
let after = "00000000-0000-0000-0000-000000000000";

for (;;) {
  const rows = await db.select({ id: items.id, title: items.title, description: items.description, body: items.bodyText, categories: items.categories, seriesTitles: items.seriesTitles })
    .from(items)
    .where(and(isNull(items.removedAt), all ? undefined : eq(items.language, "unknown"), sql`${items.id} > ${after}`))
    .orderBy(items.id).limit(BATCH);
  if (!rows.length) break;
  for (const r of rows) {
    const language = detectLanguage({ title: r.title, description: r.description, body: r.body, categories: r.categories, seriesTitles: r.seriesTitles });
    counts[language] = (counts[language] ?? 0) + 1;
    if (language !== "unknown" || all) await db.update(items).set({ language }).where(eq(items.id, r.id));
  }
  scanned += rows.length;
  after = rows[rows.length - 1]!.id;
  process.stdout.write(`\r${scanned} items scanned — en ${counts.en}, es ${counts.es}, unknown ${counts.unknown}   `);
}
console.log(`\ndone: ${scanned} items scanned, ${counts.en} English, ${counts.es} Spanish, ${counts.unknown} left unknown`);
await closeDb();
