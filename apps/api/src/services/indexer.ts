import { and, eq, getDb, inArray, indexRuns, itemChunks, itemMeta, items, placementSeeds, placements, sql, subjobs, typeResourceSeeds, typeResources, materialTypes } from "@wfw/db";
import { Bloomfire, type BfContent, type BfItem } from "../lib/bloomfire.js";
import { extractText } from "../lib/extract.js";
import { fetchGoogleDocText } from "../lib/google-docs.js";
import { embed, respond } from "../lib/openai.js";
import { GOOGLE_DOC_RE, chunk, normalizeWs, sha, stripHtml } from "../lib/text.js";
import { logger } from "../logger.js";
import { getSettings } from "../settings.js";
import { recomputeScores } from "./score.js";
import { loadVectors } from "./vectors.js";

let running: Promise<void> | null = null;
/** Runs left in "running" by a process that died are marked failed so the admin page does not show them as live. */
export async function markStaleRuns(): Promise<void> {
  // Tolerates a database that has not been migrated yet (first boot).
  await getDb().update(indexRuns).set({ status: "failed", error: "Interrupted by a restart", finishedAt: new Date() }).where(eq(indexRuns.status, "running")).catch((e: Error) => logger.warn({ err: e.message }, "could not mark stale runs"));
}
export function isIndexing(): boolean { return running !== null; }

type Kind = "post" | "series" | "question";
interface Prepared { kind: Kind; sourceId: number; title: string; description: string | null; url: string; authorName: string | null; publishedAt: Date | null; sourceUpdatedAt: Date | null; views: number; likes: number; comments: number; seriesTitles: string[]; categories: string[]; audiences: string[]; contentType: string | null; bodyText: string; attachments: { id: number; name: string; type: string; bytes: number; chars: number }[]; linkedDocs: { url: string; kind: string; status: string; chars: number }[]; linkOnly: boolean; hasText: boolean; contentHash: string; }

const MAX_ATTACHMENT_BYTES = 40 * 1024 * 1024;

