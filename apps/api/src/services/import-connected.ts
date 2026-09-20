import { and, desc, eq, getDb, indexRuns, items, sql, users } from "@wfw/db";
import { env } from "../env.js";
import { Bloomfire, type BfContent, type BfItem } from "../lib/bloomfire.js";
import { extractText } from "../lib/extract.js";
import { buildBodyHtml, nativeMediaHtml, replaceMediaFigures, type NativeAttachment } from "../lib/html.js";
import { normalizeWs, stripHtml } from "../lib/text.js";
import { logger } from "../logger.js";
import { getSettings, setSetting } from "../settings.js";
import { embedItems, isIndexing, summarizeItems } from "./indexer.js";
import { convertTarget, ensureFolder, googleKindOfMime, googleUrl, guessMime, isGoogleAppsMime, refreshNativeItem, uploadToDrive, uploadToDriveStream, type DriveMeta, type GoogleKind, type NativeKind } from "./native.js";
import { loadVectors } from "./vectors.js";

/**
 * Moves everything that was mirrored from Connected into native items so Connected can be switched off.
 *
 * Each post keeps its item id (placements, curation, votes and scores stay). Its files go to a folder of its own in
 * the Wisdom Drive folder (Office files become Google Docs, Slides or Sheets; PDFs, images, audio and video stay
 * files). A post with real body text becomes a Google Doc made from that text; a post that is mostly one document
 * points at that document; anything else keeps its short body as an intro above its files. Series become native
 * series over the imported posts; questions keep the question and its answers as a page.
 *
 * The run is resumable: an item is skipped once imported_at is set, and files already uploaded for a failed item
 * are reused on the next attempt. When nothing is left, Connected sync is switched off.
 */
type Kind = "post" | "series" | "question";
type StoredAttachment = NativeAttachment & { chars?: number; sourceContentId?: number | null };
const MEDIA_TYPES = ["Image", "Video", "Audio", "PreviewableDocument", "Document"];
const BUFFER_LIMIT = 64 * 1024 * 1024;
/** Below this much of the post's own text, the post is not worth a Google Doc of its own. */
const DOC_THRESHOLD = 400;
const IMPORT_FOLDER = "Connected import";

let running: Promise<void> | null = null;
export const isImporting = () => running !== null;

const pendingWhere = sql`${items.sourceKind} in ('post','series','question') and ${items.removedAt} is null and ${items.importedAt} is null`;
export async function importStatus() {
  const db = getDb();
  const [c] = await db.select({
    remainingPosts: sql<number>`count(*) filter (where ${items.sourceKind} = 'post' and ${items.removedAt} is null and ${items.importedAt} is null)::int`,
    remainingSeries: sql<number>`count(*) filter (where ${items.sourceKind} = 'series' and ${items.removedAt} is null and ${items.importedAt} is null)::int`,
    remainingQuestions: sql<number>`count(*) filter (where ${items.sourceKind} = 'question' and ${items.removedAt} is null and ${items.importedAt} is null)::int`,
    imported: sql<number>`count(*) filter (where ${items.importedAt} is not null)::int`,
    failed: sql<number>`count(*) filter (where ${items.importError} is not null and ${items.importedAt} is null)::int`,
    files: sql<number>`coalesce(sum(jsonb_array_length(${items.nativeAttachments})) filter (where ${items.importedAt} is not null), 0)::int`,
  }).from(items);
  const failed = await db.select({ id: items.id, title: items.title, kind: items.sourceKind, error: items.importError }).from(items).where(and(sql`${items.importError} is not null`, sql`${items.importedAt} is null`)).orderBy(items.title).limit(100);
  const lastRuns = await db.select().from(indexRuns).where(eq(indexRuns.kind, "import")).orderBy(desc(indexRuns.startedAt)).limit(5);
  const s = await getSettings(true);
  return { counts: c!, failed, running: isImporting(), lastRuns, connectedSyncEnabled: s.connectedSyncEnabled, driveReady: !!env.googleServiceAccountJson && !!env.googleSharedDriveId };
}

