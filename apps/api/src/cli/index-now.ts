import "dotenv/config";
import { closeDb, eq, getDb, indexRuns } from "@wfw/db";
import { runReindex } from "../services/indexer.js";
const full = process.argv.includes("--full");
const limitArg = process.argv.find((a) => a.startsWith("--limit="));
const id = await runReindex("cli", { full, ...(limitArg ? { limit: Number(limitArg.split("=")[1]) } : {}) });
for (;;) {
  await new Promise((r) => setTimeout(r, 5000));
  const [run] = await getDb().select().from(indexRuns).where(eq(indexRuns.id, id));
  if (!run) break;
  process.stdout.write(`\r${run.status} ${JSON.stringify(run.stats)}      `);
  if (run.status !== "running") { console.log(`\n${run.log.split("\n").slice(-15).join("\n")}`); break; }
}
await closeDb();
