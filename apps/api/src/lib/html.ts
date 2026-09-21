import sanitizeHtml from "sanitize-html";
import type { BfContent, BfItem } from "./bloomfire.js";

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
const CONNECTED_LINK = /^https?:\/\/connected\.wildflowerschools\.org\/(posts|series|questions)\/(\d+)/;
const GOOGLE_FILE = /^https?:\/\/docs\.google\.com\/(document|spreadsheets|presentation)\/d\/([A-Za-z0-9_-]{20,})/;
const FRAME_HOSTS = [/^https:\/\/docs\.google\.com\//, /^https:\/\/drive\.google\.com\//, /^https:\/\/www\.youtube(-nocookie)?\.com\/embed\//, /^https:\/\/player\.vimeo\.com\//, /^https:\/\/www\.loom\.com\/embed\//];

/** Google file link -> read-only embeddable view. */
export function googleEmbedUrl(kind: string, id: string): string {
  if (kind === "presentation") return `https://docs.google.com/presentation/d/${id}/embed?start=false&loop=false`;
  return `https://docs.google.com/${kind}/d/${id}/preview`;
}

/** Sanitize author-written HTML from Connected into something safe to render inside wfwisdom. */
export function sanitizeBody(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: ["p", "br", "span", "div", "strong", "b", "em", "i", "u", "s", "ul", "ol", "li", "a", "h1", "h2", "h3", "h4", "h5", "table", "thead", "tbody", "tr", "td", "th", "hr", "blockquote", "pre", "img", "iframe", "wbr", "figure", "figcaption", "sub", "sup"],
    // "start" is kept so a list that deliberately resumes at a later number still reads right.
    allowedAttributes: { a: ["href", "title"], img: ["src", "alt", "width", "height"], iframe: ["src", "width", "height", "allowfullscreen"], ol: ["start"], td: ["colspan", "rowspan"], th: ["colspan", "rowspan"] },
    allowedSchemes: ["http", "https", "mailto"],
    allowedIframeHostnames: ["docs.google.com", "drive.google.com", "www.youtube.com", "www.youtube-nocookie.com", "player.vimeo.com", "www.loom.com"],
    transformTags: {
      a: (tag, attribs): sanitizeHtml.Tag => {
        const href = attribs.href ?? "";
        const m = href.match(CONNECTED_LINK);
        if (m) return { tagName: "a", attribs: { href: `/c/${m[1] === "posts" ? "post" : m[1] === "series" ? "series" : "question"}/${m[2]}` } };
        return { tagName: "a", attribs: { ...attribs, target: "_blank", rel: "noreferrer" } };
      },
      iframe: (tag, attribs): sanitizeHtml.Tag => {
        const src = attribs.src ?? "";
        const g = src.match(GOOGLE_FILE);
        const fixed = g ? googleEmbedUrl(g[1]!, g[2]!) : src;
        if (!FRAME_HOSTS.some((re) => re.test(fixed))) return { tagName: "p", attribs: {}, text: "" };
        return { tagName: "iframe", attribs: { src: fixed, loading: "lazy", allowfullscreen: "" } };
      },
      h1: "h2",
    },
    exclusiveFilter: (f) => f.tag === "iframe" && !f.attribs.src,
  });
}


interface Emphasis { b: boolean; i: boolean; u: boolean }
const emphasisOf = (css: string): Emphasis => ({
  b: /font-weight\s*:\s*(bold(er)?|[6-9]00)/i.test(css),
  i: /font-style\s*:\s*italic/i.test(css),
  u: /text-decoration[^;]*underline/i.test(css),
});
const hasEmphasis = (e: Emphasis) => e.b || e.i || e.u;

/**
 * Turn a Google Doc export's styled spans into real emphasis tags.
 *
 * Google's HTML export carries no `<strong>` or `<em>`. Bold is a class defined in a `<style>` block in
 * the document head (`.c3{font-weight:700}`) and applied as `<span class="c3">`, and the head is thrown
 * away before sanitizing — which also strips `style` attributes. So a bold line arrived as a bare
 * `<span>` and rendered as ordinary text: "HERE IS BOLD" came through unbolded.
 *
 * This reads the stylesheet, works out which classes mean bold, italic or underline, and rewrites the
 * spans that use them (or carry the style inline) into `<strong>`, `<em>` and `<u>` before the sanitizer
 * runs. Spans are matched with a stack so a span carrying two of them nests correctly and an unstyled
 * span is left exactly as it was.
 */