async function prepare(bf: Bloomfire, kind: Kind, it: BfItem, log: (m: string) => void, opts: { fetchAttachments: boolean }): Promise<Prepared> {
  const title = (it.title ?? it.name ?? it.question ?? "Untitled").trim();
  const url = it.url ?? `https://connected.wildflowerschools.org/${kind === "post" ? "posts" : kind === "series" ? "series" : "questions"}/${it.id}`;
  const parts: string[] = [];
  const body = stripHtml(it.post_body ?? it.explanation ?? "");
  if (body) parts.push(body);
  if (kind === "question") for (const a of it.answers ?? []) { const t = stripHtml(a.text ?? a.body ?? ""); if (t) parts.push(`Answer: ${t}`); }
  if (kind === "series") for (const p of it.posts ?? []) parts.push(`Includes: ${p.title}`);
  const attachments: Prepared["attachments"] = [];
  let attachmentText = "";
  let linkCount = 0;
  for (const c of (it.contents ?? []) as BfContent[]) {
    if (c.type === "TextBlock") { const t = stripHtml(c.text_body); if (t) parts.push(t); continue; }
    if (c.type === "WebLink") { linkCount++; if (c.url) parts.push(`Link: ${c.url}`); continue; }
    if (c.type === "Video" || c.type === "Audio") {
      const tr = c.audio_transcript?.transcript; const name = c.original_file_name ?? c.title ?? "media";
      attachments.push({ id: c.id, name, type: c.type, bytes: c.original_file_size ?? 0, chars: tr?.length ?? 0 });
      if (tr) attachmentText += `\n\nTranscript of ${name}:\n${normalizeWs(tr).slice(0, 60_000)}`;
      continue;
    }
    if (c.type === "PreviewableDocument" || c.type === "Document") {
      const name = c.original_file_name ?? c.title ?? `attachment-${c.id}`;
      let chars = 0;
      if (opts.fetchAttachments && c.content_url && (c.original_file_size ?? 0) <= MAX_ATTACHMENT_BYTES) {
        try { const buf = await bf.download(c.content_url); const { text } = await extractText(buf, buf.subarray(0, 4).toString() === "%PDF" ? `${name}.pdf` : name); chars = text.length; if (text) attachmentText += `\n\nAttachment ${name}:\n${text.slice(0, 80_000)}`; }
        catch (e) { log(`attachment ${c.id} (${name}) failed: ${(e as Error).message}`); }
      }
      attachments.push({ id: c.id, name, type: c.type, bytes: c.original_file_size ?? 0, chars });
      continue;
    }
    if (c.type === "Image") continue;
  }
  const linkedDocs: Prepared["linkedDocs"] = [];
  const seen = new Set<string>();
  for (const m of (it.post_body ?? "").matchAll(GOOGLE_DOC_RE)) {
    const kindG = m[1] ?? "document", id = m[2] ?? ""; if (!id || seen.has(id)) continue; seen.add(id);
    if (seen.size > 12) break;
    const r = await fetchGoogleDocText(kindG, id);
    linkedDocs.push({ url: r.url, kind: r.kind, status: r.status, chars: r.text.length });
    if (r.text) attachmentText += `\n\nLinked ${kindG}:\n${r.text.slice(0, 60_000)}`;
  }
  for (const c of (it.contents ?? []) as BfContent[]) if (c.type === "WebLink" && c.url) for (const m of c.url.matchAll(GOOGLE_DOC_RE)) { const id = m[2] ?? ""; if (!id || seen.has(id)) continue; seen.add(id); const r = await fetchGoogleDocText(m[1] ?? "document", id); linkedDocs.push({ url: r.url, kind: r.kind, status: r.status, chars: r.text.length }); if (r.text) attachmentText += `\n\nLinked ${m[1]}:\n${r.text.slice(0, 60_000)}`; }
  const bodyText = normalizeWs([parts.join("\n\n"), attachmentText].filter(Boolean).join("\n\n")).slice(0, 400_000);
  const cats = (it.taxa ?? []).filter((t) => t.taxonomy_name === "Category" && t.name !== "All Hubs").map((t) => t.name_path.join(" > "));
  const auds = (it.taxa ?? []).filter((t) => t.taxonomy_name === "Audience" && t.name !== "All Hubs").map((t) => t.name);
  const realText = body.length + attachmentText.length;
  return {
    kind, sourceId: it.id, title, description: stripHtml(it.description) || null, url, authorName: it.author ? `${it.author.first_name ?? ""} ${it.author.last_name ?? ""}`.trim() || null : null,
    publishedAt: it.published_at ? new Date(it.published_at) : null, sourceUpdatedAt: it.updated_at ? new Date(it.updated_at) : null,
    views: it.views_count ?? 0, likes: it.likes_count ?? 0, comments: it.comments_count ?? 0,
    seriesTitles: (it.series ?? []).map((s) => s.title), categories: cats, audiences: auds, contentType: null,
    bodyText, attachments, linkedDocs, linkOnly: realText < 200 && (linkCount > 0 || linkedDocs.length > 0), hasText: realText >= 300,
    contentHash: sha(`${title}|${it.description ?? ""}|${bodyText}`),
  };
}

