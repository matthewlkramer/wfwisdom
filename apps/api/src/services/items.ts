import { and, desc, eq, getDb, inArray, itemMeta, items, placements, sql, subjobs, jobs } from "@wfw/db";
import type { ItemLanguage, ItemSummary, ResourceLanguage, StageKey } from "@wfw/shared";
import { stripContentTokens } from "../lib/html.js";

export const itemSelect = {
  id: items.id, title: items.title, url: items.url, kind: items.sourceKind, description: items.description, summary: items.summary, contentType: items.contentType,
  updatedAt: items.sourceUpdatedAt, views: items.views, linkOnly: items.linkOnly, attachments: items.attachments, seriesTitles: items.seriesTitles, language: items.language,
  score: sql<number>`coalesce(${itemMeta.score}, 0)`, curation: itemMeta.curation, hidden: sql<boolean>`coalesce(${itemMeta.hidden}, false)`, dated: itemMeta.datedLabel, reviewStatus: itemMeta.reviewStatus,
  nativeKind: items.nativeKind, childPostIds: items.childPostIds, childItemIds: items.childItemIds,
};
export type ItemRow = { id: string; title: string; url: string; kind: string; description: string | null; summary: string | null; contentType: string | null; updatedAt: Date | null; views: number; linkOnly: boolean; attachments: { id: number }[]; seriesTitles: string[]; language: string; score: number; curation: string | null; hidden: boolean; dated: string | null; reviewStatus: string | null; nativeKind?: string | null; childPostIds?: number[]; childItemIds?: string[] };

export function toSummary(r: ItemRow, why?: string | null): ItemSummary {
  return { id: r.id, title: r.title, url: r.url, kind: r.kind as ItemSummary["kind"], description: r.description ? stripContentTokens(r.description) : null, summary: r.summary ? stripContentTokens(r.summary) : null, contentType: r.contentType, updatedAt: r.updatedAt?.toISOString() ?? null, views: r.views, score: Math.round(r.score), curation: (r.curation as ItemSummary["curation"]) ?? null, dated: r.dated ?? null, linkOnly: r.linkOnly, attachmentCount: r.attachments.length, seriesTitles: r.seriesTitles, language: (r.language as ItemLanguage) ?? "unknown", why: why ?? null, isSeries: isSeriesRow(r) };
}
export const isSeriesRow = (r: { kind: string; nativeKind?: string | null }) => r.kind === "series" || r.nativeKind === "series";
/** Series come first on the map; within each group the usual ranking applies. */
export function rankSeriesFirst(a: ItemRow & { position?: number | null }, b: ItemRow & { position?: number | null }): number {
  const sa = isSeriesRow(a) ? 0 : 1, sb = isSeriesRow(b) ? 0 : 1; if (sa !== sb) return sa - sb;
  return rank(a, b);
}
/** The reader's document type filter (keys from DOC_TYPES). Empty means everything. */
export const typeWhere = (types: string[] | null | undefined) => {
  if (!types?.length) return undefined;
  const parts = [];
  if (types.includes("series")) parts.push(sql`(${items.sourceKind} = 'series' or ${items.nativeKind} = 'series')`);
  if (types.includes("question")) parts.push(sql`${items.sourceKind} = 'question'`);
  const ct = types.filter((t) => t !== "series" && t !== "question");
  if (ct.length) parts.push(sql`(${items.contentType} in (${sql.join(ct.map((t) => sql`${t}`), sql`, `)}) and ${items.sourceKind} <> 'series' and coalesce(${items.nativeKind}, '') <> 'series')`);
  return sql`(${sql.join(parts, sql` or `)})`;
};
export function parseTypes(v: unknown): string[] { return typeof v === "string" && v ? v.split(",").map((x) => x.trim()).filter(Boolean).slice(0, 20) : []; }
/** Effective sort: hidden excluded, pinned position, essential, recommended, then score. */
export function rank(a: ItemRow & { position?: number | null }, b: ItemRow & { position?: number | null }): number {
  const pa = a.position ?? 1e9, pb = b.position ?? 1e9; if (pa !== pb) return pa - pb;
  const ca = a.curation === "essential" ? 2 : a.curation === "recommended" ? 1 : 0, cb = b.curation === "essential" ? 2 : b.curation === "recommended" ? 1 : 0;
  if (ca !== cb) return cb - ca;
  return b.score - a.score;
}
export const visibleWhere = (staff: boolean) => staff ? sql`${items.removedAt} is null and ${items.status} = 'published'` : sql`${items.removedAt} is null and ${items.status} = 'published' and coalesce(${itemMeta.hidden}, false) = false`;
/** The reader's language filter. "all" keeps everything, including items whose language is unknown. */
export const languageWhere = (lang: ResourceLanguage | null | undefined) => (lang && lang !== "all" ? sql`${items.language} = ${lang}` : undefined);

/**
 * Items placed in a sub-job for the map: series first, and a post that belongs to one of those series is listed inside
 * the series card rather than as a card of its own.
 */
