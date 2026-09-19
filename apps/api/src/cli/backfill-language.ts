import "dotenv/config";
import { closeDb, eq, getDb, inArray, isNull, and, items, sql } from "@wfw/db";
import { resolveLanguage } from "../services/language.js";

/**
 * Fill in items.language for everything already indexed, without a re-index. Every item goes to the
 * model, which reads the opening of its stored title and body — the same check the indexer runs.
 *
 *   pnpm backfill:language              # only items still marked unknown
 *   pnpm backfill:language --all        # re-check every item, including ones already set
 *   pnpm backfill:language --all --dry-run   # report the size and cost, change nothing, spend nothing
 *   pnpm backfill:language --ids=a,b    # re-check just these items, whatever they are marked
 *
 * An item whose check fails is left exactly as it was, so a run that hits a rate limit or a paused
 * kill switch can simply be run again. Failures are listed by id at the end, so a handful can be
 * retried with --ids instead of paying for the whole library again.
 */
const all = process.argv.includes("--all");
const dryRun = process.argv.includes("--dry-run");
const ids = (process.argv.find((a) => a.startsWith("--ids="))?.slice("--ids=".length) ?? "").split(",").map((v) => v.trim()).filter(Boolean);
/** Measured at $0.000257 for five calls against the assist model. */
const COST_PER_CALL = 0.00005;
/** Enough to get through the library quickly, gentle enough not to trip rate limits. */
const CONCURRENCY = 8;
const BATCH = 500;

const db = getDb();
const counts: Record<string, number> = { en: 0, es: 0, unknown: 0 };
let scanned = 0;
let changed = 0;
const failed: string[] = [];
let after = "00000000-0000-0000-0000-000000000000";

for (;;) {
  const rows = await db.select({ id: items.id, title: items.title, description: items.description, body: items.bodyText, categories: items.categories, seriesTitles: items.seriesTitles, current: items.language })
    .from(items)
    .where(and(isNull(items.removedAt), ids.length ? inArray(items.id, ids) : all ? undefined : eq(items.language, "unknown"), sql`${items.id} > ${after}`))
    .orderBy(items.id).limit(BATCH);
  if (!rows.length) break;

  if (!dryRun) {
    let cursor = 0;
    const worker = async () => {
      while (cursor < rows.length) {
        const r = rows[cursor++]!;
        const language = await resolveLanguage({ title: r.title, description: r.description, body: r.body, categories: r.categories, seriesTitles: r.seriesTitles }, (m) => console.warn(`\n[${r.id}] ${m}`));
        if (language === null) { failed.push(r.id); counts[r.current] = (counts[r.current] ?? 0) + 1; continue; }
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
else {
  console.log(`\ndone: ${scanned} items checked (about ${cost}) — ${counts.en} English, ${counts.es} Spanish, ${counts.unknown} unknown; ${changed} changed${failed.length ? `, ${failed.length} left as they were because the check could not run` : ""}`);
  // Named so they can be retried on their own, rather than by re-checking the whole library.
  if (failed.length) console.log(`retry just those with:\n  pnpm backfill:language --ids=${failed.join(",")}`);
}
await closeDb();