export async function runReindex(triggeredBy: string, opts: { full?: boolean; limit?: number } = {}): Promise<string> {
  if (running) throw new Error("A re-index is already running");
  const db = getDb();
  await markStaleRuns();
  const [run] = await db.insert(indexRuns).values({ kind: "reindex", triggeredBy }).returning({ id: indexRuns.id });
  const runId = run!.id;
  const lines: string[] = [];
  const clean = (m: string) => m.replace(/\u0000/g, "").replace(/\s+/g, " ").slice(0, 400);
  const log = (m: string) => { const c = clean(m); lines.push(`${new Date().toISOString().slice(11, 19)} ${c}`); logger.info({ runId }, c); };
  const flush = (stats: Record<string, unknown>) => db.update(indexRuns).set({ log: lines.slice(-400).join("\n"), stats }).where(eq(indexRuns.id, runId));
  running = (async () => {
    const stats: Record<string, unknown> = { fetched: 0, changed: 0, unchanged: 0, removed: 0, embedded: 0, summarized: 0, errors: 0 };
    try {
      const s = await getSettings(true);
      const bf = new Bloomfire(); await bf.login(); log("logged in to Connected");
      const lists: { kind: Kind; ids: { id: number; updated_at: string }[] }[] = [
        { kind: "post", ids: await bf.listPosts() }, { kind: "series", ids: await bf.listSeries() }, { kind: "question", ids: await bf.listQuestions() },
      ];
      log(`catalog: ${lists.map((l) => `${l.ids.length} ${l.kind}s`).join(", ")}`);
      const existing = await db.select({ id: items.id, kind: items.sourceKind, sourceId: items.sourceId, hash: items.contentHash, upd: items.sourceUpdatedAt, removedAt: items.removedAt }).from(items);
      const byKey = new Map(existing.map((e) => [`${e.kind}:${e.sourceId}`, e]));
      const seenKeys = new Set<string>();
      const changedIds: string[] = [];
      let processed = 0;
      const work: { kind: Kind; ref: { id: number; updated_at: string } }[] = [];
      for (const { kind, ids } of lists) for (const ref of ids.slice(0, opts.limit ?? ids.length)) work.push({ kind, ref });
      let cursor = 0;
      const worker = async () => {
        while (cursor < work.length) {
          const { kind, ref } = work[cursor++]!;
          const key = `${kind}:${ref.id}`; seenKeys.add(key);
          const prev = byKey.get(key);
          const updated = ref.updated_at ? new Date(ref.updated_at) : null;
          const skip = !opts.full && prev && !prev.removedAt && prev.upd && updated && prev.upd.getTime() === updated.getTime();
          try {
            const detail = kind === "post" ? await bf.post(ref.id) : kind === "series" ? await bf.series(ref.id) : await bf.question(ref.id);
            (stats.fetched as number)++;
            if (detail.published === false || detail.public === false) {
              // Drafts and group-restricted items are not shown to the whole community in Connected, so they are not indexed here.
              (stats.skippedUnpublished as number) = ((stats.skippedUnpublished as number) ?? 0) + 1;
              seenKeys.delete(key);
              continue;
            }
            if (skip) {
              await db.update(items).set({ views: detail.views_count ?? 0, likes: detail.likes_count ?? 0, comments: detail.comments_count ?? 0, indexedAt: new Date() }).where(eq(items.id, prev.id));
              (stats.unchanged as number)++;
            } else {
              const p = await prepare(bf, kind, detail, log, { fetchAttachments: true });
              const [row] = await db.insert(items).values({ sourceKind: kind, sourceId: p.sourceId, title: p.title, description: p.description, url: p.url, authorName: p.authorName, publishedAt: p.publishedAt, sourceUpdatedAt: p.sourceUpdatedAt, views: p.views, likes: p.likes, comments: p.comments, seriesTitles: p.seriesTitles, categories: p.categories, audiences: p.audiences, bodyText: p.bodyText, attachments: p.attachments, linkedDocs: p.linkedDocs, linkOnly: p.linkOnly, hasText: p.hasText, contentHash: p.contentHash, indexedAt: new Date(), removedAt: null })
                .onConflictDoUpdate({ target: [items.sourceKind, items.sourceId], set: { title: p.title, description: p.description, url: p.url, authorName: p.authorName, publishedAt: p.publishedAt, sourceUpdatedAt: p.sourceUpdatedAt, views: p.views, likes: p.likes, comments: p.comments, seriesTitles: p.seriesTitles, categories: p.categories, audiences: p.audiences, bodyText: p.bodyText, attachments: p.attachments, linkedDocs: p.linkedDocs, linkOnly: p.linkOnly, hasText: p.hasText, contentHash: p.contentHash, indexedAt: new Date(), removedAt: null } }).returning({ id: items.id });
              if (row && (!prev || prev.hash !== p.contentHash)) changedIds.push(row.id);
              (stats.changed as number)++;
            }
          } catch (e) { (stats.errors as number)++; log(`${key} failed: ${(e as Error).message}`); }
          if (++processed % 50 === 0) { log(`${processed} items processed`); await flush(stats); }
        }
      };
      await Promise.all([worker(), worker(), worker(), worker()]);
      // items no longer in Connected
      const gone = existing.filter((e) => !seenKeys.has(`${e.kind}:${e.sourceId}`) && !e.removedAt && !opts.limit);
      if (gone.length) { await db.update(items).set({ removedAt: new Date() }).where(inArray(items.id, gone.map((g) => g.id))); stats.removed = gone.length; log(`${gone.length} items no longer in Connected marked removed`); }
      await applySeeds(log);
      await flush(stats);
      // chunk + embed changed items (and anything missing embeddings)
      const missing = await db.select({ id: items.id }).from(items).where(sql`${items.removedAt} is null and not exists (select 1 from ${itemChunks} c where c.item_id = ${items.id} and c.embedding is not null)`);
      const toEmbed = [...new Set([...changedIds, ...missing.map((m) => m.id)])];
      log(`embedding ${toEmbed.length} items with ${s.embeddingModel}`);
      stats.embedded = await embedItems(toEmbed, s.embeddingModel, log);
      await flush(stats);
      const toSummarize = await db.select({ id: items.id }).from(items).where(sql`${items.removedAt} is null and (${items.summary} is null or ${items.summaryHash} is distinct from ${items.contentHash})`);
      log(`summarizing ${toSummarize.length} items with ${s.assistModel}`);
      stats.summarized = await summarizeItems(toSummarize.map((t) => t.id), s.assistModel, log);
      const sc = await recomputeScores(); stats.scored = sc.items; log(`scores recomputed for ${sc.items} items`);
      await loadVectors(true);
      await db.update(indexRuns).set({ status: "done", finishedAt: new Date(), stats, log: lines.slice(-400).join("\n") }).where(eq(indexRuns.id, runId));
      log("done");
    } catch (e) {
      log(`FAILED: ${(e as Error).message}`);
      await db.update(indexRuns).set({ status: "failed", finishedAt: new Date(), error: (e as Error).message, stats, log: lines.slice(-400).join("\n") }).where(eq(indexRuns.id, runId));
    } finally { running = null; }
  })();
  return runId;
}

