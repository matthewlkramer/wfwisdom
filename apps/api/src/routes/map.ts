import { Router } from "express";
import { z } from "zod";
import { and, desc, eq, getDb, inArray, isNull, itemMeta, items, jobs, placements, signals, sql, subjobs, users } from "@wfw/db";
import { STAGES, type JobSummary, type StageKey } from "@wfw/shared";
import { requireUser } from "../auth.js";
import { getSettings } from "../settings.js";
import { itemsForSubjob, mostUsed, startHere, toSummary, itemSelect, type ItemRow, visibleWhere } from "../services/items.js";

export const mapRouter = Router();
mapRouter.use(requireUser);
const isStage = (s: unknown): s is StageKey => typeof s === "string" && STAGES.some((x) => x.key === s);

mapRouter.get("/", async (req, res) => {
  const staff = req.user!.role === "staff";
  const db = getDb();
  const js = await db.select().from(jobs).orderBy(jobs.sort);
  const ss = await db.select().from(subjobs).orderBy(subjobs.sort);
  const counts = await db.select({ subjobId: placements.subjobId, n: sql<number>`count(*)::int` }).from(placements).innerJoin(items, eq(items.id, placements.itemId)).leftJoin(itemMeta, eq(itemMeta.itemId, items.id)).where(visibleWhere(staff)).groupBy(placements.subjobId);
  const cmap = new Map(counts.map((c) => [c.subjobId, c.n]));
  const stageRows = await db.execute(sql`select s as stage, count(distinct i.id)::int as n from items i join item_meta m on m.item_id = i.id cross join lateral unnest(m.stages) as s where i.removed_at is null and coalesce(m.hidden, false) = false ${staff ? sql`` : sql`and not exists (select 1 from placements p join subjobs sj on sj.id = p.subjob_id join jobs j on j.id = sj.job_id where p.item_id = i.id and p.is_primary and j.staff_only)`} group by s`);
  const stageCounts = Object.fromEntries((stageRows.rows as { stage: string; n: number }[]).map((r) => [r.stage, r.n]));
  const out: JobSummary[] = js.filter((j) => staff || !j.hidden).map((j) => ({ id: j.id, key: j.key, name: j.name, description: j.description, staffOnly: j.staffOnly, hidden: j.hidden,
    subjobs: ss.filter((s) => s.jobId === j.id).map((s) => ({ id: s.id, key: s.key, name: s.name, description: s.description, stages: s.stages as StageKey[], itemCount: cmap.get(s.id) ?? 0 })) }));
  res.json({ jobs: out, stages: STAGES, stageCounts });
});

mapRouter.get("/home", async (req, res) => {
  const staff = req.user!.role === "staff";
  const s = await getSettings();
  const stage = isStage(req.query.stage) ? req.query.stage : null;
  const [u] = await getDb().select({ stage: users.stage }).from(users).where(eq(users.id, req.user!.id));
  const effective = stage ?? (isStage(u?.stage) ? u!.stage as StageKey : null);
  const [start, used] = await Promise.all([effective ? startHere(effective, staff, s.startHereCap) : Promise.resolve([]), mostUsed(staff, 8)]);
  res.json({ stage: effective, startHere: start, mostUsed: used, stages: STAGES });
});

mapRouter.post("/stage", async (req, res) => {
  const body = z.object({ stage: z.string().nullable() }).parse(req.body);
  if (body.stage !== null && !isStage(body.stage)) { res.status(400).json({ error: "Unknown stage" }); return; }
  await getDb().update(users).set({ stage: body.stage }).where(eq(users.id, req.user!.id));
  res.json({ ok: true });
});

/** One job with its sub-jobs and the top few resources in each, for the explorer view. */
mapRouter.get("/job/:key", async (req, res) => {
  const staff = req.user!.role === "staff";
  const db = getDb();
  const [j] = await db.select().from(jobs).where(eq(jobs.key, String(req.params.key)));
  if (!j || (j.hidden && !staff)) { res.status(404).json({ error: "Not found" }); return; }
  const ss = await db.select().from(subjobs).where(eq(subjobs.jobId, j.id)).orderBy(subjobs.sort);
  const perSub = Number(req.query.limit ?? 3);
  const out = await Promise.all(ss.map(async (sj) => { const list = await itemsForSubjob(sj.id, staff); return { id: sj.id, key: sj.key, name: sj.name, description: sj.description, stages: sj.stages as StageKey[], itemCount: list.length, items: list.slice(0, perSub) }; }));
  res.json({ job: { id: j.id, key: j.key, name: j.name, description: j.description, staffOnly: j.staffOnly }, subjobs: out });
});

