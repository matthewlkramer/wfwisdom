import { Readable } from "node:stream";
import { and, desc, eq, getDb, itemVersions, items, sql } from "@wfw/db";
import { env } from "../env.js";
import { driveToken } from "../lib/google-docs.js";
import { googleEmbedUrl, sanitizeBody } from "../lib/html.js";
import { normalizeWs, sha, stripHtml } from "../lib/text.js";
import { logger } from "../logger.js";
import { resolveLanguage } from "./language.js";

/**
 * Native items: content that lives in Google (the main path), a file kept in the Wisdom Drive folder, text written
 * here (for the odd case), or a series that strings other items together.
 */
export type NativeKind = "google" | "file" | "text" | "series";
export type GoogleKind = "document" | "spreadsheets" | "presentation" | "file";

const GOOGLE_APPS: Record<string, GoogleKind> = { "application/vnd.google-apps.document": "document", "application/vnd.google-apps.spreadsheet": "spreadsheets", "application/vnd.google-apps.presentation": "presentation" };
const CONVERT_TO: Record<string, string> = {
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "application/vnd.google-apps.document", "application/msword": "application/vnd.google-apps.document", "text/html": "application/vnd.google-apps.document", "text/plain": "application/vnd.google-apps.document", "text/markdown": "application/vnd.google-apps.document", "application/rtf": "application/vnd.google-apps.document",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "application/vnd.google-apps.presentation", "application/vnd.ms-powerpoint": "application/vnd.google-apps.presentation",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "application/vnd.google-apps.spreadsheet", "application/vnd.ms-excel": "application/vnd.google-apps.spreadsheet", "text/csv": "application/vnd.google-apps.spreadsheet",
};
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));

/** Parse any Google link into a file id and kind. */
export function parseGoogleLink(url: string): { id: string; kind: GoogleKind } | null {
  const doc = /docs\.google\.com\/(document|spreadsheets|presentation)\/d\/([A-Za-z0-9_-]{20,})/.exec(url);
  if (doc) return { id: doc[2]!, kind: doc[1] as GoogleKind };
  const file = /drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?id=)([A-Za-z0-9_-]{20,})/.exec(url);
  if (file) return { id: file[1]!, kind: "file" };
  return null;
}
export function googleUrl(kind: GoogleKind, id: string): string { return kind === "file" ? `https://drive.google.com/file/d/${id}/view` : `https://docs.google.com/${kind}/d/${id}/edit`; }

async function authHeaders(write = false): Promise<Record<string, string>> { const t = await driveToken(write).catch(() => null); return t ? { Authorization: `Bearer ${t}` } : {}; }

export interface DriveMeta { id: string; name: string; mimeType: string; modifiedTime: string | null; webViewLink: string | null }
export async function driveMeta(id: string): Promise<DriveMeta | null> {
  const h = await authHeaders();
  if (!h.Authorization) return null;
  const r = await fetch(`https://www.googleapis.com/drive/v3/files/${id}?supportsAllDrives=true&fields=id,name,mimeType,modifiedTime,webViewLink`, { headers: h });
  if (!r.ok) return null;
  const j = await r.json() as DriveMeta;
  return j;
}