export async function applySeeds(log: (m: string) => void = () => {}): Promise<void> {
  const db = getDb();
  const subs = await db.select({ id: subjobs.id, key: subjobs.key }).from(subjobs);
  const subByKey = new Map(subs.map((s) => [s.key, s.id]));
  const pending = await db.select().from(placementSeeds).where(eq(placementSeeds.applied, false));
  let n = 0;
  for (const seed of pending) {
    const [it] = await db.select({ id: items.id }).from(items).where(and(eq(items.sourceKind, seed.sourceKind), eq(items.sourceId, seed.sourceId)));
    if (!it) continue;
    const already = await db.select({ id: placements.id }).from(placements).where(eq(placements.itemId, it.id)).limit(1);
    if (already.length === 0) {
      const prim = subByKey.get(seed.primarySubjob);
      if (prim) await db.insert(placements).values({ itemId: it.id, subjobId: prim, isPrimary: true, source: "model", why: seed.why }).onConflictDoNothing();
      for (const k of seed.secondarySubjobs) { const sid = subByKey.get(k); if (sid && sid !== prim) await db.insert(placements).values({ itemId: it.id, subjobId: sid, isPrimary: false, source: "model", why: seed.why }).onConflictDoNothing(); }
      await db.insert(itemMeta).values({ itemId: it.id, stages: seed.stages, modelOutdated: seed.outdated, modelOutdatedReason: seed.outdatedReason, reviewStatus: seed.outdated ? "pending" : "none" })
        .onConflictDoUpdate({ target: itemMeta.itemId, set: { stages: seed.stages, modelOutdated: seed.outdated, modelOutdatedReason: seed.outdatedReason, reviewStatus: sql`case when ${itemMeta.reviewStatus} = 'none' and ${seed.outdated} then 'pending' else ${itemMeta.reviewStatus} end` } });
      if (seed.contentType) await db.update(items).set({ contentType: sql`coalesce(${items.contentType}, ${seed.contentType})` }).where(eq(items.id, it.id));
    }
    await db.update(placementSeeds).set({ applied: true }).where(eq(placementSeeds.id, seed.id));
    n++;
  }
  if (n) log(`applied ${n} placement seeds`);
  const trs = await db.select({ typeKey: typeResourceSeeds.typeKey, sourceId: typeResourceSeeds.sourceId, sort: typeResourceSeeds.sort, id: typeResourceSeeds.id }).from(typeResourceSeeds);
  const types = await db.select({ id: materialTypes.id, key: materialTypes.key }).from(materialTypes);
  const typeByKey = new Map(types.map((t) => [t.key, t.id]));
  let m = 0;
  for (const tr of trs) {
    const tid = typeByKey.get(tr.typeKey); if (!tid) continue;
    const [it] = await db.select({ id: items.id }).from(items).where(and(eq(items.sourceKind, "post"), eq(items.sourceId, tr.sourceId)));
    if (!it) continue;
    const r = await db.insert(typeResources).values({ typeId: tid, itemId: it.id, sort: tr.sort }).onConflictDoNothing();
    m += r.rowCount ?? 0;
    await db.delete(typeResourceSeeds).where(eq(typeResourceSeeds.id, tr.id));
  }
  if (m) log(`linked ${m} seeded type resources`);
}

