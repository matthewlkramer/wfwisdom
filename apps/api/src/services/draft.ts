import { draftGenerations, eq, getDb, items, materialTypes, typeResources } from "@wfw/db";
import { respond } from "../lib/openai.js";
import { logger } from "../logger.js";
import { getSettings } from "../settings.js";
import { currentBasePrompt } from "./review.js";
import { retrievePassages } from "./search.js";
import { schoolContext } from "./school.js";

/**
 * "Draft it for me": a first draft of a material type from the writer's notes and what they have shared about
 * their school, in the shape the type's guide asks for. Uses the assist model (luna); reviews use sol.
 */
export async function draftForMe(userId: string, typeKey: string, notes: string): Promise<{ text: string; usedSchool: number }> {
  const db = getDb(); const s = await getSettings();
  const [t] = await db.select().from(materialTypes).where(eq(materialTypes.key, typeKey));
  if (!t || !t.active) throw new Error("Unknown material type");
  const base = await currentBasePrompt();
  const school = await schoolContext(userId, 16_000);
  const res = await db.select({ title: items.title, url: items.url }).from(typeResources).innerJoin(items, eq(items.id, typeResources.itemId)).where(eq(typeResources.typeId, t.id)).orderBy(typeResources.sort);
  let passages: { title: string; text: string }[] = [];
  try { passages = (await retrievePassages(`${t.name}: ${t.shortDescription ?? ""} ${notes.slice(0, 800)}`, false, 4)).map((p) => ({ title: p.title, text: p.text.slice(0, 1500) })); } catch (e) { logger.warn({ err: (e as Error).message }, "passage retrieval for draft failed"); }
  const objectives = t.rubric.map((c, i) => `${i + 1}. ${c.criterion}: ${c.description}`).join("\n");
  const system = `You write first drafts for emerging Wildflower teacher leaders. You are drafting a "${t.name}" for the writer, in their voice (first person, warm, specific, plain English, no internal jargon). The draft must follow the standard below. Where a fact is unknown (names, numbers, dates, addresses), write a clear bracketed placeholder like [OPENING MONTH] rather than inventing it. Never promise Foundation guarantees, funding, or legal outcomes. Output only the draft text, no preamble, no commentary, no markdown headings unless the material type calls for them.

Reviewer standards this draft will be judged against (from Wildflower's guidance):
${base.text.slice(0, 4000)}

=== Material type: ${t.name} ===
What good looks like:
${t.guideMd}

Objectives the draft should meet:
${objectives}

About the writer's school (use these facts; prefer them over placeholders):
${school.text || "(nothing shared; use placeholders for school-specific facts)"}

Wildflower source material that may help (do not copy; stay accurate to it):
${passages.map((p) => `--- ${p.title}\n${p.text}`).join("\n\n") || "(none)"}

Connected resources you may mention by name if useful: ${res.map((r) => r.title).join("; ") || "(none)"}`;
  const user = notes.trim() ? `Here are my notes and anything I have written so far. Turn this into a complete draft:\n\n${notes.slice(0, 12_000)}` : "I have no notes yet. Write a complete first draft with placeholders where you need facts from me.";
  const [row] = await db.insert(draftGenerations).values({ userId, typeId: t.id, model: s.assistModel }).returning({ id: draftGenerations.id });
  try {
    const r = await respond({ model: s.assistModel, system, user, maxOutput: 3000, timeoutMs: 120_000 });
    const text = r.text.trim();
    await db.update(draftGenerations).set({ charCount: text.length, usage: r.usage as unknown as Record<string, number>, costUsd: r.cost.toFixed(5) }).where(eq(draftGenerations.id, row!.id));
    return { text, usedSchool: school.count };
  } catch (e) {
    await db.update(draftGenerations).set({ error: (e as Error).message.slice(0, 400) }).where(eq(draftGenerations.id, row!.id));
    throw e;
  }
}
