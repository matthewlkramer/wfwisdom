import "dotenv/config";
import { closeDb, eq, getDb, isNull, and, items, sql } from "@wfw/db";
import { detectLanguageDetailed } from "@wfw/shared";
import { resolveLanguage } from "../services/language.js";

/**
 * Fill in items.language for everything already indexed, without a re-index: it reads the stored
 * title, categories and body text and runs the same detection the indexer uses — the offline
 * detector first, then a model call for anything it is not certain about.
 *
 *   pnpm backfill:language              # only items still marked unknown
 *   pnpm backfill:language --all        # re-detect every item
 *   pnpm backfill:language --all --dry-run   # report what it would do and cost, change nothing
 *   pnpm backfill:language --no-ai      # offline detector only, no model calls, no cost
 */
const all = process.argv.includes("--all");
const useAi = !process.argv.includes("--no-ai");
const dryRun = process.argv.includes("--dry-run");
/** Measured at $0.000257 for five calls against the assist model. */
const COST_PER_CALL = 0.00005;
const db = getDb();
const BATCH = 500;
const counts: Record<string, number> = { en: 0, es: 0, unknown: 0 };
let scanned = 0;
let calls = 0;
let corrected = 0;
let after = "00000000-0000-0000-0000-000000000000";

for (;;) {
  const rows = await db.select({ id: items.id, title: items.title, description: items.description, body: items.bodyText, categories: items.categories, seriesTitles: items.seriesTitles })
    .from(items)
    .where(and(isNull(items.removedAt), all ? undefined : eq(items.language, "unknown"), sql`${items.id} > ${after}`))
    .orderBy(items.id).limit(BATCH);
  if (!rows.length) break;
  for (const r of rows) {
    const input = { title: r.title, description: r.description, body: r.body, categories: r.categories, seriesTitles: r.seriesTitles };
    const offline = detectLanguageDetailed(input);
    const asks = useAi && offline.confidence === "low" && `${r.title ?? ""}${r.body ?? ""}`.trim().length >= 8;
    if (asks) calls++;
    const language = asks && !dryRun ? await resolveLanguage(input, (m) => console.warn(`\n${m}`)) : offline.language;
    if (language !== offline.language) corrected++;
    counts[language] = (counts[language] ?? 0) + 1;
    if (!dryRun && (language !== "unknown" || all)) await db.update(items).set({ language }).where(eq(items.id, r.id));
  }
  scanned += rows.length;
  after = rows[rows.length - 1]!.id;
  process.stdout.write(`\r${scanned} scanned — en ${counts.en}, es ${counts.es}, unknown ${counts.unknown}, ${calls} model calls   `);
}

const cost = `${calls} model call${calls === 1 ? "" : "s"}, about $${(calls * COST_PER_CALL).toFixed(4)}`;
if (dryRun) console.log(`\ndry run: ${scanned} items scanned, nothing written. The offline detector alone gives ${counts.en} English, ${counts.es} Spanish, ${counts.unknown} unknown, and would send ${cost}.`);
else console.log(`\ndone: ${scanned} items scanned, ${counts.en} English, ${counts.es} Spanish, ${counts.unknown} left unknown${useAi ? ` (${cost}; ${corrected} verdicts changed by the model)` : " (model check skipped)"}`);
await closeDb();
