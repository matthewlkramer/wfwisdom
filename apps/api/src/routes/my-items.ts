import { Router } from "express";
import { z } from "zod";
import { and, desc, eq, getDb, inArray, itemMeta, itemVersions, items, jobs, placements, signals, sql, subjobs } from "@wfw/db";
import { requireUser } from "../auth.js";
import { googleUrl, parseGoogleLink, refreshNativeItem } from "../services/native.js";
import { publishNative } from "./native.js";

/** Everything the signed-in person has shared: its standing on the map, and the levers to edit, move, or retire it. */
export const myItemsRouter = Router();
myItemsRouter.use(requireUser);

myItemsRouter.get("/", async (req, res) => {
  const db = getDb(); const uid = req.user!.id;
  const rows = await db.select({ id: items.id, title: items.title, description: items.description, url: items.url, status: items.status, nativeKind: items.nativeKind, googleKind: items.googleKind, contentType: items.contentType, materialTypeKey: items.materialTypeKey, declineNote: items.declineNote, createdAt: items.publishedAt, updatedAt: items.sourceUpdatedAt, views: items.views, score: sql<number>`coalesce(${itemMeta.score}, 0)`, curation: itemMeta.curation, stages: itemMeta.stages, wfClicks30d: itemMeta.wfClicks30d, helpfulYes: itemMeta.wfHelpfulYes, helpfulNo: itemMeta.wfHelpfulNo }).from(items).leftJoin(itemMeta, eq(itemMeta.itemId, items.id)).where(and(eq(items.sourceKind, "native"), eq(items.authorUserId, uid), sql`${items.removedAt} is null`)).orderBy(desc(items.publishedAt));
  const ids = rows.map((r) => r.id);
  const pl = ids.length ? await db.select({ itemId: placements.itemId, key: subjobs.key, name: subjobs.name, jobName: jobs.name, isPrimary: placements.isPrimary }).from(placements).innerJoin(subjobs, eq(subjobs.id, placements.subjobId)).innerJoin(jobs, eq(jobs.id, subjobs.jobId)).where(inArray(placements.itemId, ids)) : [];
  const votes = ids.length ? await db.select({ itemId: signals.itemId, yes: sql<number>`count(*) filter (where kind='helpful_yes')::int`, no: sql<number>`count(*) filter (where kind='helpful_no')::int`, clicks: sql<number>`count(*) filter (where kind in ('click','search_click'))::int` }).from(signals).where(inArray(signals.itemId, ids)).groupBy(signals.itemId) : [];
  const versions = ids.length ? await db.select({ itemId: itemVersions.itemId, n: sql<number>`count(*)::int` }).from(itemVersions).where(inArray(itemVersions.itemId, ids)).groupBy(itemVersions.itemId) : [];
  const vm = new Map(votes.map((v) => [v.itemId, v])); const vn = new Map(versions.map((v) => [v.itemId, v.n]));
  res.json({ items: rows.map((r) => ({ ...r, placements: pl.filter((p) => p.itemId === r.id).sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary)).map(({ key, name, jobName, isPrimary }) => ({ key, name, jobName, isPrimary })), votes: { yes: vm.get(r.id)?.yes ?? 0, no: vm.get(r.id)?.no ?? 0 }, clicks: vm.get(r.id)?.clicks ?? 0, versions: vn.get(r.id) ?? 0 })) });
});

async function own(req: Parameters<typeof requireUser>[0]) {
  const [it] = await getDb().select().from(items).where(and(eq(items.id, String(req.params.id)), eq(items.sourceKind, "native"), eq(items.authorUserId, req.user!.id)));
  return it ?? null;
}
myItemsRouter.patch("/:id", async (req, res) => {
  const it = await own(req); if (!it) { res.status(404).json({ error: "Not found" }); return; }
  const body = z.object({ title: z.string().min(1).max(200).optional(), description: z.string().max(600).nullable().optional(), url: z.string().url().optional(), subjobKeys: z.array(z.string()).max(6).optional(), stages: z.array(z.string()).optional() }).parse(req.body);
  const db = getDb(); const set: Record<string, unknown> = {};
  if (body.title !== undefined) set.title = body.title.trim();
  if (body.description !== undefined) set.description = body.description?.trim() || null;
  if (body.url !== undefined) { const g = parseGoogleLink(body.url); if (!g) { res.status(400).json({ error: "That is not a Google link" }); return; } set.googleFileId = g.id; set.googleKind = g.kind; set.url = googleUrl(g.kind, g.id); set.nativeModifiedAt = null; }
  if (Object.keys(set).length) await db.update(items).set(set).where(eq(items.id, it.id));
  if (body.subjobKeys) {
    const subs = await db.select({ id: subjobs.id, key: subjobs.key }).from(subjobs).where(inArray(subjobs.key, body.subjobKeys));
    if (subs.length) { await db.delete(placements).where(eq(placements.itemId, it.id)); for (const [i, k] of body.subjobKeys.entries()) { const sub = subs.find((x) => x.key === k); if (sub) await db.insert(placements).values({ itemId: it.id, subjobId: sub.id, isPrimary: i === 0, source: "author" }).onConflictDoNothing(); } }
  }
  if (body.stages) await db.insert(itemMeta).values({ itemId: it.id, stages: body.stages }).onConflictDoUpdate({ target: itemMeta.itemId, set: { stages: body.stages } });
  const r = await refreshNativeItem(it.id, `${req.user!.name} <${req.user!.email}>`);
  if (r.changed && it.status === "published") await publishNative(it.id);
  res.json({ ok: true });
});
myItemsRouter.post("/:id/refresh", async (req, res) => { const it = await own(req); if (!it) { res.status(404).json({ error: "Not found" }); return; } const r = await refreshNativeItem(it.id, `${req.user!.name} <${req.user!.email}>`); if (r.changed && it.status === "published") await publishNative(it.id); res.json(r); });
/** Retire takes it off the map; restore puts a previously published item back (a pending one stays pending). */
myItemsRouter.post("/:id/retire", async (req, res) => { const it = await own(req); if (!it) { res.status(404).json({ error: "Not found" }); return; } await getDb().update(items).set({ status: "retired" }).where(eq(items.id, it.id)); res.json({ ok: true }); });
myItemsRouter.post("/:id/restore", async (req, res) => { const it = await own(req); if (!it) { res.status(404).json({ error: "Not found" }); return; } if (it.status !== "retired") { res.status(400).json({ error: "Only retired items can be restored" }); return; } const back = req.user!.role === "staff" ? "published" : "published"; await getDb().update(items).set({ status: back }).where(eq(items.id, it.id)); await publishNative(it.id); res.json({ ok: true }); });
