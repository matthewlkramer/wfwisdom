import { getDb, itemChunks, items, sql } from "@wfw/db";
import { logger } from "../logger.js";

interface Entry { itemId: string; chunkId: string; ord: number; vec: Float32Array; }
let entries: Entry[] = [];
let loadedAt = 0;
let loading: Promise<void> | null = null;

/**
 * Load the chunk embeddings into memory. A forced load (after indexing) is awaited; the periodic refresh runs in the
 * background so a search never waits the several seconds the load takes.
 */
export async function loadVectors(force = false): Promise<void> {
  if (loading) return force || !entries.length ? loading : undefined;
  if (!force && entries.length) { if (Date.now() - loadedAt > 30 * 60_000) void reload(); return; }
  return reload();
}
async function reload(): Promise<void> {
  if (loading) return loading;
  loading = (async () => {
    const db = getDb();
    const rows = await db.select({ itemId: itemChunks.itemId, chunkId: itemChunks.id, ord: itemChunks.ord, emb: itemChunks.embedding }).from(itemChunks).innerJoin(items, sql`${items.id} = ${itemChunks.itemId} and ${items.removedAt} is null`).where(sql`${itemChunks.embedding} is not null`);
    const next: Entry[] = [];
    for (const r of rows) { if (!r.emb) continue; const v = Float32Array.from(r.emb); let n = 0; for (const x of v) n += x * x; n = Math.sqrt(n) || 1; for (let i = 0; i < v.length; i++) v[i] = (v[i] ?? 0) / n; next.push({ itemId: r.itemId, chunkId: r.chunkId, ord: r.ord, vec: v }); }
    entries = next; loadedAt = Date.now();
    logger.info({ chunks: entries.length }, "vector index loaded");
  })().finally(() => { loading = null; });
  return loading;
}
export function vectorCount(): number { return entries.length; }
/** Changes whenever the index is reloaded; cached search results are keyed on it. */
export function vectorsVersion(): number { return loadedAt; }

/** Cosine similarity search per item: half the item's head chunk (title, description, opening) and half its best chunk,
 *  so long documents that mention everything do not outrank focused ones. */
export function searchVectors(query: number[], k = 40): { itemId: string; chunkId: string; score: number }[] {
  const q = Float32Array.from(query); let n = 0; for (const x of q) n += x * x; n = Math.sqrt(n) || 1;
  const best = new Map<string, { chunkId: string; max: number; head: number }>();
  for (const e of entries) {
    let dot = 0; const v = e.vec; const len = Math.min(v.length, q.length);
    for (let i = 0; i < len; i++) dot += (v[i] ?? 0) * (q[i] ?? 0);
    const s = dot / n;
    const cur = best.get(e.itemId) ?? { chunkId: e.chunkId, max: -1, head: -1 };
    if (s > cur.max) { cur.max = s; cur.chunkId = e.chunkId; }
    if (e.ord === 0) cur.head = s;
    best.set(e.itemId, cur);
  }
  return [...best.entries()].map(([itemId, b]) => ({ itemId, chunkId: b.chunkId, score: b.head >= 0 ? 0.5 * b.head + 0.5 * b.max : b.max })).sort((a, b) => b.score - a.score).slice(0, k);
}
