import { Router } from "express";
import { asc, eq, getDb, items, jobs, materialTypes, typeResources } from "@wfw/db";
import { requireUser } from "../auth.js";
import { itemSelect, toSummary, type ItemRow } from "../services/items.js";
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