/** Exported content for a Google file: HTML for docs, a table for sheets, text (plus an embed) for slides. */
export async function exportGoogle(kind: GoogleKind, id: string, mime?: string | null): Promise<{ status: "ok" | "private" | "error"; text: string; html: string; title: string | null }> {
  const h = await authHeaders();
  const fetchExport = async (mimeType: string, pub: string) => {
    if (h.Authorization) { const r = await fetch(`https://www.googleapis.com/drive/v3/files/${id}/export?mimeType=${encodeURIComponent(mimeType)}`, { headers: h }); if (r.ok) return { ok: true as const, body: await r.text() }; if (r.status === 403 || r.status === 404) return { ok: false as const, status: "private" as const }; }
    const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 30_000);
    try { const r = await fetch(`https://docs.google.com/${kind}/d/${id}/${pub}`, { redirect: "follow", signal: ctrl.signal }); if (r.ok && (mimeType === "text/html" || !(r.headers.get("content-type") ?? "").includes("text/html"))) return { ok: true as const, body: await r.text() }; return { ok: false as const, status: r.status === 401 || r.status === 403 ? "private" as const : "error" as const }; }
    catch { return { ok: false as const, status: "error" as const }; } finally { clearTimeout(t); }
  };
  if (kind === "document") {
    const r = await fetchExport("text/html", "export?format=html"); if (!r.ok) return { status: r.status, text: "", html: "", title: null };
    const body = unwrapGoogleLinks(r.body.replace(/^[\s\S]*?<body[^>]*>/i, "").replace(/<\/body>[\s\S]*$/i, ""));
    const html = sanitizeBody(body).replace(/<p>\s*<\/p>/g, "");
    const text = normalizeWs(stripHtml(html)).slice(0, 400_000);
    // The export carries no <title>; the first line of the document is the best public fallback.
    const title = /<title[^>]*>([^<]{1,200})<\/title>/i.exec(r.body)?.[1]?.trim() || text.split("\n").find((l) => l.trim().length > 2)?.trim().slice(0, 120) || null;
    return { status: "ok", text, html, title };
  }
  if (kind === "spreadsheets") {
    const r = await fetchExport("text/csv", "export?format=csv"); if (!r.ok) return { status: r.status, text: "", html: "", title: null };
    const rows = parseCsv(r.body).slice(0, 300);
    const html = rows.length ? `<table>${rows.map((row, i) => `<tr>${row.slice(0, 40).map((c) => `<${i === 0 ? "th" : "td"}>${esc(c)}</${i === 0 ? "th" : "td"}>`).join("")}</tr>`).join("")}</table>` : "";
    return { status: "ok", text: normalizeWs(rows.map((row) => row.join(" | ")).join("\n")).slice(0, 400_000), html, title: rows[0]?.slice(0, 3).filter(Boolean).join(" · ").slice(0, 120) || null };
  }
  if (kind === "presentation") {
    const r = await fetchExport("text/plain", "export/txt"); if (!r.ok) return { status: r.status, text: "", html: "", title: null };
    const html = `<figure class="embed"><iframe src="${esc(googleEmbedUrl("presentation", id))}" loading="lazy" allowfullscreen></iframe></figure>`;
    const text = normalizeWs(r.body).slice(0, 400_000);
    return { status: "ok", text, html, title: text.split("\n").find((l) => l.trim().length > 2)?.trim().slice(0, 120) || null };
  }
  // A plain file in Drive (PDF, image, video): text comes from extraction elsewhere; the page embeds the file.
  const isPdf = (mime ?? "").includes("pdf"); const isImage = (mime ?? "").startsWith("image/"); const isVideo = (mime ?? "").startsWith("video/");
  const html = isImage ? `<figure class="wf-media"><img src="/api/files/native/${id}" alt=""></figure>` : isVideo ? `<figure class="wf-media"><video src="/api/files/native/${id}" controls preload="metadata"></video></figure>` : isPdf ? `<figure class="wf-media"><iframe src="/api/files/native/${id}" title="Document" loading="lazy"></iframe></figure>` : "";
  return { status: "ok", text: "", html, title: null };
}
/** Google wraps every link in a redirect whose signature changes per export; unwrap them so content hashes stay stable. */
function unwrapGoogleLinks(html: string): string {
  return html.replace(/https?:\/\/www\.google\.com\/url\?q=([^&"'\s]+)[^"'\s]*/g, (_m, q: string) => { try { return decodeURIComponent(q); } catch { return q; } });
}
function parseCsv(csv: string): string[][] {
  const rows: string[][] = []; let row: string[] = []; let cell = ""; let q = false;
  for (let i = 0; i < csv.length; i++) {
    const c = csv[i]!;
    if (q) { if (c === '"') { if (csv[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; }
    else if (c === '"') q = true; else if (c === ",") { row.push(cell); cell = ""; } else if (c === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; } else if (c !== "\r") cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((x) => x.trim()));
}

export const MIME_BY_EXT: Record<string, string> = { docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", doc: "application/msword", pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation", ppt: "application/vnd.ms-powerpoint", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", xls: "application/vnd.ms-excel", csv: "text/csv", txt: "text/plain", md: "text/markdown", rtf: "application/rtf", pdf: "application/pdf", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", mp4: "video/mp4", mov: "video/quicktime", m4v: "video/x-m4v", webm: "video/webm", mp3: "audio/mpeg", m4a: "audio/mp4", wav: "audio/wav" };
/** Best guess at a file's MIME type from what the source said and its extension. */
export function guessMime(name: string, declared?: string | null): string {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (declared && declared !== "application/octet-stream" && declared !== "binary/octet-stream") return declared;
  return MIME_BY_EXT[ext] ?? "application/octet-stream";
}
/** The Google format an uploaded file converts to, if any. */
export const convertTarget = (mime: string | null | undefined): string | null => CONVERT_TO[mime ?? ""] ?? null;
export const isGoogleAppsMime = (mime: string | null | undefined) => (mime ?? "").startsWith("application/vnd.google-apps.");
export const googleKindOfMime = (mime: string | null | undefined): GoogleKind => GOOGLE_APPS[mime ?? ""] ?? "file";
export const UPLOAD_FIELDS = "id,name,mimeType,modifiedTime,webViewLink";

async function writeHeaders(): Promise<Record<string, string>> { const h = await authHeaders(true); if (!h.Authorization) throw new Error("The Google service account is not configured"); return h; }
function driveFolder(): string { const folder = env.googleSharedDriveId; if (!folder) throw new Error("GOOGLE_SHARED_DRIVE_ID is not set"); return folder; }

/** Find a folder by name under a parent (the Wisdom folder by default), creating it when missing. */
export async function ensureFolder(name: string, parent = driveFolder()): Promise<string> {
  const h = await writeHeaders();
  const q = `name = '${name.replace(/'/g, "\\'")}' and '${parent}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
  const r = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&supportsAllDrives=true&includeItemsFromAllDrives=true&fields=files(id)&pageSize=1`, { headers: h });
  if (r.ok) { const j = await r.json() as { files?: { id: string }[] }; if (j.files?.[0]) return j.files[0].id; }
  const c = await fetch("https://www.googleapis.com/drive/v3/files?supportsAllDrives=true&fields=id", { method: "POST", headers: { ...h, "Content-Type": "application/json" }, body: JSON.stringify({ name, parents: [parent], mimeType: "application/vnd.google-apps.folder" }) });
  if (!c.ok) throw new Error(`Drive folder create failed: ${c.status} ${(await c.text()).slice(0, 200)}`);
  return ((await c.json()) as { id: string }).id;
}

/** Upload a file into the Wisdom Drive folder. Office files and text convert to Google Docs, Slides or Sheets so editing continues in Google. */
export async function uploadToDrive(buf: Buffer, name: string, mime: string, convert = true, opts: { parent?: string; mustConvert?: boolean } = {}): Promise<DriveMeta> {
  const folder = opts.parent ?? driveFolder();
  const h = await writeHeaders();
  const target = convert ? CONVERT_TO[mime] : undefined;
  // A converted file drops its extension; a dot inside a title ("Budget v2.1") is left alone.
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  const meta: Record<string, unknown> = { name: target && (ext in MIME_BY_EXT || ext === "html" || ext === "htm") ? name.replace(/\.[a-z0-9]+$/i, "") : name, parents: [folder], ...(target ? { mimeType: target } : {}) };
  const boundary = `wfw${Date.now().toString(36)}`;
  const head = Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n--${boundary}\r\nContent-Type: ${mime}\r\n\r\n`);
  const tail = Buffer.from(`\r\n--${boundary}--`);
  const r = await fetch(`https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=${UPLOAD_FIELDS}`, { method: "POST", headers: { ...h, "Content-Type": `multipart/related; boundary=${boundary}` }, body: Buffer.concat([head, buf, tail]) });
  if (!r.ok) {
    const detail = `${r.status} ${(await r.text()).replace(/\s+/g, " ").slice(0, 300)}`;
    // Files Google will not convert (too large, odd encoding) are kept as they are rather than lost.
    if (target && !opts.mustConvert && r.status !== 401 && r.status !== 403) { logger.warn({ name, mime, detail }, "Drive would not convert the file; keeping it as uploaded"); return uploadToDrive(buf, name, mime, false, opts); }
    throw new Error(`Drive upload failed${target ? ` (converting ${mime} to ${target})` : ""}: ${detail}`);
  }
  return await r.json() as DriveMeta;
}

const CHUNK = 32 * 1024 * 1024;
/**
 * Resumable upload straight from a byte stream, for videos and other large files that must not be held in memory.
 * The stream is sent in 32 MB chunks; Google answers 308 until the last chunk lands.
 */
export async function uploadToDriveStream(body: ReadableStream<Uint8Array>, name: string, mime: string, totalBytes: number | null, opts: { parent?: string; idleMs?: number } = {}): Promise<DriveMeta> {
  const folder = opts.parent ?? driveFolder();
  const h = await writeHeaders();
  const start = await fetch(`https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&supportsAllDrives=true&fields=${UPLOAD_FIELDS}`, { method: "POST", headers: { ...h, "Content-Type": "application/json; charset=UTF-8", "X-Upload-Content-Type": mime, ...(totalBytes ? { "X-Upload-Content-Length": String(totalBytes) } : {}) }, body: JSON.stringify({ name, parents: [folder] }) });
  if (!start.ok) throw new Error(`Drive resumable start failed: ${start.status} ${(await start.text()).slice(0, 200)}`);
  const session = start.headers.get("location"); if (!session) throw new Error("Drive resumable start returned no session");
  const reader = body.getReader();
  let offset = 0; let pending: Uint8Array[] = []; let pendingBytes = 0; let done = false; let result: DriveMeta | null = null;
  const send = async (chunk: Buffer, last: boolean) => {
    const total = last ? offset + chunk.length : (totalBytes ?? "*");
    const range = chunk.length ? `bytes ${offset}-${offset + chunk.length - 1}/${total}` : `bytes */${total}`;
    let r: Response | null = null;
    for (let attempt = 0; attempt < 4; attempt++) {
      r = await fetch(session, { method: "PUT", headers: { "Content-Length": String(chunk.length), "Content-Range": range }, body: new Uint8Array(chunk) }).catch(() => null);
      if (r && (r.status === 308 || r.ok)) break;
      await new Promise((res) => setTimeout(res, 2000 * (attempt + 1)));
    }
    if (!r) throw new Error("Drive chunk upload failed: no response");
    if (r.status === 308) { offset += chunk.length; return; }
    if (!r.ok) throw new Error(`Drive chunk upload failed: ${r.status} ${(await r.text()).slice(0, 200)}`);
    offset += chunk.length; result = await r.json() as DriveMeta;
  };
  const idleMs = opts.idleMs ?? 180_000;
  while (!done) {
    // A source that stops sending is abandoned rather than holding the worker forever.
    const { value, done: d } = await Promise.race([reader.read(), new Promise<never>((_, rej) => setTimeout(() => rej(new Error(`download stalled for ${idleMs / 1000}s`)), idleMs).unref())]);
    if (value?.length) { pending.push(value); pendingBytes += value.length; }
    done = d;
    if (pendingBytes >= CHUNK || done) {
      const buf = Buffer.concat(pending); pending = []; pendingBytes = 0;
      if (done) { await send(buf, true); break; }
      // Intermediate chunks must be a multiple of 256 KiB; carry the remainder over.
      const cut = buf.length - (buf.length % (256 * 1024));
      await send(buf.subarray(0, cut), false);
      if (cut < buf.length) { pending.push(buf.subarray(cut)); pendingBytes = buf.length - cut; }
    }
  }
  if (!result) throw new Error("Drive upload did not complete");
  return result;
}
/** Stream a Drive file's bytes (files kept in the Wisdom folder). */
export async function driveDownload(id: string, range?: string, mime?: string | null): Promise<Response> {
  const h = await authHeaders(); if (!h.Authorization) throw new Error("The Google service account is not configured");
  if (isGoogleAppsMime(mime)) return fetch(`https://www.googleapis.com/drive/v3/files/${id}/export?mimeType=application/pdf`, { headers: h });
  return fetch(`https://www.googleapis.com/drive/v3/files/${id}?alt=media&supportsAllDrives=true`, { headers: { ...h, ...(range ? { Range: range } : {}) } });
}
export const toNodeStream = (body: ReadableStream<Uint8Array>) => Readable.fromWeb(body as never);

/** Markdown written in the app, rendered to sanitized HTML (headings, lists, links, emphasis, quotes). */
export function markdownToHtml(md: string): string {
  const inline = (s: string) => esc(s).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>").replace(/`([^`]+)`/g, "<code>$1</code>").replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2">$1</a>');
  const lines = md.replace(/\r/g, "").split("\n"); const out: string[] = []; let list: "ul" | "ol" | null = null; let para: string[] = [];
  const flushP = () => { if (para.length) { out.push(`<p>${inline(para.join(" "))}</p>`); para = []; } };
  const closeList = () => { if (list) { out.push(`</${list}>`); list = null; } };
  for (const raw of lines) {
    const l = raw.trimEnd();
    const h = /^(#{1,4})\s+(.*)/.exec(l); const ol = /^\s*\d+[.)]\s+(.*)/.exec(l); const ul = /^\s*[-*•]\s+(.*)/.exec(l); const q = /^>\s?(.*)/.exec(l);
    if (!l.trim()) { flushP(); closeList(); continue; }
    if (h) { flushP(); closeList(); const lvl = Math.min(4, h[1]!.length + 1); out.push(`<h${lvl}>${inline(h[2]!)}</h${lvl}>`); continue; }
    if (ol || ul) { flushP(); const kind = ol ? "ol" : "ul"; if (list !== kind) { closeList(); out.push(`<${kind}>`); list = kind; } out.push(`<li>${inline((ol ?? ul)![1]!)}</li>`); continue; }
    if (q) { flushP(); closeList(); out.push(`<blockquote>${inline(q[1]!)}</blockquote>`); continue; }
    para.push(l);
  }
  flushP(); closeList();
  return sanitizeBody(out.join("\n"));
}

export interface NativeContent { text: string; html: string; hash: string; modifiedAt: Date | null; status: "ok" | "private" | "error"; title?: string | null; mime?: string | null }
/** Read the current content of a native item from wherever it lives. */
export async function readNativeContent(it: { nativeKind: string | null; googleFileId: string | null; googleKind: string | null; driveMime: string | null; bodyMarkdown: string | null; title: string }): Promise<NativeContent> {
  if (it.nativeKind === "google" || it.nativeKind === "file") {
    const meta = it.googleFileId ? await driveMeta(it.googleFileId) : null;
    let kind = (it.googleKind ?? "file") as GoogleKind; const mime = meta?.mimeType ?? it.driveMime ?? null;
    if (meta && GOOGLE_APPS[meta.mimeType]) kind = GOOGLE_APPS[meta.mimeType]!;
    const ex = await exportGoogle(kind, it.googleFileId!, mime);
    return { text: ex.text, html: ex.html, hash: sha(`${ex.text}|${ex.html}`), modifiedAt: meta?.modifiedTime ? new Date(meta.modifiedTime) : null, status: ex.status, title: meta?.name ?? ex.title ?? null, mime };
  }
  if (it.nativeKind === "text") { const html = markdownToHtml(it.bodyMarkdown ?? ""); const text = normalizeWs(stripHtml(html)); return { text, html, hash: sha(text), modifiedAt: null, status: "ok" }; }
  return { text: "", html: "", hash: sha(it.title), modifiedAt: null, status: "ok" };
}

/** Save a snapshot when the content hash changed. Returns the version number written, or null. */
export async function snapshotIfChanged(itemId: string, content: NativeContent, title: string, bodyMarkdown: string | null, by: string): Promise<number | null> {
  const db = getDb();
  const [last] = await db.select({ hash: itemVersions.hash, version: itemVersions.version }).from(itemVersions).where(eq(itemVersions.itemId, itemId)).orderBy(desc(itemVersions.version)).limit(1);
  if (last && last.hash === content.hash) return null;
  const version = (last?.version ?? 0) + 1;
  await db.insert(itemVersions).values({ itemId, version, title, bodyText: content.text, bodyHtml: content.html, bodyMarkdown, hash: content.hash, sourceModifiedAt: content.modifiedAt, createdBy: by });
  return version;
}

/** Re-read a native item and store its content; returns true when the content changed. */
export async function refreshNativeItem(itemId: string, by = "system"): Promise<{ changed: boolean; status: string }> {
  const db = getDb();
  const [it] = await db.select().from(items).where(eq(items.id, itemId));
  if (!it || it.sourceKind !== "native") return { changed: false, status: "missing" };
  const read = await readNativeContent(it);
  if (read.status !== "ok") return { changed: false, status: read.status };
  // Imported items carry their own intro (the old post's words) and the text of their files; both stay searchable.
  const introText = it.introHtml ? normalizeWs(stripHtml(it.introHtml)) : "";
  const text = [introText, read.text, it.attachmentText ?? ""].filter(Boolean).join("\n\n").slice(0, 400_000);
  const html = [it.introHtml ?? "", read.html].filter(Boolean).join("\n");
  const content: NativeContent = { ...read, text, html, hash: sha(`${text}|${html}`) };
  const hash = sha(`${it.title}|${it.description ?? ""}|${content.text}`);
  const changed = hash !== it.contentHash || (it.bodyHtml ?? "") !== content.html;
  if (changed) {
    const language = content.text ? await resolveLanguage({ title: it.title, description: it.description, body: content.text }) : null;
    await db.update(items).set({ bodyText: content.text, bodyHtml: content.html, contentHash: hash, hasText: content.text.length >= 300, sourceUpdatedAt: content.modifiedAt ?? it.sourceUpdatedAt ?? new Date(), nativeModifiedAt: content.modifiedAt, driveMime: content.mime ?? it.driveMime, indexedAt: new Date(), ...(language ? { language } : {}) }).where(eq(items.id, itemId));
    await snapshotIfChanged(itemId, content, it.title, it.bodyMarkdown, by);
  } else await db.update(items).set({ indexedAt: new Date() }).where(eq(items.id, itemId));
  return { changed, status: "ok" };
}

/** Nightly: pick up edits made in Google. Returns the ids whose content changed (they need re-embedding). */
export async function refreshNativeItems(log: (m: string) => void): Promise<string[]> {
  const db = getDb();
  const rows = await db.select({ id: items.id, googleFileId: items.googleFileId, nativeModifiedAt: items.nativeModifiedAt }).from(items).where(and(eq(items.sourceKind, "native"), eq(items.status, "published"), sql`${items.nativeKind} in ('google','file')`));
  const changed: string[] = [];
  for (const r of rows) {
    try {
      const meta = r.googleFileId ? await driveMeta(r.googleFileId) : null;
      if (meta?.modifiedTime && r.nativeModifiedAt && new Date(meta.modifiedTime).getTime() <= r.nativeModifiedAt.getTime()) continue;
      const res = await refreshNativeItem(r.id, "nightly refresh");
      if (res.changed) changed.push(r.id);
    } catch (e) { logger.warn({ err: (e as Error).message, itemId: r.id }, "native refresh failed"); }
  }
  if (rows.length) log(`checked ${rows.length} Google-linked items; ${changed.length} changed`);
  return changed;
}