async function embedItems(ids: string[], model: string, log: (m: string) => void): Promise<number> {
  const db = getDb(); let embedded = 0;
  for (let i = 0; i < ids.length; i += 20) {
    const batch = ids.slice(i, i + 20);
    const rows = await db.select({ id: items.id, title: items.title, description: items.description, body: items.bodyText }).from(items).where(inArray(items.id, batch));
    const texts: { itemId: string; ord: number; text: string; hash: string }[] = [];
    for (const r of rows) {
      const head = `${r.title}\n${r.description ?? ""}`.trim();
      const chunks = chunk(r.body ?? "", 1600, 200);
      const list = chunks.length ? chunks.map((c, ord) => ({ itemId: r.id, ord, text: `${head}\n\n${c}`, hash: sha(`${head}|${c}`) })) : [{ itemId: r.id, ord: 0, text: head, hash: sha(head) }];
      texts.push(...list.slice(0, 40));
    }
    const existing = await db.select({ itemId: itemChunks.itemId, hash: itemChunks.textHash, emb: itemChunks.embedding }).from(itemChunks).where(inArray(itemChunks.itemId, batch));
    const have = new Map(existing.filter((e) => e.emb).map((e) => [`${e.itemId}:${e.hash}`, e.emb as number[]]));
    const need = texts.filter((t) => !have.has(`${t.itemId}:${t.hash}`));
    let vectors: number[][] = [];
    if (need.length) { try { vectors = (await embed(need.map((t) => t.text), model)).vectors; } catch (e) { log(`embedding batch failed: ${(e as Error).message}`); continue; } }
    await db.delete(itemChunks).where(inArray(itemChunks.itemId, rows.map((r) => r.id)));
    let k = 0;
    for (const t of texts) {
      const vec = have.get(`${t.itemId}:${t.hash}`) ?? vectors[k++];
      await db.insert(itemChunks).values({ itemId: t.itemId, ord: t.ord, text: t.text, textHash: t.hash, embedding: vec ?? null, model });
    }
    embedded += rows.length;
    if (embedded % 100 < 20) log(`embedded ${embedded}/${ids.length}`);
  }
  return embedded;
}

async function summarizeItems(ids: string[], model: string, log: (m: string) => void): Promise<number> {
  const db = getDb(); let n = 0;
  const SYSTEM = "Write a two-sentence plain-language summary of this Connected item for a Wildflower teacher leader deciding whether to open it: what it is, and what they would use it for. No marketing tone, no preamble.";
  const worker = async (id: string) => {
    const [r] = await db.select({ title: items.title, description: items.description, body: items.bodyText, hash: items.contentHash }).from(items).where(eq(items.id, id));
    if (!r) return;
    const text = `Title: ${r.title}\nDescription: ${r.description ?? ""}\n\n${(r.body ?? "").slice(0, 3500)}`;
    try { const out = await respond({ model, system: SYSTEM, user: text, effort: "low", maxOutput: 200 }); await db.update(items).set({ summary: out.text.trim(), summaryHash: r.hash }).where(eq(items.id, id)); n++; }
    catch (e) { log(`summary ${id} failed: ${(e as Error).message}`); }
  };
  for (let i = 0; i < ids.length; i += 6) { await Promise.all(ids.slice(i, i + 6).map(worker)); if (n && n % 60 < 6) log(`summarized ${n}/${ids.length}`); }
  return n;
}
