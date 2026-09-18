import { Router } from "express";
import { z } from "zod";
import { and, eq, getDb, itemMeta, signals, sql } from "@wfw/db";
import { requireUser } from "../auth.js";
export const signalsRouter = Router();
signalsRouter.use(requireUser);
signalsRouter.post("/", async (req, res) => {
  const body = z.object({ itemId: z.string().uuid(), kind: z.enum(["click", "search_click", "helpful_yes", "helpful_no"]), context: z.record(z.unknown()).optional() }).parse(req.body);
  const db = getDb();
  if (body.kind === "helpful_yes" || body.kind === "helpful_no") {
    await db.delete(signals).where(and(eq(signals.itemId, body.itemId), eq(signals.userId, req.user!.id), sql`kind in ('helpful_yes','helpful_no')`));
  }
  await db.insert(signals).values({ itemId: body.itemId, userId: req.user!.id, kind: body.kind, context: body.context ?? {} });
  if (body.kind.startsWith("helpful")) {
    const [v] = await db.select({ yes: sql<number>`count(*) filter (where kind='helpful_yes')::int`, no: sql<number>`count(*) filter (where kind='helpful_no')::int` }).from(signals).where(eq(signals.itemId, body.itemId));
    await db.insert(itemMeta).values({ itemId: body.itemId, wfHelpfulYes: v?.yes ?? 0, wfHelpfulNo: v?.no ?? 0 }).onConflictDoUpdate({ target: itemMeta.itemId, set: { wfHelpfulYes: v?.yes ?? 0, wfHelpfulNo: v?.no ?? 0 } });
  } else {
    await db.insert(itemMeta).values({ itemId: body.itemId, wfClicks30d: 1 }).onConflictDoUpdate({ target: itemMeta.itemId, set: { wfClicks30d: sql`${itemMeta.wfClicks30d} + 1` } });
  }
  res.json({ ok: true });
});
