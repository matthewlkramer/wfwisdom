import { and, eq, getDb, inArray, itemChunks, itemMeta, items, jobs, placements, sql, subjobs } from "@wfw/db";
import type { ItemSummary } from "@wfw/shared";
import { embed, respondJson, respond } from "../lib/openai.js";
import { logger } from "../logger.js";
import { getSettings } from "../settings.js";
import { itemsByIds, toSummary, visibleWhere, type ItemRow } from "./items.js";
import { loadVectors, searchVectors, vectorCount } from "./vectors.js";

const REWRITE_SYSTEM = (jobs: { key: string; name: string }[]) => `You rewrite a teacher leader's search into a precise query for Wildflower Schools' knowledge base (Connected). Expand shorthand (SSJ = School Startup Journey, TL = teacher leader, ETL = emerging teacher leader, ops guide, hub, flexible tuition, 501c3, TC = Transparent Classroom). Keep the query under 20 words and do not add topics the searcher did not ask about. Also pick the one job the search is about, or "none".
Jobs: ${jobs.map((j) => `${j.key} = ${j.name}`).join("; ")}
Return JSON {"query": string, "keywords": string[] (3-6), "job": string}.`;
const REWRITE_SCHEMA = { name: "rewrite", schema: { type: "object", additionalProperties: false, required: ["query", "keywords", "job"], properties: { query: { type: "string" }, keywords: { type: "array", items: { type: "string" } }, job: { type: "string" } } } };
const EXPLAIN_SYSTEM = `For each numbered Connected item, write one honest sentence (max 20 words) telling a teacher leader why it matches their search, or say plainly that it only partly matches and what it actually covers. Return JSON {"lines": string[]} with exactly one line per item, in order.`;
const EXPLAIN_SCHEMA = { name: "explain", schema: { type: "object", additionalProperties: false, required: ["lines"], properties: { lines: { type: "array", items: { type: "string" } } } } };

export interface SearchResponse { query: string; rewritten: string | null; mode: "semantic" | "keyword"; results: ItemSummary[]; }

