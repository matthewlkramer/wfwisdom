import "dotenv/config";
// Point the import at another database (the production one) without touching the workspace's own DATABASE_URL.
if (process.env.IMPORT_DATABASE_URL) process.env.DATABASE_URL = process.env.IMPORT_DATABASE_URL;
const { closeDb, eq, getDb, indexRuns } = await import("@wfw/db");
const { runImport } = await import("../services/import-connected.js");
const limitArg = process.argv.find((a) => a.startsWith("--limit="));
const dryRun = process.argv.includes("--dry-run");
const id = await runImport("cli", { dryRun, ...(limitArg ? { limit: Number(limitArg.split("=")[1]) } : {}) });
let shown = 0;
for (;;) {
  await new Promise((r) => setTimeout(r, 4000));
  const [run] = await getDb().select().from(indexRuns).where(eq(indexRuns.id, id));
  if (!run) break;
  const lines = run.log.split("\n").filter(Boolean);
  for (const l of lines.slice(shown)) console.log(l);
  shown = lines.length;
  if (run.status !== "running") { console.log(`${run.status} ${JSON.stringify(run.stats)}`); break; }
}
await closeDb();
