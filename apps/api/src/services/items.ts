import { and, desc, eq, getDb, inArray, itemMeta, items, placements, sql, subjobs, jobs } from "@wfw/db";
import type { ItemLanguage, ItemSummary, ResourceLanguage, StageKey } from "@wfw/shared";
import { stripContentTokens } from "../lib/html.js";

export const itemSelect = {
  id: items.id, title: items.title, url: items.url, kind: items.sourceKind, description: items.description, summary: items.summary, contentType: items.contentType,
  updatedAt: items.sourceUpdatedAt, views: items.views, linkOnly: items.linkOnly, attachments: items.attachments, seriesTitles: items.seriesTitles, language: items.language,
  score: sql<number>`coalesce(${itemMeta.score}, 0)`, curation: itemMeta.curation, hidden: sql<boolean>`coalesce(${itemMeta.hidden}, false)`, dated: itemMeta.datedLabel, reviewStatus: itemMeta.reviewStatus,
};
export type ItemRow = { id: string; title: string; url: string; kind: string; description: string | null; summary: string | null; contentType: string | null; updatedAt: Date | null; views: number; linkOnly: boolean; attachments: { id: number }[]; seriesTitles: string[]; language: string; score: number; curation: string | null; hidden: boolean; dated: string | null; reviewStatus: string | null };

export function toSummary(r: ItemRow, why?: string | null): ItemSummary {
  return { id: r.id, title: r.title, url: r.url, kind: r.kind as ItemSummary["kind"], description: r.description ? stripContentTokens(r.description) : null, summary: r.summary ? stripContentTokens(r.summary) : null, contentType: r.contentType, updatedAt: r.updatedAt?.toISOString() ?? null, views: r.views, score: Math.round(r.score), curation: (r.curation as ItemSummary["curation"]) ?? null, dated: r.dated ?? null, linkOnly: r.linkOnly, attachmentCount: r.attachments.length, seriesTitles: r.seriesTitles, language: (r.language as ItemLanguage) ?? "unknown", why: why ?? null };
}
/** Effective sort: hidden excluded, pinned position, essential, recommended, then score. */
export function rank(a: ItemRow & { position?: number | null }, b: ItemRow & { position?: number | null }): number {
  const pa = a.position ?? 1e9, pb = b.position ?? 1e9; if (pa !== pb) return pa - pb;
  const ca = a.curation === "essential" ? 2 : a.curation === "recommended" ? 1 : 0, cb = b.curation === "essential" ? 2 : b.curation === "recommended" ? 1 : 0;
  if (ca !== cb) return cb - ca;
  return b.score - a.score;
}
export const visibleWhere = (staff: boolean) => staff ? sql`${items.removedAt} is null` : sql`${items.removedAt} is null and coalesce(${itemMeta.hidden}, false) = false`;
/** The reader's language filter. "all" keeps everything, including items whose language is unknown. */
export const languageWhere = (lang: ResourceLanguage | null | undefined) => (lang && lang !== "all" ? sql`${items.language} = ${lang}` : undefined);

export async function itemsForSubjob(subjobId: string, staff: boolean, lang?: ResourceLanguage): Promise<ItemSummary[]> {
  const db = getDb();
  const rows = await db.select({ ...itemSelect, position: placements.position, why: placements.why, isPrimary: placements.isPrimary }).from(placements).innerJoin(items, eq(items.id, placements.itemId)).leftJoin(itemMeta, eq(itemMeta.itemId, items.id)).where(and(eq(placements.subjobId, subjobId), visibleWhere(staff), languageWhere(lang)));
  return rows.sort(rank).map((r) => toSummary(r as ItemRow, r.why));
}
export async function startHere(stage: StageKey, staff: boolean, cap: number, lang?: ResourceLanguage): Promise<ItemSummary[]> {
  const db = getDb();
  const pinned = await db.select({ ...itemSelect, position: itemMeta.pinnedPosition }).from(items).innerJoin(itemMeta, eq(itemMeta.itemId, items.id)).where(and(eq(itemMeta.pinnedStage, stage), visibleWhere(staff), languageWhere(lang))).orderBy(itemMeta.pinnedPosition);
  const out: (ItemRow & { position?: number | null })[] = [...pinned];
  if (out.length < cap) {
    const ids = new Set(out.map((o) => o.id));
    const ess = await db.selectDistinctOn([items.id], { ...itemSelect }).from(items).innerJoin(itemMeta, eq(itemMeta.itemId, items.id)).innerJoin(placements, eq(placements.itemId, items.id)).innerJoin(subjobs, eq(subjobs.id, placements.subjobId)).innerJoin(jobs, eq(jobs.id, subjobs.jobId))
      .where(and(sql`${itemMeta.curation} in ('essential','recommended')`, sql`${stage} = any(${subjobs.stages})`, eq(jobs.hidden, false), eq(jobs.staffOnly, false), visibleWhere(staff), languageWhere(lang)));
    for (const e of ess.sort(rank)) if (!ids.has(e.id)) { out.push(e); ids.add(e.id); }
  }
  return out.slice(0, cap).map((r) => toSummary(r));
}
export async function mostUsed(staff: boolean, limit = 8, lang?: ResourceLanguage): Promise<ItemSummary[]> {
  const db = getDb();
  const rows = await db.select({ ...itemSelect, clicks: itemMeta.wfClicks30d }).from(items).innerJoin(itemMeta, eq(itemMeta.itemId, items.id)).innerJoin(placements, and(eq(placements.itemId, items.id), eq(placements.isPrimary, true))).innerJoin(subjobs, eq(subjobs.id, placements.subjobId)).innerJoin(jobs, eq(jobs.id, subjobs.jobId))
    .where(and(visibleWhere(staff), eq(jobs.staffOnly, false), sql`${itemMeta.datedLabel} is null`, languageWhere(lang))).orderBy(desc(sql`coalesce(${itemMeta.wfClicks30d},0) * 10 + ${items.views} / greatest(1, extract(epoch from (now() - coalesce(${items.publishedAt}, now()))) / 2592000)`)).limit(limit);
  return rows.map((r) => toSummary(r as ItemRow));
}
export async function itemsByIds(ids: string[], staff: boolean, lang?: ResourceLanguage): Promise<Map<string, ItemRow>> {
  if (!ids.length) return new Map();
  const rows = await getDb().select(itemSelect).from(items).leftJoin(itemMeta, eq(itemMeta.itemId, items.id)).where(and(inArray(items.id, ids), visibleWhere(staff), languageWhere(lang)));
  return new Map(rows.map((r) => [r.id, r as ItemRow]));
}
