import { logger } from "./logger.js";
import { isIndexing, runReindex } from "./services/indexer.js";
import { recomputeScores } from "./services/score.js";

/** Nightly re-index at 03:10 UTC; monthly score recompute on the 1st at 04:10 UTC (also recomputed at the end of every re-index). */
export function startScheduler(): void {
  let lastReindexDay = ""; let lastScoreMonth = "";
  setInterval(async () => {
    const now = new Date(); const day = now.toISOString().slice(0, 10); const month = day.slice(0, 7);
    if (now.getUTCHours() === 3 && now.getUTCMinutes() >= 10 && lastReindexDay !== day && !isIndexing()) {
      lastReindexDay = day;
      try { await runReindex("scheduler"); } catch (e) { logger.error({ err: (e as Error).message }, "scheduled reindex failed"); }
    }
    if (now.getUTCDate() === 1 && now.getUTCHours() === 4 && lastScoreMonth !== month) {
      lastScoreMonth = month;
      try { await recomputeScores(); } catch (e) { logger.error({ err: (e as Error).message }, "scheduled score failed"); }
    }
  }, 60_000).unref();
}
