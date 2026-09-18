import { and, eq, getDb, gt, itemMeta, items, signals, sql } from "@wfw/db";
import { getSettings } from "../settings.js";

/** Recompute the helpfulness score for every item. Overrides are not touched; they are applied at read time. */
export async function recomputeScores(): Promise<{ items: number }> {
  const db = getDb();
  const s = await getSettings(true);
  const rows = await db.select({ id: items.id, views: items.views, likes: items.likes, comments: items.comments, publishedAt: items.publishedAt, sourceUpdatedAt: items.sourceUpdatedAt, contentType: items.contentType, hasText: items.hasText, linkOnly: items.linkOnly, curation: itemMeta.curation, yes: itemMeta.wfHelpfulYes, no: itemMeta.wfHelpfulNo })
    .from(items).leftJoin(itemMeta, eq(itemMeta.itemId, items.id)).where(sql`${items.removedAt} is null`);
  const since = new Date(Date.now() - 30 * 86400_000);
  const clicks = await db.select({ itemId: signals.itemId, n: sql<number>`count(*)::int` }).from(signals).where(and(gt(signals.createdAt, since), sql`${signals.kind} in ('click','search_click')`)).groupBy(signals.itemId);
  const clickMap = new Map(clicks.map((c) => [c.itemId, c.n]));
  const now = Date.now();
  // usage: log(views per month since publish), normalized to the catalog's 95th percentile
  const perMonth = rows.map((r) => { const months = Math.max(1, (now - (r.publishedAt?.getTime() ?? now)) / (30 * 86400_000)); return Math.log1p(r.views / months + r.likes * 2 + r.comments * 3); });
  const sorted = [...perMonth].sort((a, b) => a - b); const p95 = sorted[Math.floor(sorted.length * 0.95)] || 1;
  const w = s.scoreWeights; const ladder = s.freshnessLadder; const evergreen = new Set(s.evergreenContentTypes);
  let n = 0;
  for (const [i, r] of rows.entries()) {
    const bf = Math.min(1, (perMonth[i] ?? 0) / p95);
    const c = clickMap.get(r.id) ?? 0, yes = r.yes ?? 0, no = r.no ?? 0;
    const nSignals = c + yes + no;
    // Wilson lower bound on helpful votes, blended with clicks
    const votes = yes + no; const z = 1.96; let wilson = 0.5;
    if (votes > 0) { const p = yes / votes; wilson = (p + z * z / (2 * votes) - z * Math.sqrt((p * (1 - p) + z * z / (4 * votes)) / votes)) / (1 + z * z / votes); }
    const wfUsage = Math.min(1, 0.6 * Math.log1p(c) / Math.log1p(50) + 0.4 * wilson);
    const blend = Math.min(s.signalBlendCeiling, nSignals / 50);
    const usage = (1 - blend) * bf + blend * wfUsage;
    const ageYears = (now - (r.sourceUpdatedAt?.getTime() ?? r.publishedAt?.getTime() ?? now)) / (365.25 * 86400_000);
    const ev = evergreen.has(r.contentType ?? "");
    const step = Math.floor(ev ? ageYears / 2 : ageYears);
    const freshness = ladder[Math.min(step, ladder.length - 1)] ?? 0.25;
    const curation = r.curation === "essential" ? 1 : r.curation === "recommended" ? 0.7 : 0.35;
    const completeness = r.linkOnly ? -5 : r.hasText ? 5 : 0;
    const score = Math.max(0, Math.min(100, 100 * (w.curation * curation + w.usage * usage + w.freshness * freshness) + completeness));
    await db.insert(itemMeta).values({ itemId: r.id, score, scoreComponents: { curation, usage, freshness, completeness, bloomfireUsage: bf, wfUsage, blend }, scoreUpdatedAt: new Date(), wfClicks30d: c })
      .onConflictDoUpdate({ target: itemMeta.itemId, set: { score, scoreComponents: { curation, usage, freshness, completeness, bloomfireUsage: bf, wfUsage, blend }, scoreUpdatedAt: new Date(), wfClicks30d: c, updatedAt: new Date() } });
    n++;
  }
  return { items: n };
}
