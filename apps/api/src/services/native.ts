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
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "application/vnd.google-apps.document", "application/msword": "application/vnd.google-apps.document", "text/plain": "application/vnd.google-apps.document", "text/markdown": "application/vnd.google-apps.document", "application/rtf": "application/vnd.google-apps.document",
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

/** Upload a file into the Wisdom Drive folder. Office files and text convert to Google Docs, Slides or Sheets so editing continues in Google. */
export async function uploadToDrive(buf: Buffer, name: string, mime: string, convert = true): Promise<DriveMeta> {
  const folder = env.googleSharedDriveId; if (!folder) throw new Error("GOOGLE_SHARED_DRIVE_ID is not set");
  const h = await authHeaders(true); if (!h.Authorization) throw new Error("The Google service account is not configured");
  const target = convert ? CONVERT_TO[mime] : undefined;
  const meta: Record<string, unknown> = { name: target ? name.replace(/\.[a-z0-9]+$/i, "") : name, parents: [folder], ...(target ? { mimeType: target } : {}) };
  const boundary = `wfw${Date.now().toString(36)}`;
  const head = Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n--${boundary}\r\nContent-Type: ${mime}\r\n\r\n`);
  const tail = Buffer.from(`\r\n--${boundary}--`);
  const r = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id,name,mimeType,modifiedTime,webViewLink", { method: "POST", headers: { ...h, "Content-Type": `multipart/related; boundary=${boundary}` }, body: Buffer.concat([head, buf, tail]) });
  if (!r.ok) throw new Error(`Drive upload failed: ${r.status} ${(await r.text()).slice(0, 200)}`);
  return await r.json() as DriveMeta;
}
/** Stream a Drive file's bytes (files kept in the Wisdom folder). */
export async function driveDownload(id: string, range?: string): Promise<Response> {
  const h = await authHeaders(); if (!h.Authorization) throw new Error("The Google service account is not configured");
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
  const content = await readNativeContent(it);
  if (content.status !== "ok") return { changed: false, status: content.status };
  const hash = sha(`${it.title}|${it.description ?? ""}|${content.text}`);
  const changed = hash !== it.contentHash || (it.bodyHtml ?? "") !== content.html;
  if (changed) {
    const language = content.text ? await resolveLanguage({ title: it.title, description: it.description, body: content.text }) : null;
    await db.update(items).set({ bodyText: content.text, bodyHtml: content.html, contentHash: hash, hasText: content.text.length >= 300, sourceUpdatedAt: content.modifiedAt ?? new Date(), nativeModifiedAt: content.modifiedAt, driveMime: content.mime ?? it.driveMime, indexedAt: new Date(), ...(language ? { language } : {}) }).where(eq(items.id, itemId));
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