export async function itemsForSubjob(subjobId: string, staff: boolean, lang?: ResourceLanguage, types?: string[]): Promise<ItemSummary[]> {
  const db = getDb();
  const rows = await db.select({ ...itemSelect, position: placements.position, why: placements.why, isPrimary: placements.isPrimary }).from(placements).innerJoin(items, eq(items.id, placements.itemId)).leftJoin(itemMeta, eq(itemMeta.itemId, items.id)).where(and(eq(placements.subjobId, subjobId), visibleWhere(staff), languageWhere(lang), typeWhere(types)));
  return nestSeries(rows.sort(rankSeriesFirst) as (ItemRow & { why?: string | null })[], staff);
}
/** Attach each series' items (in order) and drop those items from the standalone list. */
export async function nestSeries(rows: (ItemRow & { why?: string | null })[], staff: boolean): Promise<ItemSummary[]> {
  const db = getDb();
  const series = rows.filter(isSeriesRow);
  const postIds = [...new Set(series.flatMap((s) => s.childPostIds ?? []))];
  const nativeIds = [...new Set(series.flatMap((s) => s.childItemIds ?? []))];
  const byPost = new Map<number, { id: string; title: string }>(); const byId = new Map<string, { id: string; title: string }>();
  if (postIds.length) for (const c of await db.select({ id: items.id, title: items.title, sourceId: items.sourceId }).from(items).leftJoin(itemMeta, eq(itemMeta.itemId, items.id)).where(and(eq(items.sourceKind, "post"), inArray(items.sourceId, postIds), visibleWhere(staff)))) byPost.set(c.sourceId, { id: c.id, title: c.title });
  if (nativeIds.length) for (const c of await db.select({ id: items.id, title: items.title }).from(items).leftJoin(itemMeta, eq(itemMeta.itemId, items.id)).where(and(inArray(items.id, nativeIds), visibleWhere(staff)))) byId.set(c.id, { id: c.id, title: c.title });
  const nested = new Set<string>();
  const childrenOf = (s: ItemRow) => { const out: { id: string; title: string }[] = []; for (const pid of s.childPostIds ?? []) { const c = byPost.get(pid); if (c) out.push(c); } for (const id of s.childItemIds ?? []) { const c = byId.get(id); if (c) out.push(c); } for (const c of out) nested.add(c.id); return out; };
  const withChildren = rows.map((r) => ({ r, children: isSeriesRow(r) ? childrenOf(r) : [] }));
  return withChildren.filter(({ r }) => isSeriesRow(r) || !nested.has(r.id)).map(({ r, children }) => ({ ...toSummary(r, r.why ?? null), ...(children.length ? { children } : {}) }));
}
export async function startHere(stage: StageKey, staff: boolean, cap: number, lang?: ResourceLanguage, types?: string[]): Promise<ItemSummary[]> {
  const db = getDb();
  const pinned = await db.select({ ...itemSelect, position: itemMeta.pinnedPosition }).from(items).innerJoin(itemMeta, eq(itemMeta.itemId, items.id)).where(and(eq(itemMeta.pinnedStage, stage), visibleWhere(staff), languageWhere(lang), typeWhere(types))).orderBy(itemMeta.pinnedPosition);
  const out: (ItemRow & { position?: number | null })[] = [...pinned];
  if (out.length < cap) {
    const ids = new Set(out.map((o) => o.id));
    const ess = await db.selectDistinctOn([items.id], { ...itemSelect }).from(items).innerJoin(itemMeta, eq(itemMeta.itemId, items.id)).innerJoin(placements, eq(placements.itemId, items.id)).innerJoin(subjobs, eq(subjobs.id, placements.subjobId)).innerJoin(jobs, eq(jobs.id, subjobs.jobId))
      .where(and(sql`${itemMeta.curation} in ('essential','recommended')`, sql`${stage} = any(${subjobs.stages})`, eq(jobs.hidden, false), eq(jobs.staffOnly, false), visibleWhere(staff), languageWhere(lang), typeWhere(types)));
    for (const e of ess.sort(rank)) if (!ids.has(e.id)) { out.push(e); ids.add(e.id); }
  }
  return out.slice(0, cap).map((r) => toSummary(r));
}
export async function mostUsed(staff: boolean, limit = 8, lang?: ResourceLanguage, types?: string[]): Promise<ItemSummary[]> {
  const db = getDb();
  const rows = await db.select({ ...itemSelect, clicks: itemMeta.wfClicks30d }).from(items).innerJoin(itemMeta, eq(itemMeta.itemId, items.id)).innerJoin(placements, and(eq(placements.itemId, items.id), eq(placements.isPrimary, true))).innerJoin(subjobs, eq(subjobs.id, placements.subjobId)).innerJoin(jobs, eq(jobs.id, subjobs.jobId))
    .where(and(visibleWhere(staff), eq(jobs.staffOnly, false), sql`${itemMeta.datedLabel} is null`, languageWhere(lang), typeWhere(types))).orderBy(desc(sql`coalesce(${itemMeta.wfClicks30d},0) * 10 + ${items.views} / greatest(1, extract(epoch from (now() - coalesce(${items.publishedAt}, now()))) / 2592000)`)).limit(limit);
  return rows.map((r) => toSummary(r as ItemRow));
}
export async function itemsByIds(ids: string[], staff: boolean, lang?: ResourceLanguage): Promise<Map<string, ItemRow>> {
  if (!ids.length) return new Map();
  const rows = await getDb().select(itemSelect).from(items).leftJoin(itemMeta, eq(itemMeta.itemId, items.id)).where(and(inArray(items.id, ids), visibleWhere(staff), languageWhere(lang)));
  return new Map(rows.map((r) => [r.id, r as ItemRow]));
}
