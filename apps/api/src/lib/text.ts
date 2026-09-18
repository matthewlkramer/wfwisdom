import { createHash } from "node:crypto";
export function stripHtml(html: string | null | undefined): string {
  if (!html) return "";
  return html.replace(/\u0000/g, "").replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, " ").replace(/<br\s*\/?>|<\/p>|<\/div>|<\/li>|<\/h[1-6]>/gi, "\n").replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n\n").trim();
}
export function normalizeWs(s: string): string { return s.replace(/\u0000/g, "").replace(/\r/g, "").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim(); }
export function sha(s: string): string { return createHash("sha256").update(s).digest("hex").slice(0, 32); }
/** Split text into overlapping chunks of roughly `size` characters on paragraph/sentence boundaries. */
export function chunk(text: string, size = 1600, overlap = 200): string[] {
  const t = normalizeWs(text); if (!t) return [];
  if (t.length <= size) return [t];
  const out: string[] = []; let i = 0;
  while (i < t.length) {
    let end = Math.min(t.length, i + size);
    if (end < t.length) { const cut = Math.max(t.lastIndexOf("\n\n", end), t.lastIndexOf(". ", end)); if (cut > i + size * 0.5) end = cut + 1; }
    out.push(t.slice(i, end).trim());
    if (end >= t.length) break;
    i = Math.max(end - overlap, i + 1);
  }
  return out.filter(Boolean);
}
export const GOOGLE_DOC_RE = /https?:\/\/docs\.google\.com\/(document|spreadsheets|presentation)\/d\/([A-Za-z0-9_-]{20,})/g;
export const GOOGLE_FILE_RE = /https?:\/\/drive\.google\.com\/(?:file\/d\/|open\?id=)([A-Za-z0-9_-]{20,})/g;
