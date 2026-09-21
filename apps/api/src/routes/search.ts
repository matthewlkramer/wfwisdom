import { Router } from "express";
import { z } from "zod";
import { getDb, searchLog } from "@wfw/db";
import { isResourceLanguage, isResourceRegion, type ResourceLanguage, type ResourceRegion } from "@wfw/shared";
import { requireUser } from "../auth.js";
import { search } from "../services/search.js";
import { parseTypes, RESOURCE_LIST } from "../services/items.js";
import { answer } from "../services/chat.js";
import { listMyQuestions, listSharedExamples } from "../services/questions.js";
import { readerLanguage, readerRegion } from "../services/language-pref.js";
import { checkChatAllowed, LimitError } from "../services/limits.js";

export const chatSchema = z.object({
  conversationId: z.string().uuid(),
  question: z.string().min(2).max(1500),
  history: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(4000) })).max(12).default([]),
  // Both boxes on the Ask page are unchecked by default, so both default to false here.
  staffReview: z.boolean().default(false),
  share: z.boolean().default(false),
  shareAttribution: z.enum(["anonymous", "name"]).default("anonymous"),
});

export const searchRouter = Router();
searchRouter.use(requireUser);
searchRouter.get("/", async (req, res) => {
  const q = String(req.query.q ?? "").trim().slice(0, 300);
  const language: ResourceLanguage = isResourceLanguage(req.query.lang) ? req.query.lang : await readerLanguage(req.user!.id);
  const region: ResourceRegion = isResourceRegion(req.query.region) ? req.query.region : await readerRegion(req.user!.id);
  if (q.length < 2) { res.json({ query: q, rewritten: null, mode: "keyword", results: [], language, region }); return; }
  const types = parseTypes(req.query.types);
  const r = await search(q, { staff: req.user!.role === "staff", limit: types.length ? 30 : 12, userId: req.user!.id, language, region });
  // Mirrors typeWhere: a resource list answers to its own filter rather than to "Series".
  if (types.length) { const ct = new Set(types); r.results = r.results.filter((it) => (it.contentType === RESOURCE_LIST ? ct.has(RESOURCE_LIST) : it.isSeries ? ct.has("series") : it.kind === "question" ? ct.has("question") : ct.has(it.contentType ?? "other"))).slice(0, 12); }
  await getDb().insert(searchLog).values({ userId: req.user!.id, query: q, rewritten: r.rewritten, mode: r.mode, resultCount: r.results.length });
  res.json({ ...r, language, region });
});
searchRouter.post("/chat", async (req, res) => {
  const body = chatSchema.parse(req.body);
  try { await checkChatAllowed(req.user!.id); } catch (e) { if (e instanceof LimitError) { res.status(429).json({ error: e.message, code: e.code }); return; } throw e; }
  const r = await answer(req.user!.id, body.conversationId, body.question, body.history, req.user!.role === "staff", { staffReview: body.staffReview, share: body.share, shareAttribution: body.shareAttribution });
  res.json(r);
});
/** The signed-in user's own earlier questions, newest first. */
searchRouter.get("/chat/mine", async (req, res) => {
  res.json({ questions: await listMyQuestions(req.user!.id, 25) });
});
/** Questions staff approved for sharing, shown as examples on Ask. */
searchRouter.get("/chat/examples", async (_req, res) => {
  res.json({ examples: await listSharedExamples(6) });
});