const kindOfContent = (c: BfContent) => c.type === "Image" ? "image" : c.type === "Video" ? "video" : c.type === "Audio" ? "audio" : "document";
const cleanName = (s: string) => s.replace(/[\\/:*?"<>|\u0000]+/g, " ").replace(/\s+/g, " ").trim();
const absLinks = (html: string) => html.replace(/href="\/(c|item)\//g, `href="${env.appBaseUrl}/$1/`);
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));

interface Stats { imported: number; failed: number; filesUploaded: number; bytesUploaded: number; embedded?: number; summarized?: number }
interface Ctx { bf: Bloomfire; root: string; userByName: Map<string, string | null>; log: (m: string) => void; stats: Stats; dryRun: boolean }
type Row = typeof items.$inferSelect;

/** Upload one Connected file into the item's folder, returning what to store; reuses a file from an earlier attempt. */
async function importFile(ctx: Ctx, c: BfContent, folder: string | null, prior: StoredAttachment | undefined): Promise<{ att: StoredAttachment; meta: DriveMeta | null; text: string }> {
  const name = cleanName(c.original_file_name ?? c.title ?? `file-${c.id}`) || `file-${c.id}`;
  const declared = guessMime(name, c.original_content_type);
  const size = c.original_file_size ?? 0;
  const transcript = c.audio_transcript?.transcript ? `Transcript of ${name}:\n${normalizeWs(c.audio_transcript.transcript).slice(0, 60_000)}` : "";
  if (prior) return { att: prior, meta: null, text: transcript };
  const kind = kindOfContent(c);
  if (ctx.dryRun) return { att: { driveId: `dry-${c.id}`, name, mime: (kind === "document" && convertTarget(declared)) || declared, bytes: size, kind, chars: 0, sourceContentId: c.id }, meta: null, text: transcript };
  // The file as uploaded (a Word file rather than its PDF preview) when Connected still has it; the rendering otherwise.
  const src = (await ctx.bf.originalUrl(c.id)) ?? c.content_url;
  if (!src) throw new Error(`file ${c.id} (${name}) has no download URL`);
  let meta: DriveMeta; let text = transcript;
  if (kind === "video" || kind === "audio" || size > BUFFER_LIMIT) {
    const r = await ctx.bf.open(src);
    const total = Number(r.headers.get("content-length")) || size || null;
    meta = await uploadToDriveStream(r.body!, name, guessMime(name, r.headers.get("content-type")?.split(";")[0]) === "application/octet-stream" ? declared : guessMime(name, r.headers.get("content-type")?.split(";")[0]), total, { parent: folder ?? undefined });
  } else {
    const buf = await ctx.bf.download(src, 600_000);
    // Trust the bytes over the label: Connected sometimes serves a PDF rendering under the original name.
    const isPdf = buf.subarray(0, 4).toString() === "%PDF";
    const mime = isPdf ? "application/pdf" : declared;
    const fileName = isPdf && !/\.pdf$/i.test(name) ? `${name.replace(/\.[a-z0-9]+$/i, "")}.pdf` : name;
    meta = await uploadToDrive(buf, fileName, mime, kind === "document", { parent: folder ?? undefined });
    if (kind === "document") { try { text = (await extractText(buf, fileName, mime)).text.slice(0, 80_000); } catch { text = ""; } }
  }
  ctx.stats.filesUploaded++; ctx.stats.bytesUploaded += size;
  return { att: { driveId: meta.id, name: meta.name || name, mime: meta.mimeType || declared, bytes: size, kind, chars: text.length, sourceContentId: c.id }, meta, text: text ? (kind === "document" ? `Attachment ${name}:\n${text}` : text) : "" };
}

async function importPostOrQuestion(ctx: Ctx, row: Row, kind: "post" | "question", detail: BfItem): Promise<void> {
  const db = getDb();
  const title = row.title;
  const contents = ((detail.contents ?? []) as BfContent[]).filter((c) => MEDIA_TYPES.includes(c.type));
  const bodyHtml = buildBodyHtml(kind, detail);
  const ownWords = normalizeWs(stripHtml(replaceMediaFigures(bodyHtml, () => ""))).length;
  const wantsDoc = kind === "post" && ownWords >= DOC_THRESHOLD;
  const folderName = cleanName(`${title.slice(0, 80)} (${kind} ${row.sourceId})`);
  let folder = row.importedFrom?.folderId ?? null;
  if (!folder && !ctx.dryRun && (contents.length || wantsDoc)) {
    folder = await ensureFolder(folderName, ctx.root);
    // Remembered at once so a retry after a failure reuses the folder instead of making another.
    await db.update(items).set({ importedFrom: { kind, sourceId: row.sourceId, url: row.url, folderId: folder } }).where(eq(items.id, row.id));
  }
  // Files first, saving progress as each lands so a failure later does not upload them twice.
  const prior = new Map((row.nativeAttachments ?? []).map((a) => [a.sourceContentId ?? -1, a as StoredAttachment]));
  const uploaded: { att: StoredAttachment; meta: DriveMeta | null; text: string }[] = [];
  for (const c of contents) {
    const r = await importFile(ctx, c, folder, prior.get(c.id));
    uploaded.push(r);
    if (!ctx.dryRun && r.meta) await db.update(items).set({ nativeAttachments: uploaded.map((u) => u.att), importedFrom: { kind, sourceId: row.sourceId, url: row.url, folderId: folder } }).where(eq(items.id, row.id));
  }
  const byContent = new Map(uploaded.map((u) => [u.att.sourceContentId ?? -1, u]));
  const linkFor = (u: { att: StoredAttachment; meta: DriveMeta | null }) => u.meta?.webViewLink ?? googleUrl(isGoogleAppsMime(u.att.mime) ? googleKindOfMime(u.att.mime) : "file", u.att.driveId);
  const docs = uploaded.filter((u) => u.att.kind === "document");
  let nativeKind: NativeKind; let googleFileId: string | null = null; let googleKind: GoogleKind | null = null; let driveMime: string | null = null; let url = `/item/${row.id}`; let introHtml: string | null = null; let stored = uploaded.map((u) => u.att); let attachmentText = uploaded.map((u) => u.text).filter(Boolean).join("\n\n");
  let plan: string;
  if (wantsDoc) {
    // The post's own words become a Google Doc; files are linked from it and shown under it.
    const docHtml = `<html><body>${absLinks(replaceMediaFigures(bodyHtml, (id) => { const u = byContent.get(id); return u ? `<p><a href="${esc(linkFor(u))}">${esc(u.att.name)}</a></p>` : ""; }))}</body></html>`;
    nativeKind = "google"; googleKind = "document"; plan = "Google Doc";
    if (!ctx.dryRun) {
      const meta = await uploadToDrive(Buffer.from(docHtml, "utf8"), `${title}.html`, "text/html", true, { parent: folder ?? undefined, mustConvert: true });
      if (meta.mimeType !== "application/vnd.google-apps.document") throw new Error(`Google did not convert the post text into a Doc (got ${meta.mimeType})`);
      googleFileId = meta.id; driveMime = meta.mimeType; url = meta.webViewLink ?? googleUrl("document", meta.id);
    }
  } else if (kind === "post" && docs.length === 1) {
    // Mostly one document: that document is the content; the post's short body sits above it.
    const main = docs[0]!;
    nativeKind = isGoogleAppsMime(main.att.mime) ? "google" : "file"; googleFileId = main.att.driveId; googleKind = googleKindOfMime(main.att.mime); driveMime = main.att.mime; url = linkFor(main);
    introHtml = replaceMediaFigures(bodyHtml, (id) => { const u = byContent.get(id); return u && u !== main ? nativeMediaHtml(u.att) : ""; }).trim() || null;
    stored = uploaded.filter((u) => u !== main).map((u) => u.att);
    // A Google-format file is read back through its export; a PDF's text is only what was pulled out of it here.
    attachmentText = uploaded.filter((u) => u !== main || nativeKind === "file").map((u) => u.text).filter(Boolean).join("\n\n");
    plan = nativeKind === "google" ? `its ${googleKind === "document" ? "Google Doc" : googleKind === "spreadsheets" ? "Google Sheet" : "Google Slides"}` : "its PDF";
  } else {
    // Short body (or a question and its answers) with its files shown in place.
    nativeKind = "text";
    introHtml = replaceMediaFigures(bodyHtml, (id) => { const u = byContent.get(id); return u ? nativeMediaHtml(u.att) : ""; }).trim() || null;
    plan = kind === "question" ? "a Q&A page" : "a page";
  }
  ctx.log(`${ctx.dryRun ? "would import" : "imported"} ${kind} ${row.sourceId} "${title.slice(0, 60)}" as ${plan}${contents.length ? ` with ${contents.length} file${contents.length > 1 ? "s" : ""} (${(contents.reduce((n, c) => n + (c.original_file_size ?? 0), 0) / 1024 / 1024).toFixed(1)} MB)` : ""}`);
  if (ctx.dryRun) return;
  const authorUserId = row.authorUserId ?? (row.authorName ? ctx.userByName.get(row.authorName.trim().toLowerCase()) ?? null : null);
  await db.update(items).set({
    sourceKind: "native", nativeKind, googleFileId, googleKind, driveMime, url, introHtml, bodyMarkdown: null, nativeAttachments: stored, attachmentText: attachmentText || null, attachments: [], nativeModifiedAt: null,
    importedFrom: { kind, sourceId: row.sourceId, url: row.url, folderId: folder }, importedAt: new Date(), importError: null, authorUserId,
    contentType: kind === "question" ? sql`coalesce(${items.contentType}, 'question')` : items.contentType,
  }).where(eq(items.id, row.id));
  const r = await refreshNativeItem(row.id, "Connected import");
  if (r.status !== "ok") ctx.log(`  content of ${row.sourceId} could not be read back yet (${r.status}); the nightly refresh will retry`);
}

async function importSeries(ctx: Ctx, row: Row, detail: BfItem): Promise<void> {
  const db = getDb();
  const postIds = (detail.posts ?? []).map((p) => p.id);
  const kids = postIds.length ? await db.select({ id: items.id, sourceId: items.sourceId, sourceKind: items.sourceKind, importedFrom: items.importedFrom }).from(items).where(and(sql`${items.removedAt} is null`, sql`(${items.sourceKind} = 'post' and ${items.sourceId} in (${sql.join(postIds.map((p) => sql`${p}`), sql`, `)})) or ${items.importedFrom} @> any(array[${sql.join(postIds.map((p) => sql`${JSON.stringify({ kind: "post", sourceId: p })}::jsonb`), sql`, `)}])`)) : [];
  const idFor = (pid: number) => kids.find((k) => (k.sourceKind === "post" && k.sourceId === pid) || (k.importedFrom?.kind === "post" && k.importedFrom.sourceId === pid))?.id;
  const childItemIds = postIds.map(idFor).filter((x): x is string => !!x);
  const introHtml = replaceMediaFigures(buildBodyHtml("series", detail), () => "").trim() || null;
  ctx.log(`${ctx.dryRun ? "would import" : "imported"} series ${row.sourceId} "${row.title.slice(0, 60)}" with ${childItemIds.length}/${postIds.length} items`);
  if (ctx.dryRun) return;
  const authorUserId = row.authorUserId ?? (row.authorName ? ctx.userByName.get(row.authorName.trim().toLowerCase()) ?? null : null);
  await db.update(items).set({ sourceKind: "native", nativeKind: "series", url: `/item/${row.id}`, introHtml, childItemIds, childPostIds: [], attachments: [], importedFrom: { kind: "series", sourceId: row.sourceId, url: row.url, folderId: null }, importedAt: new Date(), importError: null, authorUserId, contentType: sql`coalesce(${items.contentType}, 'series')` }).where(eq(items.id, row.id));
  await refreshNativeItem(row.id, "Connected import");
}

export async function runImport(triggeredBy: string, opts: { limit?: number; dryRun?: boolean } = {}): Promise<string> {
  if (running) throw new Error("An import is already running");
  if (isIndexing()) throw new Error("Wait for the running re-index to finish first");
  if (!opts.dryRun && (!env.googleServiceAccountJson || !env.googleSharedDriveId)) throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON and GOOGLE_SHARED_DRIVE_ID must be set to import files into Drive");
  const db = getDb();
  const [run] = await db.insert(indexRuns).values({ kind: "import", triggeredBy }).returning({ id: indexRuns.id });
  const runId = run!.id;
  const lines: string[] = [];
  const log = (m: string) => { const c = m.replace(/\u0000/g, "").replace(/\s+/g, " ").slice(0, 400); lines.push(`${new Date().toISOString().slice(11, 19)} ${c}`); logger.info({ runId }, c); };
  const stats: Stats = { imported: 0, failed: 0, filesUploaded: 0, bytesUploaded: 0 };
  const flush = () => db.update(indexRuns).set({ log: lines.slice(-400).join("\n"), stats: stats as unknown as Record<string, unknown> }).where(eq(indexRuns.id, runId));
  running = (async () => {
    try {
      const bf = new Bloomfire(); await bf.login(); log(`logged in to Connected${opts.dryRun ? " (dry run: nothing is uploaded or changed)" : ""}`);
      const root = opts.dryRun ? "" : await ensureFolder(IMPORT_FOLDER);
      const people = await db.select({ id: users.id, name: users.name }).from(users);
      const userByName = new Map<string, string | null>();
      for (const u of people) { const k = u.name.trim().toLowerCase(); userByName.set(k, userByName.has(k) ? null : u.id); }
      const ctx: Ctx = { bf, root, userByName, log, stats, dryRun: !!opts.dryRun };
      // Posts and questions first; series point at the imported posts.
      const pending = await db.select().from(items).where(pendingWhere).orderBy(sql`case ${items.sourceKind} when 'series' then 1 else 0 end`, items.sourceId);
      const work = opts.limit ? pending.slice(0, opts.limit) : pending;
      log(`${pending.length} items to import (${pending.filter((p) => p.sourceKind === "series").length} series)${opts.limit ? `; doing ${work.length} this run` : ""}`);
      const done: string[] = []; let n = 0;
      const runQueue = async (queue: Row[]) => {
        let cursor = 0;
        const worker = async () => {
          while (cursor < queue.length) {
            const row = queue[cursor++]!; const kind = row.sourceKind as Kind;
            try {
              const detail = kind === "post" ? await bf.post(row.sourceId) : kind === "series" ? await bf.series(row.sourceId) : await bf.question(row.sourceId);
              if (kind === "series") await importSeries(ctx, row, detail); else await importPostOrQuestion(ctx, row, kind, detail);
              stats.imported++; done.push(row.id);
            } catch (e) {
              stats.failed++; const msg = (e as Error).message.slice(0, 300); log(`${kind} ${row.sourceId} "${row.title.slice(0, 50)}" FAILED: ${msg}`);
              if (!opts.dryRun) await db.update(items).set({ importError: msg }).where(eq(items.id, row.id)).catch(() => undefined);
            }
            if (++n % 10 === 0) await flush();
          }
        };
        await Promise.all([worker(), worker()]);
      };
      // Series wait for the posts so their items resolve to native ids.
      await runQueue(work.filter((w) => w.sourceKind !== "series"));
      await runQueue(work.filter((w) => w.sourceKind === "series"));
      await flush();
      if (!opts.dryRun && done.length) {
        const s = await getSettings(true);
        log(`embedding and summarizing ${done.length} imported items`);
        stats.embedded = await embedItems(done, s.embeddingModel, log);
        stats.summarized = await summarizeItems(done, s.assistModel, log);
        await loadVectors(true);
        const [left] = await db.select({ n: sql<number>`count(*)::int` }).from(items).where(pendingWhere);
        if ((left?.n ?? 0) === 0 && s.connectedSyncEnabled) { await setSetting("connectedSyncEnabled", false, "Connected import"); log("nothing left to import: Connected sync switched off; the nightly index now only refreshes Google files"); }
        else log(`${left?.n ?? 0} items still to import (failed ones are retried on the next run)`);
      }
      log("done");
      await db.update(indexRuns).set({ status: "done", finishedAt: new Date(), stats: stats as unknown as Record<string, unknown>, log: lines.slice(-400).join("\n") }).where(eq(indexRuns.id, runId));
    } catch (e) {
      log(`FAILED: ${(e as Error).message}`);
      await db.update(indexRuns).set({ status: "failed", finishedAt: new Date(), error: (e as Error).message, stats: stats as unknown as Record<string, unknown>, log: lines.slice(-400).join("\n") }).where(eq(indexRuns.id, runId));
    } finally { running = null; }
  })();
  return runId;
}
