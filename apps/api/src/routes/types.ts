import { Router } from "express";
import { asc, eq, getDb, items, jobs, materialTypes, typeResources } from "@wfw/db";
import { requireUser } from "../auth.js";
import { itemSelect, toSummary, type ItemRow } from "../services/items.js";
import { schoolContext } from "../services/school.js";
import { search } from "../services/search.js";
import { sha } from "../lib/text.js";
import { itemMeta } from "@wfw/db";
export const typesRouter = Router();
typesRouter.use(requireUser);
typesRouter.get("/", async (_req, res) => {
  const db = getDb();
  const ts = await db.select({ id: materialTypes.id, key: materialTypes.key, name: materialTypes.name, shortDescription: materialTypes.shortDescription, jobKey: materialTypes.jobKey, sort: materialTypes.sort, active: materialTypes.active }).from(materialTypes).where(eq(materialTypes.active, true)).orderBy(asc(materialTypes.sort));
  const js = await db.select({ key: jobs.key, name: jobs.name, sort: jobs.sort }).from(jobs).orderBy(jobs.sort);
  res.json({ types: ts, jobs: js });
});
typesRouter.get("/:key", async (req, res) => {
  const db = getDb();
  const [t] = await db.select().from(materialTypes).where(eq(materialTypes.key, String(req.params.key)));
  if (!t || (!t.active && req.user!.role !== "staff")) { res.status(404).json({ error: "Not found" }); return; }
  const res2 = await db.select({ ...itemSelect, sort: typeResources.sort }).from(typeResources).innerJoin(items, eq(items.id, typeResources.itemId)).leftJoin(itemMeta, eq(itemMeta.itemId, items.id)).where(eq(typeResources.typeId, t.id)).orderBy(asc(typeResources.sort));
  res.json({ type: { id: t.id, key: t.key, name: t.name, shortDescription: t.shortDescription, jobKey: t.jobKey, guideMd: t.guideMd, rubric: t.rubric, version: t.version, active: t.active }, resources: res2.map((r) => toSummary(r as ItemRow)) });
});

/** Resources picked for this writer's school: a semantic search seeded by the type and what they shared. Cached per user for six hours. */
const suggestedCache = new Map<string, { at: number; items: ReturnType<typeof toSummary>[] }>();
typesRouter.get("/:key/suggested", async (req, res) => {
  const db = getDb();
  const [t] = await db.select({ id: materialTypes.id, name: materialTypes.name, shortDescription: materialTypes.shortDescription }).from(materialTypes).where(eq(materialTypes.key, String(req.params.key)));
  if (!t) { res.status(404).json({ error: "Not found" }); return; }
  const school = await schoolContext(req.user!.id, 3000);
  if (!school.count) { res.json({ items: [], basedOn: [] }); return; }
  const key = `${req.user!.id}:${t.id}:${sha(school.text)}`;
  const hit = suggestedCache.get(key);
  if (hit && Date.now() - hit.at < 6 * 3600_000) { res.json({ items: hit.items, basedOn: school.titles }); return; }
  const curated = new Set((await db.select({ itemId: typeResources.itemId }).from(typeResources).where(eq(typeResources.typeId, t.id))).map((r) => r.itemId));
  const q = `${t.name}. ${t.shortDescription ?? ""} For a school described as: ${school.text.replace(/\s+/g, " ").slice(0, 700)}`;
  const r = await search(q, { staff: req.user!.role === "staff", limit: 10, explain: false, userId: req.user!.id });
  const picked = r.results.filter((i) => !curated.has(i.id)).slice(0, 4);
  suggestedCache.set(key, { at: Date.now(), items: picked });
  res.json({ items: picked, basedOn: school.titles });
});