export async function search(query: string, opts: { staff: boolean; limit?: number; explain?: boolean; userId?: string | null }): Promise<SearchResponse> {
  const s = await getSettings();
  const db = getDb();
  const limit = opts.limit ?? 10;
  let rewritten: string | null = null; let keywords: string[] = []; let jobKey: string | null = null;
  let mode: SearchResponse["mode"] = "semantic";
  let ranked: { itemId: string; rel: number }[] = [];
  try {
    if (!s.killSwitch) {
      const jobList = await db.select({ key: jobs.key, name: jobs.name }).from(jobs).where(eq(jobs.hidden, false));
      const rw = await respondJson<{ query: string; keywords: string[]; job: string }>({ model: s.assistModel, system: REWRITE_SYSTEM(jobList), user: query, schema: REWRITE_SCHEMA, maxOutput: 200, timeoutMs: 15_000 });
      rewritten = rw.data.query; keywords = rw.data.keywords; jobKey = jobList.some((j) => j.key === rw.data.job) ? rw.data.job : null;
    }
    await loadVectors();
    if (vectorCount() > 0 && !s.killSwitch) {
      const { vectors } = await embed(rewritten ? [query, rewritten] : [query], s.embeddingModel);
      const v0 = vectors[0]; const v1 = vectors[1];
      const v = v0 && v1 ? v0.map((x, i) => (x + (v1[i] ?? 0)) / 2) : v0;
      if (v) ranked = searchVectors(v, 60).map((r) => ({ itemId: r.itemId, rel: r.score }));
    }
  } catch (e) { logger.warn({ err: (e as Error).message }, "semantic search unavailable, falling back to keyword"); }
  // Hybrid: fuse semantic ranks with keyword (full-text) ranks by reciprocal rank fusion, so items that match on both rise.
  const q = [query, rewritten ?? "", ...keywords].filter(Boolean).join(" ");
  const ftsRows = await db.select({ id: items.id, rank: sql<number>`ts_rank_cd(${sql.raw('"items"."fts"')}, websearch_to_tsquery('english', ${q}))` }).from(items).leftJoin(itemMeta, eq(itemMeta.itemId, items.id))
    .where(and(visibleWhere(opts.staff), sql`${sql.raw('"items"."fts"')} @@ websearch_to_tsquery('english', ${q})`)).orderBy(sql`2 desc`).limit(60).catch(() => [] as { id: string; rank: number }[]);
  if (ranked.length === 0) {
    mode = "keyword";
    ranked = ftsRows.map((r) => ({ itemId: r.id, rel: Number(r.rank) }));
    if (ranked.length === 0) {
      const like = await db.select({ id: items.id }).from(items).leftJoin(itemMeta, eq(itemMeta.itemId, items.id)).where(and(visibleWhere(opts.staff), sql`lower(${items.title}) like ${"%" + query.toLowerCase() + "%"}`)).limit(30);
      ranked = like.map((r) => ({ itemId: r.id, rel: 0.5 }));
    }
  } else {
    const fused = new Map<string, number>();
    ranked.forEach((r, i) => fused.set(r.itemId, (fused.get(r.itemId) ?? 0) + 1 / (30 + i)));
    ftsRows.forEach((r, i) => fused.set(r.id, (fused.get(r.id) ?? 0) + 0.8 / (30 + i)));
    ranked = [...fused.entries()].map(([itemId, rel]) => ({ itemId, rel })).sort((a, b) => b.rel - a.rel).slice(0, 60);
  }
  const map = await itemsByIds(ranked.map((r) => r.itemId), opts.staff);
  const inJob = new Set<string>();
  if (jobKey && ranked.length) {
    const rows = await db.select({ itemId: placements.itemId }).from(placements).innerJoin(subjobs, eq(subjobs.id, placements.subjobId)).innerJoin(jobs, eq(jobs.id, subjobs.jobId)).where(and(eq(jobs.key, jobKey), inArray(placements.itemId, ranked.map((r) => r.itemId))));
    for (const r of rows) inJob.add(r.itemId);
  }
  const maxRel = Math.max(...ranked.map((r) => r.rel), 1e-6); const minRel = Math.min(...ranked.map((r) => r.rel), maxRel);
  const terms = [query, ...keywords].join(" ").toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 3);
  const scored = ranked.filter((r) => map.has(r.itemId)).map((r) => {
    const it = map.get(r.itemId) as ItemRow;
    const rel = maxRel > minRel ? (r.rel - minRel) / (maxRel - minRel) : 1; // spread relevance across the candidate set
    const title = it.title.toLowerCase(); const hits = terms.filter((t) => title.includes(t)).length;
    const final = rel * (0.8 + 0.2 * (it.score / 100)) + 0.08 * Math.min(hits, 3) + (inJob.has(it.id) ? 0.15 : 0) - (it.dated ? 0.1 : 0);
    return { it, final };
  }).sort((a, b) => b.final - a.final).slice(0, limit);
  let lines: string[] = [];
  if (opts.explain !== false && scored.length && !s.killSwitch) {
    try {
      const user = `Search: ${query}\n\n${scored.map((r, i) => `${i + 1}. ${r.it.title}\n${(r.it.summary ?? r.it.description ?? "").slice(0, 300)}`).join("\n\n")}`;
      const ex = await respondJson<{ lines: string[] }>({ model: s.assistModel, system: EXPLAIN_SYSTEM, user, schema: EXPLAIN_SCHEMA, maxOutput: 900, timeoutMs: 20_000 });
      lines = ex.data.lines;
    } catch (e) { logger.warn({ err: (e as Error).message }, "explanations unavailable"); }
  }
  return { query, rewritten, mode, results: scored.map((r, i) => toSummary(r.it, lines[i] ?? null)) };
}

/** Retrieve passages for chat: best chunks with their item titles. */
export async function retrievePassages(question: string, staff: boolean, k = 8): Promise<{ itemId: string; title: string; url: string; text: string }[]> {
  const s = await getSettings();
  await loadVectors();
  const db = getDb();
  let hits: { itemId: string; chunkId: string }[] = [];
  if (vectorCount() > 0) { const { vectors } = await embed([question], s.embeddingModel); const v = vectors[0]; if (v) hits = searchVectors(v, k * 2); }
  const map = await itemsByIds(hits.map((h) => h.itemId), staff);
  const chosen = hits.filter((h) => map.has(h.itemId)).slice(0, k);
  if (!chosen.length) return [];
  const chunks = await db.select({ id: itemChunks.id, text: itemChunks.text }).from(itemChunks).where(inArray(itemChunks.id, chosen.map((c) => c.chunkId)));
  const textById = new Map(chunks.map((r) => [r.id, r.text]));
  return chosen.map((c) => { const it = map.get(c.itemId)!; return { itemId: it.id, title: it.title, url: it.url, text: (textById.get(c.chunkId) ?? "").slice(0, 2500) }; });
}
export { respond };
