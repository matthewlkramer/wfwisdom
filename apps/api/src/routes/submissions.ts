import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { and, desc, eq, getDb, materialTypes, submissions } from "@wfw/db";
import type { ReviewResult } from "@wfw/shared";
import { requireUser } from "../auth.js";
import { env } from "../env.js";
import { extractText } from "../lib/extract.js";
import { reviewToHtml, reviewToMarkdown, sendEmail } from "../services/email.js";
import { checkReviewAllowed, LimitError } from "../services/limits.js";
import { runReview } from "../services/review.js";
import { getSettings } from "../settings.js";

export const submissionsRouter = Router();
submissionsRouter.use(requireUser);
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

submissionsRouter.post("/", upload.single("file"), async (req, res) => {
  const s = await getSettings();
  const body = z.object({ typeKey: z.string(), title: z.string().max(200).optional(), text: z.string().optional(), parentId: z.string().uuid().optional() }).parse(req.body);
  const db = getDb();
  const [t] = await db.select().from(materialTypes).where(and(eq(materialTypes.key, body.typeKey), eq(materialTypes.active, true)));
  if (!t) { res.status(404).json({ error: "Unknown material type" }); return; }
  let text = (body.text ?? "").trim(); let filename: string | null = null; let source: "paste" | "upload" = "paste";
  if (req.file) {
    if (req.file.size > s.maxUploadBytes) { res.status(413).json({ error: `File is larger than ${Math.round(s.maxUploadBytes / 1024 / 1024)} MB` }); return; }
    try { text = (await extractText(req.file.buffer, req.file.originalname, req.file.mimetype)).text; } catch (e) { res.status(400).json({ error: (e as Error).message }); return; }
    filename = req.file.originalname; source = "upload";
  }
  if (text.length < 40) { res.status(400).json({ error: "The draft is too short to review (or no text could be read from the file)." }); return; }
  if (text.length > s.maxDraftChars) { res.status(413).json({ error: `The draft is ${text.length.toLocaleString()} characters; the limit is ${s.maxDraftChars.toLocaleString()}. Please submit a section at a time.` }); return; }
  try { await checkReviewAllowed(req.user!.id); } catch (e) { if (e instanceof LimitError) { res.status(429).json({ error: e.message, code: e.code }); return; } throw e; }
  const [sub] = await db.insert(submissions).values({ userId: req.user!.id, typeId: t.id, typeVersion: t.version, parentId: body.parentId ?? null, title: body.title?.trim() || filename || `${t.name} draft`, source, filename, draftText: text, charCount: text.length }).returning({ id: submissions.id });
  void runReview(sub!.id);
  res.status(202).json({ id: sub!.id });
});

submissionsRouter.get("/", async (req, res) => {
  const rows = await getDb().select({ id: submissions.id, title: submissions.title, status: submissions.status, verdict: submissions.verdict, createdAt: submissions.createdAt, typeName: materialTypes.name, typeKey: materialTypes.key, parentId: submissions.parentId, charCount: submissions.charCount })
    .from(submissions).innerJoin(materialTypes, eq(materialTypes.id, submissions.typeId)).where(eq(submissions.userId, req.user!.id)).orderBy(desc(submissions.createdAt)).limit(100);
  res.json({ submissions: rows });
});

async function ownSubmission(req: Parameters<typeof requireUser>[0]) {
  const [row] = await getDb().select({ sub: submissions, typeName: materialTypes.name, typeKey: materialTypes.key }).from(submissions).innerJoin(materialTypes, eq(materialTypes.id, submissions.typeId)).where(eq(submissions.id, String(req.params.id)));
  if (!row) return null;
  if (row.sub.userId !== req.user!.id && req.user!.role !== "staff") return null;
  return row;
}
submissionsRouter.get("/:id", async (req, res) => {
  const row = await ownSubmission(req);
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  const { sub } = row;
  res.json({ id: sub.id, title: sub.title, status: sub.status, verdict: sub.verdict, review: sub.review, error: sub.error, createdAt: sub.createdAt, completedAt: sub.completedAt, emailedAt: sub.emailedAt, typeName: row.typeName, typeKey: row.typeKey, draftText: sub.draftText, charCount: sub.charCount, parentId: sub.parentId, model: sub.model, source: sub.source, filename: sub.filename });
});
submissionsRouter.get("/:id/download", async (req, res) => {
  const row = await ownSubmission(req);
  if (!row || !row.sub.review) { res.status(404).json({ error: "Not found" }); return; }
  const md = reviewToMarkdown(row.sub.title ?? "draft", row.typeName, row.sub.review as ReviewResult);
  res.setHeader("Content-Disposition", `attachment; filename="feedback-${(row.sub.title ?? "draft").replace(/[^a-z0-9]+/gi, "-").slice(0, 60)}.md"`);
  res.type("text/markdown").send(md);
});
submissionsRouter.post("/:id/email", async (req, res) => {
  const row = await ownSubmission(req);
  if (!row || !row.sub.review) { res.status(404).json({ error: "Not found" }); return; }
  const html = reviewToHtml(row.sub.title ?? "draft", row.typeName, row.sub.review as ReviewResult, env.appBaseUrl);
  await sendEmail(req.user!.email, `Feedback on ${row.sub.title ?? "your draft"} (${row.sub.verdict})`, html);
  await getDb().update(submissions).set({ emailedAt: new Date() }).where(eq(submissions.id, row.sub.id));
  res.json({ ok: true, to: req.user!.email });
});
submissionsRouter.post("/:id/contribute", async (req, res) => {
  const row = await ownSubmission(req);
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  const body = z.object({ contributed: z.boolean() }).parse(req.body);
  await getDb().update(submissions).set({ contributed: body.contributed }).where(eq(submissions.id, row.sub.id));
  res.json({ ok: true });
});
