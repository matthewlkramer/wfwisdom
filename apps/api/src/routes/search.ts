import { Router } from "express";
import { z } from "zod";
import { getDb, searchLog } from "@wfw/db";
import { requireUser } from "../auth.js";
import { search } from "../services/search.js";
import { answer } from "../services/chat.js";
import { checkChatAllowed, LimitError } from "../services/limits.js";
export const searchRouter = Router();
searchRouter.use(requireUser);
searchRouter.get("/", async (req, res) => {
  const q = String(req.query.q ?? "").trim().slice(0, 300);
  if (q.length < 2) { res.json({ query: q, rewritten: null, mode: "keyword", results: [] }); return; }
  const r = await search(q, { staff: req.user!.role === "staff", limit: 12, explain: req.query.explain !== "0", userId: req.user!.id });
  await getDb().insert(searchLog).values({ userId: req.user!.id, query: q, rewritten: r.rewritten, mode: r.mode, resultCount: r.results.length });
  res.json(r);
});
searchRouter.post("/chat", async (req, res) => {
  const body = z.object({ conversationId: z.string().uuid(), question: z.string().min(2).max(1500), history: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(4000) })).max(12).default([]) }).parse(req.body);
  try { await checkChatAllowed(req.user!.id); } catch (e) { if (e instanceof LimitError) { res.status(429).json({ error: e.message, code: e.code }); return; } throw e; }
  const r = await answer(req.user!.id, body.conversationId, body.question, body.history, req.user!.role === "staff");
  res.json(r);
});
