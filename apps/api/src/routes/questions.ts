import { Router } from "express";
import { z } from "zod";
import { auditLog, getDb } from "@wfw/db";
import { actor, requireStaff } from "../auth.js";
import { addNote, getStaffQuestion, listStaffQuestions, updateQuestion } from "../services/questions.js";

export const listSchema = z.object({
  reviewed: z.enum(["all", "reviewed", "unreviewed"]).default("all"),
  share: z.enum(["all", "pending", "approved", "rejected"]).default("all"),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});
export const noteSchema = z.object({ body: z.string().trim().min(1).max(10_000) });
export const updateSchema = z.object({ reviewed: z.boolean().optional(), shareStatus: z.enum(["pending", "approved", "rejected"]).optional() })
  .refine((v) => v.reviewed !== undefined || v.shareStatus !== undefined, "Nothing to change");

/** Staff queue of questions the asker offered for review or for sharing as an example. */
export const adminQuestionsRouter = Router();
adminQuestionsRouter.use(requireStaff);

adminQuestionsRouter.get("/", async (req, res) => {
  const q = listSchema.parse(req.query);
  const { questions, total } = await listStaffQuestions(q);
  res.json({ questions, pagination: { page: q.page, limit: q.limit, total, pageCount: Math.max(1, Math.ceil(total / q.limit)) } });
});

adminQuestionsRouter.post("/:id/notes", async (req, res) => {
  const { body } = noteSchema.parse(req.body);
  const id = String(req.params.id);
  const ok = await addNote(id, { id: req.user!.id, name: req.user!.name }, body);
  if (!ok) { res.status(404).json({ error: "Question not found" }); return; }
  await getDb().insert(auditLog).values({ actor: actor(req), action: "question.note", target: id, detail: { chars: body.length } }).catch(() => undefined);
  res.status(201).json({ question: await getStaffQuestion(id) });
});

adminQuestionsRouter.patch("/:id", async (req, res) => {
  const changes = updateSchema.parse(req.body);
  const id = String(req.params.id);
  const ok = await updateQuestion(id, actor(req), changes);
  if (!ok) { res.status(404).json({ error: "Question not found, or it was never offered for sharing" }); return; }
  await getDb().insert(auditLog).values({ actor: actor(req), action: changes.shareStatus ? `question.share.${changes.shareStatus}` : "question.review", target: id, detail: changes as Record<string, unknown> }).catch(() => undefined);
  res.json({ question: await getStaffQuestion(id) });
});
