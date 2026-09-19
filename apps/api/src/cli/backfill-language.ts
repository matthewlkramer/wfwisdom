import "dotenv/config";
import { closeDb, eq, getDb, isNull, and, items, sql } from "@wfw/db";
import { resolveLanguage } from "../services/language.js";

/**
 * Fill in items.language for everything already indexed, without a re-index. Every item goes to the
 * model, which reads the opening of its stored title and body — the same check the indexer runs.
 *
 *   pnpm backfill:language              # only items still marked unknown
 *   pnpm backfill:language --all        # re-check every item, including ones already set
 *   pnpm backfill:language --all --dry-run   # report the size and cost, change nothing, spend nothing
 *
 * An item whose check fails is left exactly as it was, so a run that hits a rate limit or a paused
 * kill switch can simply be run again.
 */
const all = process.argv.includes("--all");
const dryRun = process.argv.includes("--dry-run");
/** Measured at $0.000257 for five calls against the assist model. */
const COST_PER_CALL = 0.00005;
/** Enough to get through the library quickly, gentle enough not to trip rate limits. */
const CONCURRENCY = 8;
const BATCH = 500;

const db = getDb();
const counts: Record<string, number> = { en: 0, es: 0, unknown: 0 };
let scanned = 0;
let changed = 0;
let skipped = 0;
let after = "00000000-0000-0000-0000-000000000000";

for (;;) {
  const rows = await db.select({ id: items.id, title: items.title, description: items.description, body: items.bodyText, categories: items.categories, seriesTitles: items.seriesTitles, current: items.language })
    .from(items)
    .where(and(isNull(items.removedAt), all ? undefined : eq(items.language, "unknown"), sql`${items.id} > ${after}`))
    .orderBy(items.id).limit(BATCH);
  if (!rows.length) break;

  if (!dryRun) {
    let cursor = 0;
    const worker = async () => {
      while (cursor < rows.length) {
        const r = rows[cursor++]!;
        const language = await resolveLanguage({ title: r.title, description: r.description, body: r.body, categories: r.categories, seriesTitles: r.seriesTitles }, (m) => console.warn(`\n${m}`));
        if (language === null) { skipped++; counts[r.current] = (counts[r.current] ?? 0) + 1; continue; }
        counts[language] = (counts[language] ?? 0) + 1;
        if (language !== r.current) { changed++; await db.update(items).set({ language }).where(eq(items.id, r.id)); }
      }
    };
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  }

  scanned += rows.length;
  after = rows[rows.length - 1]!.id;
  process.stdout.write(`\r${scanned} checked — en ${counts.en}, es ${counts.es}, unknown ${counts.unknown}, ${changed} changed   `);
}

const cost = `$${(scanned * COST_PER_CALL).toFixed(4)}`;
if (dryRun) console.log(`\ndry run: ${scanned} items would be checked, about ${cost}. Nothing was written and nothing was spent.`);
else console.log(`\ndone: ${scanned} items checked (about ${cost}) — ${counts.en} English, ${counts.es} Spanish, ${counts.unknown} unknown; ${changed} changed${skipped ? `, ${skipped} left as they were because the check could not run` : ""}`);
await closeDb();