export function promoteGoogleEmphasis(fullHtml: string): string {
  const byClass = new Map<string, Emphasis>();
  for (const style of fullHtml.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)) {
    for (const rule of (style[1] ?? "").matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const e = emphasisOf(rule[2] ?? "");
      if (!hasEmphasis(e)) continue;
      for (const cls of (rule[1] ?? "").matchAll(/\.([A-Za-z0-9_-]+)/g)) if (cls[1]) byClass.set(cls[1], e);
    }
  }
  const body = fullHtml.replace(/^[\s\S]*?<body[^>]*>/i, "").replace(/<\/body>[\s\S]*$/i, "");
  if (!byClass.size && !/style\s*=\s*"[^"]*(font-weight|font-style|text-decoration)/i.test(body)) return body;

  const spanFor = (attrs: string): Emphasis => {
    const out: Emphasis = { b: false, i: false, u: false };
    const cls = /class\s*=\s*"([^"]*)"/i.exec(attrs)?.[1] ?? "";
    for (const name of cls.split(/\s+/).filter(Boolean)) {
      const e = byClass.get(name); if (!e) continue;
      out.b ||= e.b; out.i ||= e.i; out.u ||= e.u;
    }
    const inline = /style\s*=\s*"([^"]*)"/i.exec(attrs)?.[1] ?? "";
    if (inline) { const e = emphasisOf(inline); out.b ||= e.b; out.i ||= e.i; out.u ||= e.u; }
    return out;
  };
  // Each <span> pushes what it must close, so </span> always closes the right thing.
  const stack: string[] = [];
  return body.replace(/<span\b([^>]*)>|<\/span>/gi, (tag, attrs?: string) => {
    if (tag.startsWith("</")) return stack.pop() ?? "";
    const e = spanFor(attrs ?? "");
    if (!hasEmphasis(e)) { stack.push("</span>"); return tag; }
    const open = `${e.b ? "<strong>" : ""}${e.i ? "<em>" : ""}${e.u ? "<u>" : ""}`;
    stack.push(`${e.u ? "</u>" : ""}${e.i ? "</em>" : ""}${e.b ? "</strong>" : ""}`);
    return open;
  });
}

/**
 * Only whitespace, line breaks and empty paragraphs may sit between two lists for them to count as one:
 * real prose between them means the author meant two lists.
 */
const LIST_GAP = String.raw`(?:\s|<br\s*/?>|<p>(?:\s|<br\s*/?>|&nbsp;)*</p>)*`;
const SPLIT_LIST = new RegExp(String.raw`</(ol|ul)>${LIST_GAP}<\1\b[^>]*>`, "gi");

/**
 * Join lists that the source split into one-item pieces.
 *
 * Connected's editor writes a numbered list as a run of separate single-item `<ol>` blocks
 * (`<ol><li>Loans</li></ol><br /><ol><li>Grants</li></ol>…`). Each one restarts the counter, so a
 * three-item list renders as "1. 1. 1.". Dropping the boundary between two lists that are only
 * separated by blank space makes one list that numbers straight through. The `start` attribute on the
 * later piece goes with the boundary, which is right: the numbering is continuous again.
 *
 * Runs on the way in (so newly indexed items are stored clean) and at render time (so items indexed
 * before this existed are fixed without a re-index). Safe to run twice.
 */
export function mergeAdjacentLists(html: string): string {
  return html ? html.replace(SPLIT_LIST, "") : html;
}

/**
 * Connected embeds a file inside a post body with a token like [content|2595515|]; render that file in place.
 * Some posts carry variants ([content|123], [content|123|caption]), so the pattern is deliberately loose:
 * a token that cannot be rendered must never survive into what a reader sees.
 */
const CONTENT_TOKEN = /\[content\|\s*(\d+)\s*(?:\|[^\]]*)?\]/gi;
/** Remove every embed token from text or HTML. Safe to run twice; used at render time and while indexing. */
export function stripContentTokens(s: string): string {
  return s ? s.replace(CONTENT_TOKEN, "") : s;
}
/**
 * Whether a file name is a machine token rather than something worth showing a reader.
 *
 * Connected stores some images under the opaque id Google gave them, e.g.
 * "AGV_vUeS_RLQ0JOYa7F4QUVrw5UCJyYz2MZPzklPRvVsNdhnzXy-…__s2048" — 100 characters of base64 with no
 * extension. Printed as a caption it reads as junk under the picture, and as alt text a screen reader
 * says the whole thing out loud. A real name has spaces, or an extension, or is simply short.
 */
export function isOpaqueFileName(name: string): boolean {
  const stem = name.replace(/\.[A-Za-z0-9]{1,5}$/, "");
  return stem === name && stem.length >= 32 && /^[A-Za-z0-9_-]+$/.test(stem);
}

export function mediaHtml(c: BfContent): string {
  const src = `/api/files/${c.id}`;
  const raw = c.original_file_name ?? c.title ?? `file-${c.id}`;
  const opaque = isOpaqueFileName(raw);
  const name = esc(raw);
  const size = c.original_file_size ? ` · ${(c.original_file_size / 1024 / 1024).toFixed(1)} MB` : "";
  const label = c.type === "PreviewableDocument" ? "document" : c.type.toLowerCase();
  const view = c.type === "Image" ? `<img src="${src}" alt="${opaque ? "" : name}" loading="lazy">`
    : c.type === "Video" ? `<video src="${src}" controls preload="metadata"></video>`
    : c.type === "Audio" ? `<audio src="${src}" controls preload="metadata" style="width:100%"></audio>`
    : c.type === "PreviewableDocument" || c.type === "Document" ? `<iframe src="${src}" title="${name}" loading="lazy"></iframe>`
    : "";
  return `<figure class="wf-media" data-content-id="${c.id}">${view}<figcaption class="caption">${opaque ? "" : `<strong>${name}</strong>`}<span class="muted">${label}${size}</span><a href="${src}?download=1">Download</a></figcaption></figure>`;
}
function inlineTokens(html: string, contents: BfContent[]): string {
  return html.replace(CONTENT_TOKEN, (m, id: string) => { const c = contents.find((x) => String(x.id) === id); return c && ["Image", "Video", "Audio", "PreviewableDocument", "Document"].includes(c.type) ? mediaHtml(c) : ""; });
}

