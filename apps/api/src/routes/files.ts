import { Readable } from "node:stream";
import { Router } from "express";
import { and, getDb, isNull, items, sql } from "@wfw/db";
import { requireUser } from "../auth.js";
import { Bloomfire, type BfContent, type BfItem } from "../lib/bloomfire.js";

/**
 * Streams a Connected attachment (image, video, PDF rendering of a document) to a signed-in user.
 * Connected's file URLs are signed and expire within a day, so the current one is fetched on demand and cached briefly.
 */
export const filesRouter = Router();
filesRouter.use(requireUser);

const bf = new Bloomfire();
const cache = new Map<string, { at: number; item: BfItem }>();
const TTL = 20 * 60_000;
async function freshItem(kind: string, sourceId: number): Promise<BfItem> {
  const key = `${kind}:${sourceId}`;
  const c = cache.get(key); if (c && Date.now() - c.at < TTL) return c.item;
  const item = kind === "post" ? await bf.post(sourceId) : kind === "series" ? await bf.series(sourceId) : await bf.question(sourceId);
  cache.set(key, { at: Date.now(), item });
  return item;
}

filesRouter.get("/:contentId", async (req, res) => {
  const contentId = Number(req.params.contentId);
  if (!Number.isFinite(contentId)) { res.status(400).json({ error: "Bad id" }); return; }
  const db = getDb();
  const [row] = await db.select({ kind: items.sourceKind, sourceId: items.sourceId }).from(items).where(and(isNull(items.removedAt), sql`${items.attachments} @> ${JSON.stringify([{ id: contentId }])}::jsonb`)).limit(1);
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  let content: BfContent | undefined;
  try { content = (await freshItem(row.kind, row.sourceId)).contents?.find((c) => c.id === contentId); }
  catch (e) { res.status(502).json({ error: `Connected did not answer: ${(e as Error).message}` }); return; }
  if (!content?.content_url) { res.status(404).json({ error: "File not available" }); return; }
  const headers: Record<string, string> = {};
  if (typeof req.headers.range === "string") headers.Range = req.headers.range;
  const upstream = await fetch(content.content_url, { headers, redirect: "follow" });
  if (!upstream.ok && upstream.status !== 206) { res.status(502).json({ error: `File fetch failed (${upstream.status})` }); return; }
  res.status(upstream.status);
  for (const h of ["content-type", "content-length", "content-range", "accept-ranges", "last-modified", "etag"]) { const v = upstream.headers.get(h); if (v) res.setHeader(h, v); }
  if (!upstream.headers.get("content-type")) res.setHeader("content-type", content.original_content_type ?? "application/octet-stream");
  const name = (content.original_file_name ?? `file-${contentId}`).replace(/[^\w.\- ]+/g, "_");
  res.setHeader("content-disposition", `${req.query.download ? "attachment" : "inline"}; filename="${name}"`);
  res.setHeader("cache-control", "private, max-age=3600");
  if (!upstream.body) { res.end(); return; }
  Readable.fromWeb(upstream.body as never).pipe(res);
});
