import { basePromptVersions, desc, eq, getDb, items, materialTypes, submissions, typeResources, users } from "@wfw/db";
import type { ReviewResult } from "@wfw/shared";
import { OpenAIError, respondJson } from "../lib/openai.js";
import { logger } from "../logger.js";
import { getSettings } from "../settings.js";
import { retrievePassages } from "./search.js";

export const REVIEW_SCHEMA = { name: "review", schema: { type: "object", additionalProperties: false,
  required: ["verdict", "one_thing", "summary", "rubric", "strengths", "priority_changes", "line_notes", "example_rewrites", "questions_for_writer", "verify_with_humans", "recommended_resources", "nits"],
  properties: {
    verdict: { type: "string", enum: ["Ready to use", "Nearly ready", "Needs significant work"] },
    one_thing: { type: "string", description: "If the writer fixes only one thing, this. One sentence." },
    summary: { type: "string" },
    rubric: { type: "array", items: { type: "object", additionalProperties: false, required: ["criterion", "score", "note"], properties: { criterion: { type: "string" }, score: { type: "integer", minimum: 1, maximum: 5 }, note: { type: "string" } } } },
    strengths: { type: "array", items: { type: "string" } },
    priority_changes: { type: "array", items: { type: "object", additionalProperties: false, required: ["what", "why", "how"], properties: { what: { type: "string" }, why: { type: "string" }, how: { type: "string" } } } },
    line_notes: { type: "array", items: { type: "object", additionalProperties: false, required: ["quote", "note"], properties: { quote: { type: "string" }, note: { type: "string" } } } },
    example_rewrites: { type: "array", maxItems: 2, items: { type: "object", additionalProperties: false, required: ["original", "rewrite", "why"], properties: { original: { type: "string" }, rewrite: { type: "string" }, why: { type: "string" } } } },
    questions_for_writer: { type: "array", maxItems: 5, items: { type: "string" } },
    verify_with_humans: { type: "array", items: { type: "string" } },
    recommended_resources: { type: "array", items: { type: "object", additionalProperties: false, required: ["title", "url", "why"], properties: { title: { type: "string" }, url: { type: "string" }, why: { type: "string" } } } },
    nits: { type: "array", items: { type: "string" } },
  } } };

export async function currentBasePrompt(): Promise<{ version: number; text: string }> {
  const [row] = await getDb().select().from(basePromptVersions).orderBy(desc(basePromptVersions.version)).limit(1);
  if (!row) throw new Error("No base prompt configured");
  return { version: row.version, text: row.text };
}

export async function buildSystemPrompt(typeId: string, draft: string, opts: { basePrompt?: string; guide?: string; rubric?: { criterion: string; description: string }[]; reviewerNotes?: string } = {}): Promise<{ system: string; typeName: string; typeVersion: number; baseVersion: number; resources: { title: string; url: string }[] }> {
  const db = getDb();
  const [t] = await db.select().from(materialTypes).where(eq(materialTypes.id, typeId));
  if (!t) throw new Error("Unknown material type");
  const base = opts.basePrompt !== undefined ? { version: 0, text: opts.basePrompt } : await currentBasePrompt();
  const res = await db.select({ title: items.title, url: items.url }).from(typeResources).innerJoin(items, eq(items.id, typeResources.itemId)).where(eq(typeResources.typeId, typeId)).orderBy(typeResources.sort);
  const rubric = (opts.rubric ?? t.rubric).map((c, i) => `${i + 1}. ${c.criterion}: ${c.description}`).join("\n");
  // Retrieve Connected passages relevant to the draft so the reviewer can check claims against Wildflower source material.
  let passages: { title: string; url: string; text: string }[] = [];
  try { passages = (await retrievePassages(`${t.name}: ${draft.slice(0, 1500)}`, true, 5)).map((p) => ({ title: p.title, url: p.url, text: p.text.slice(0, 1500) })); } catch (e) { logger.warn({ err: (e as Error).message }, "passage retrieval for review failed"); }
  const system = `${base.text}

=== Material type: ${t.name} ===
What good looks like (the standard for this type):
${opts.guide ?? t.guideMd}

Rubric for this type (score each 1-5):
${rubric}

Reviewer notes for this type:
${opts.reviewerNotes ?? t.reviewerNotes}

Connected resources you may recommend (only these):
${res.map((r) => `- ${r.title} — ${r.url}`).join("\n") || "(none linked yet)"}

Wildflower source material retrieved for this draft (use it to check claims; cite the item title when you rely on it):
${passages.map((p) => `--- ${p.title} (${p.url})\n${p.text}`).join("\n\n") || "(none)"}
`;
  return { system, typeName: t.name, typeVersion: t.version, baseVersion: base.version, resources: res };
}

export async function runReview(submissionId: string): Promise<void> {
  const db = getDb();
  const [sub] = await db.select().from(submissions).where(eq(submissions.id, submissionId));
  if (!sub) return;
  const s = await getSettings();
  const [t] = await db.select().from(materialTypes).where(eq(materialTypes.id, sub.typeId));
  const model = t?.model || s.reviewModel; const effort = (t?.reasoningEffort || s.reviewEffort) as "low" | "medium" | "high";
  await db.update(submissions).set({ status: "running", model, reasoningEffort: effort }).where(eq(submissions.id, submissionId));
  try {
    const built = await buildSystemPrompt(sub.typeId, sub.draftText);
    const r = await respondJson<ReviewResult>({ model, effort, maxOutput: s.maxReviewOutputTokens, system: built.system, user: `Here is the draft submitted as a '${built.typeName}'. Review it.\n\n---\n${sub.draftText}\n---`, schema: REVIEW_SCHEMA, timeoutMs: 300_000 });
    await db.update(submissions).set({ status: "done", review: r.data, verdict: r.data.verdict, usage: r.usage as unknown as Record<string, number>, costUsd: r.cost.toFixed(5), completedAt: new Date(), basePromptVersion: built.baseVersion }).where(eq(submissions.id, submissionId));
  } catch (e) {
    const msg = e instanceof OpenAIError ? e.message : (e as Error).message;
    logger.error({ err: msg, submissionId }, "review failed");
    await db.update(submissions).set({ status: "failed", error: msg.slice(0, 500), completedAt: new Date() }).where(eq(submissions.id, submissionId));
  }
}
export async function submitterOf(submissionId: string) {
  const [r] = await getDb().select({ email: users.email, name: users.name }).from(submissions).innerJoin(users, eq(users.id, submissions.userId)).where(eq(submissions.id, submissionId));
  return r ?? null;
}