mapRouter.get("/subjob/:key", async (req, res) => {
  const staff = req.user!.role === "staff";
  const db = getDb();
  const [s] = await db.select({ id: subjobs.id, key: subjobs.key, name: subjobs.name, description: subjobs.description, stages: subjobs.stages, jobId: subjobs.jobId }).from(subjobs).where(eq(subjobs.key, String(req.params.key)));
  if (!s) { res.status(404).json({ error: "Not found" }); return; }
  const [j] = await db.select().from(jobs).where(eq(jobs.id, s.jobId));
  const list = await itemsForSubjob(s.id, staff);
  res.json({ subjob: { ...s, stages: s.stages as StageKey[] }, job: j ? { id: j.id, key: j.key, name: j.name } : null, items: list });
});

mapRouter.get("/item/:id", async (req, res) => {
  const staff = req.user!.role === "staff";
  const db = getDb();
  const [r] = await db.select({ ...itemSelect, authorName: items.authorName, publishedAt: items.publishedAt, categories: items.categories, audiences: items.audiences, linkedDocs: items.linkedDocs, attachmentsFull: items.attachments, bodyHtml: items.bodyHtml, bodyText: items.bodyText, childPostIds: items.childPostIds, sourceKind: items.sourceKind, sourceId: items.sourceId }).from(items).leftJoin(itemMeta, eq(itemMeta.itemId, items.id)).where(and(eq(items.id, String(req.params.id)), visibleWhere(staff)));
  if (!r) { res.status(404).json({ error: "Not found" }); return; }
  const pl = await db.select({ key: subjobs.key, name: subjobs.name, jobName: jobs.name, jobKey: jobs.key, isPrimary: placements.isPrimary }).from(placements).innerJoin(subjobs, eq(subjobs.id, placements.subjobId)).innerJoin(jobs, eq(jobs.id, subjobs.jobId)).where(eq(placements.itemId, r.id)).orderBy(desc(placements.isPrimary));
  const [votes] = await db.select({ yes: sql<number>`count(*) filter (where kind='helpful_yes')::int`, no: sql<number>`count(*) filter (where kind='helpful_no')::int` }).from(signals).where(eq(signals.itemId, r.id));
  const mine = await db.select({ kind: signals.kind }).from(signals).where(and(eq(signals.itemId, r.id), eq(signals.userId, req.user!.id), sql`kind in ('helpful_yes','helpful_no')`)).orderBy(desc(signals.createdAt)).limit(1);
  const childIds = (r.childPostIds ?? []).slice(0, 200);
  const children = childIds.length ? await db.select({ ...itemSelect, sourceId: items.sourceId }).from(items).leftJoin(itemMeta, eq(itemMeta.itemId, items.id)).where(and(eq(items.sourceKind, "post"), inArray(items.sourceId, childIds), visibleWhere(staff))) : [];
  const byId = new Map(children.map((c) => [c.sourceId, c]));
  const contents = childIds.map((id) => byId.get(id)).filter((c): c is NonNullable<typeof c> => !!c).map((c) => toSummary(c as ItemRow));
  // Items with no stored HTML yet (indexed before full content landed) fall back to their plain text.
  const bodyHtml = r.bodyHtml ?? (r.bodyText ? `<p>${r.bodyText.split(/\n{2,}/).slice(0, 80).map((p) => p.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]!))).join("</p><p>")}</p>` : "");
  res.json({ item: { ...toSummary(r as ItemRow), authorName: r.authorName, publishedAt: r.publishedAt, categories: r.categories, audiences: r.audiences, bodyHtml, attachments: r.attachmentsFull.map((a) => ({ id: a.id, name: a.name, type: a.type, bytes: a.bytes, mime: a.mime ?? null })), linkedDocs: r.linkedDocs.map((d) => ({ url: d.url, kind: d.kind, status: d.status })), contents }, placements: pl, votes: { yes: votes?.yes ?? 0, no: votes?.no ?? 0, mine: mine[0]?.kind ?? null } });
});

/** Resolve a Connected post/series/question id to the wfwisdom item (used for links inside imported content). */
mapRouter.get("/by-source/:kind/:sourceId", async (req, res) => {
  const kind = String(req.params.kind), sourceId = Number(req.params.sourceId);
  if (!["post", "series", "question"].includes(kind) || !Number.isFinite(sourceId)) { res.status(400).json({ error: "Bad reference" }); return; }
  const [r] = await getDb().select({ id: items.id, title: items.title, url: items.url }).from(items).where(and(eq(items.sourceKind, kind), eq(items.sourceId, sourceId), isNull(items.removedAt))).limit(1);
  if (!r) { res.status(404).json({ error: "Not in Wildflower Wisdom" }); return; }
  res.json(r);
});
