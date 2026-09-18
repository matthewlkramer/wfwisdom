import { chatTurns, getDb } from "@wfw/db";
import type { AskOptions } from "@wfw/shared";
import { costUsd, respondJson } from "../lib/openai.js";
import { getSettings } from "../settings.js";
import { retrievePassages } from "./search.js";

const SYSTEM = `You answer a Wildflower teacher leader's question using ONLY the Connected passages provided. Rules: cite every item you rely on by its number in square brackets like [1]; never invent facts, policies, names, or numbers; if the passages do not cover the question, set covered=false and say plainly that Connected does not cover it and suggest asking their Operations Guide or support@wildflowerschools.org; keep answers under 180 words, plain and warm; write in the language of the question. Return JSON {"answer": string, "covered": boolean, "used": number[]}.`;
const SCHEMA = { name: "chat", schema: { type: "object", additionalProperties: false, required: ["answer", "covered", "used"], properties: { answer: { type: "string" }, covered: { type: "boolean" }, used: { type: "array", items: { type: "integer" } } } } };

export async function answer(userId: string, conversationId: string, question: string, history: { role: "user" | "assistant"; content: string }[], staff: boolean, options: AskOptions = { staffReview: false, share: false, shareAttribution: "anonymous" }) {
  const s = await getSettings();
  const passages = await retrievePassages(question, staff, 8);
  const ctx = passages.map((p, i) => `[${i + 1}] ${p.title}\n${p.text}`).join("\n\n");
  const hist = history.slice(-6).map((h) => `${h.role === "user" ? "Teacher leader" : "Assistant"}: ${h.content}`).join("\n");
  const user = `${hist ? `Earlier in this conversation:\n${hist}\n\n` : ""}Question: ${question}\n\nConnected passages:\n${ctx || "(none found)"}`;
  const r = await respondJson<{ answer: string; covered: boolean; used: number[] }>({ model: s.chatModel, system: SYSTEM, user, schema: SCHEMA, effort: "low", maxOutput: 600, timeoutMs: 60_000 });
  const cited = [...new Set(r.data.used)].map((n) => passages[n - 1]).filter((p): p is NonNullable<typeof p> => !!p).map((p) => ({ itemId: p.itemId, title: p.title, url: p.url }));
  const uniq = cited.filter((c, i, a) => a.findIndex((x) => x.itemId === c.itemId) === i);
  const cost = costUsd(s.chatModel, r.usage);
  // What the asker ticked on the Ask page rides along with the turn; a shared question starts as pending
  // so nothing reaches the public examples before staff approve it.
  await getDb().insert(chatTurns).values({ userId, conversationId, question, answer: r.data.answer, citations: uniq, covered: r.data.covered, model: s.chatModel, usage: r.usage as unknown as Record<string, number>, costUsd: cost.toFixed(6),
    staffReviewRequested: options.staffReview, shareRequested: options.share, shareAttribution: options.shareAttribution, shareStatus: options.share ? "pending" : "none" });
  // Map [n] references to the citation list order
  const numberMap = new Map<number, number>(); uniq.forEach((c, i) => { r.data.used.forEach((n) => { if (passages[n - 1]?.itemId === c.itemId) numberMap.set(n, i + 1); }); });
  const text = r.data.answer.replace(/\[(\d+)\]/g, (m, n) => { const k = numberMap.get(Number(n)); return k ? `[${k}]` : ""; });
  return { answer: text, covered: r.data.covered, citations: uniq };
}
