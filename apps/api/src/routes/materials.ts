import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { and, desc, eq, getDb, userMaterials } from "@wfw/db";
import { requireUser } from "../auth.js";
import { extractText } from "../lib/extract.js";
import { fetchLinkText } from "../lib/fetch-link.js";
import { getSettings } from "../settings.js";

/** Documents and links about the writer's school. Reviews, drafting, and suggestions read them. */
export const materialsRouter = Router();
materialsRouter.use(requireUser);
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });
const select = { id: userMaterials.id, kind: userMaterials.kind, title: userMaterials.title, filename: userMaterials.filename, url: userMaterials.url, charCount: userMaterials.charCount, status: userMaterials.status, createdAt: userMaterials.createdAt };
const MAX_ITEMS = 12;

materialsRouter.get("/", async (req, res) => {
  const rows = await getDb().select(select).from(userMaterials).where(eq(userMaterials.userId, req.user!.id)).orderBy(desc(userMaterials.createdAt));
  res.json({ materials: rows });
});

materialsRouter.post("/", upload.single("file"), async (req, res) => {
  const s = await getSettings(); const db = getDb();
  const body = z.object({ title: z.string().max(200).optional(), url: z.string().url().max(2000).optional() }).parse(req.body);
  const existing = await db.select({ id: userMaterials.id }).from(userMaterials).where(eq(userMaterials.userId, req.user!.id));
  if (existing.length >= MAX_ITEMS) { res.status(400).json({ error: `You can keep up to ${MAX_ITEMS} school documents. Remove one first.` }); return; }
  let row: typeof userMaterials.$inferInsert;
  if (req.file) {
    if (req.file.size > s.maxUploadBytes) { res.status(413).json({ error: `File is larger than ${Math.round(s.maxUploadBytes / 1024 / 1024)} MB` }); return; }
    let text = "";
    try { text = (await extractText(req.file.buffer, req.file.originalname, req.file.mimetype)).text; } catch (e) { res.status(400).json({ error: (e as Error).message }); return; }
    if (text.trim().length < 40) { res.status(400).json({ error: "No readable text was found in that file." }); return; }
    row = { userId: req.user!.id, kind: "file", title: body.title?.trim() || req.file.originalname.replace(/\.[a-z0-9]+$/i, ""), filename: req.file.originalname, text: text.slice(0, 120_000), charCount: text.length, status: "ok" };
  } else if (body.url) {
    const r = await fetchLinkText(body.url);
    if (r.status !== "ok" || r.text.length < 40) { res.status(400).json({ error: r.status === "private" ? "That link is private. Share it with anyone with the link, or upload the file instead." : "Nothing readable came back from that link. Try uploading the file instead." }); return; }
    row = { userId: req.user!.id, kind: "link", title: body.title?.trim() || r.title, url: body.url, text: r.text, charCount: r.text.length, status: r.status };
  } else { res.status(400).json({ error: "Add a file or a link." }); return; }
  const [saved] = await db.insert(userMaterials).values(row).returning(select);
  res.status(201).json({ material: saved });
});

materialsRouter.post("/:id/refresh", async (req, res) => {
  const db = getDb();
  const [m] = await db.select().from(userMaterials).where(and(eq(userMaterials.id, String(req.params.id)), eq(userMaterials.userId, req.user!.id)));
  if (!m || !m.url) { res.status(404).json({ error: "Not found" }); return; }
  const r = await fetchLinkText(m.url);
  const [saved] = await db.update(userMaterials).set(r.status === "ok" && r.text.length >= 40 ? { text: r.text, charCount: r.text.length, status: "ok" } : { status: r.status === "ok" ? "error" : r.status }).where(eq(userMaterials.id, m.id)).returning(select);
  res.json({ material: saved });
});

materialsRouter.delete("/:id", async (req, res) => {
  await getDb().delete(userMaterials).where(and(eq(userMaterials.id, String(req.params.id)), eq(userMaterials.userId, req.user!.id)));
  res.status(204).end();
});