/** Assemble the readable HTML for an item: body, text blocks and links in their Connected order, then answers. */
export function buildBodyHtml(kind: "post" | "series" | "question", it: BfItem): string {
  const parts: string[] = [];
  const contents = (it.contents ?? []) as BfContent[];
  const body = it.post_body ?? it.explanation ?? "";
  if (body.trim()) parts.push(inlineTokens(sanitizeBody(body), contents));
  for (const c of (it.contents ?? []) as BfContent[]) {
    if (c.type === "TextBlock" && c.text_body?.trim()) parts.push(inlineTokens(sanitizeBody(c.text_body), contents));
    if (c.type === "WebLink" && c.url) {
      const g = c.url.match(GOOGLE_FILE);
      if (g) parts.push(`<figure class="embed"><iframe src="${esc(googleEmbedUrl(g[1]!, g[2]!))}" loading="lazy" allowfullscreen></iframe><figcaption><a href="${esc(c.url)}" target="_blank" rel="noreferrer">${esc(c.title?.trim() || c.url)}</a></figcaption></figure>`);
      else parts.push(sanitizeBody(`<p class="link"><a href="${esc(c.url)}">${esc(c.title?.trim() || c.url)}</a></p>`));
    }
  }
  if (kind === "question") for (const a of it.answers ?? []) {
    const html = a.text ?? a.body ?? ""; if (!html.trim()) continue;
    const who = a.author ? `${a.author.first_name ?? ""} ${a.author.last_name ?? ""}`.trim() : "";
    parts.push(`<section class="answer"><h3>Answer${who ? ` from ${esc(who)}` : ""}</h3>${sanitizeBody(html)}</section>`);
  }
  return mergeAdjacentLists(stripContentTokens(parts.join("\n")));
}


const FIGURE_RE = /<figure class="wf-media" data-content-id="(\d+)">[\s\S]*?<\/figure>/g;

/** A file that lives in the Wisdom Drive folder, rendered in place like a Connected attachment. */
export interface NativeAttachment { driveId: string; name: string; mime: string | null; bytes: number; kind: string }
export function nativeMediaHtml(a: NativeAttachment): string {
  const src = `/api/files/native/${a.driveId}`; const opaque = isOpaqueFileName(a.name); const name = esc(a.name);
  const size = a.bytes ? ` · ${(a.bytes / 1024 / 1024).toFixed(1)} MB` : "";
  const view = a.kind === "image" ? `<img src="${src}" alt="${opaque ? "" : name}" loading="lazy">` : a.kind === "video" ? `<video src="${src}" controls preload="metadata"></video>` : a.kind === "audio" ? `<audio src="${src}" controls preload="metadata" style="width:100%"></audio>` : a.kind === "document" ? `<iframe src="${src}" title="${name}" loading="lazy"></iframe>` : "";
  return `<figure class="wf-media" data-drive-id="${esc(a.driveId)}">${view}<figcaption class="caption">${opaque ? "" : `<strong>${name}</strong>`}<span class="muted">${esc(a.kind)}${size}</span><a href="${src}?download=1">Download</a></figcaption></figure>`;
}
/** Swap each Connected media figure (by content id) for whatever the callback returns; used when importing. */
export function replaceMediaFigures(html: string, replace: (contentId: number) => string): string {
  FIGURE_RE.lastIndex = 0;
  return html.replace(FIGURE_RE, (_m, id: string) => replace(Number(id)));
}

/** A video attachment hoisted out of the body so the player can sit at the top of the item page. */
export interface PrimaryVideo { id: number; name: string; type: string; bytes: number; mime: string | null }

/**
 * When an item's primary content is a video, pull it out of the body HTML so the page can render the
 * player above the transcript. The first video attachment wins; whatever figure the body already had
 * for it is removed so the player is not shown twice.
 */
export function extractPrimaryVideo(html: string, attachments: { id: number; name: string; type: string; bytes: number; mime?: string | null }[]): { html: string; video: PrimaryVideo | null } {
  const v = attachments.find((a) => a.type === "Video");
  if (!v) return { html, video: null };
  FIGURE_RE.lastIndex = 0;
  const stripped = html.replace(FIGURE_RE, (m, id: string) => (Number(id) === v.id ? "" : m));
  return { html: stripped, video: { id: v.id, name: v.name, type: v.type, bytes: v.bytes, mime: v.mime ?? null } };
}
