import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { and, desc, eq, getDb, materialTypes, submissions } from "@wfw/db";
import type { ReviewResult } from "@wfw/shared";
import { requireUser } from "../auth.js";
import { env } from "../env.js";
import { extractText } from "../lib/extract.js";
import { fetchLinkText } from "../lib/fetch-link.js";
import { draftForMe } from "../services/draft.js";
import { reviewToHtml, reviewToMarkdown, sendEmail } from "../services/email.js";
import { checkDraftAllowed, checkReviewAllowed, LimitError, reviewsLeftToday } from "../services/limits.js";
import { runReview } from "../services/review.js";
import { getSettings } from "../settings.js";

export const submissionsRouter = Router();
submissionsRouter.use(requireUser);
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

submissionsRouter.post("/", upload.single("file"), async (req, res) => {
  const s = await getSettings();
  const body = z.object({ typeKey: z.string(), title: z.string().max(200).optional(), text: z.string().optional(), docUrl: z.string().url().max(2000).optional(), parentId: z.string().uuid().optional() }).parse(req.body);
  const db = getDb();
  const [t] = await db.select().from(materialTypes).where(and(eq(materialTypes.key, body.typeKey), eq(materialTypes.active, true)));
  if (!t) { res.status(404).json({ error: "Unknown material type" }); return; }
  let text = (body.text ?? "").trim(); let filename: string | null = null; let source: "paste" | "upload" | "link" = "paste";
  if (!req.file && body.docUrl) {
    const r = await fetchLinkText(body.docUrl, s.maxDraftChars + 1000);
    if (r.status !== "ok" || r.text.length < 40) { res.status(400).json({ error: r.status === "private" ? "That Google file is private. Share it with anyone with the link, or paste the text." : "Nothing readable came back from that link." }); return; }
    text = r.text; filename = r.title; source = "link";
  }
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

/** "Draft it for me": returns a first draft for the writing box. Counted separately from reviews. */
submissionsRouter.post("/draft", async (req, res) => {
  const body = z.object({ typeKey: z.string(), notes: z.string().max(20_000).optional() }).parse(req.body);
  try { await checkDraftAllowed(req.user!.id); } catch (e) { if (e instanceof LimitError) { res.status(429).json({ error: e.message, code: e.code }); return; } throw e; }
  try { res.json(await draftForMe(req.user!.id, body.typeKey, body.notes ?? "")); }
  catch (e) { res.status(502).json({ error: `Drafting failed: ${(e as Error).message}` }); }
});

submissionsRouter.get("/", async (req, res) => {
  const rows = await getDb().select({ id: submissions.id, title: submissions.title, status: submissions.status, verdict: submissions.verdict, createdAt: submissions.createdAt, typeName: materialTypes.name, typeKey: materialTypes.key, parentId: submissions.parentId, charCount: submissions.charCount, review: submissions.review })
    .from(submissions).innerJoin(materialTypes, eq(materialTypes.id, submissions.typeId)).where(eq(submissions.userId, req.user!.id)).orderBy(desc(submissions.createdAt)).limit(200);
  const left = await reviewsLeftToday(req.user!.id);
  const monthStart = new Date(); monthStart.setUTCDate(1); monthStart.setUTCHours(0, 0, 0, 0);
  res.json({
    submissions: rows.map((r) => { const rv = r.review as ReviewResult | null; const scores = rv?.rubric?.map((c) => c.score) ?? []; return { ...r, review: undefined, objectivesTotal: scores.length ? scores.reduce((a, b) => a + b, 0) : null, objectivesMax: scores.length * 5 || null, openChanges: rv?.priority_changes?.length ?? null, verifyCount: rv?.verify_with_humans?.length ?? null }; }),
    stats: { reviewsThisMonth: rows.filter((r) => r.createdAt >= monthStart).length, reviewsLeftToday: left.reviews, draftsLeftToday: left.drafts },
  });
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
  const parent = sub.parentId ? (await getDb().select({ review: submissions.review, verdict: submissions.verdict, createdAt: submissions.createdAt }).from(submissions).where(eq(submissions.id, sub.parentId)))[0] ?? null : null;
  // Version number = position in the parent chain (v1 is the first draft with no parent).
  let versionNumber = 1; let cursor = sub.parentId;
  for (let hops = 0; cursor && hops < 50; hops++) { const [p] = await getDb().select({ parentId: submissions.parentId }).from(submissions).where(eq(submissions.id, cursor)); if (!p) break; versionNumber++; cursor = p.parentId; }
  res.json({ versionNumber, parentReview: parent ? { rubric: (parent.review as ReviewResult | null)?.rubric ?? [], verdict: parent.verdict, createdAt: parent.createdAt } : null, id: sub.id, title: sub.title, status: sub.status, verdict: sub.verdict, review: sub.review, error: sub.error, createdAt: sub.createdAt, completedAt: sub.completedAt, emailedAt: sub.emailedAt, typeName: row.typeName, typeKey: row.typeKey, draftText: sub.draftText, charCount: sub.charCount, parentId: sub.parentId, model: sub.model, source: sub.source, filename: sub.filename });
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
