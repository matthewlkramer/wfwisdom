import { desc, eq, getDb, indexRuns } from "@wfw/db";
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

/**
 * The deployment scales to zero when idle, so the nightly timer can be asleep at 03:10. On every boot, if the last
 * successful index is older than a day (or there has never been one), start one after a short delay.
 */
export function catchUpIndexOnBoot(delayMs = 45_000, maxAgeHours = 22): void {
  setTimeout(async () => {
    try {
      const [last] = await getDb().select({ startedAt: indexRuns.startedAt }).from(indexRuns).where(eq(indexRuns.status, "done")).orderBy(desc(indexRuns.startedAt)).limit(1);
      const stale = !last || Date.now() - last.startedAt.getTime() > maxAgeHours * 3600_000;
      if (!stale || isIndexing()) return;
      logger.info({ last: last?.startedAt ?? null }, "no recent index run; starting a catch-up re-index");
      await runReindex("catch-up");
    } catch (e) { logger.warn({ err: (e as Error).message }, "catch-up re-index did not start"); }
  }, delayMs).unref();
}
