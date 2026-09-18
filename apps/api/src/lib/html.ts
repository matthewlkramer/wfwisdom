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
    allowedAttributes: { a: ["href", "title"], img: ["src", "alt", "width", "height"], iframe: ["src", "width", "height", "allowfullscreen"], td: ["colspan", "rowspan"], th: ["colspan", "rowspan"] },
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


/** Connected embeds a file inside a post body with a token like [content|2595515|]; render that file in place. */
const CONTENT_TOKEN = /\[content\|(\d+)\|?\]/g;
export function mediaHtml(c: BfContent): string {
  const src = `/api/files/${c.id}`;
  const name = esc(c.original_file_name ?? c.title ?? `file-${c.id}`);
  const size = c.original_file_size ? ` · ${(c.original_file_size / 1024 / 1024).toFixed(1)} MB` : "";
  const label = c.type === "PreviewableDocument" ? "document" : c.type.toLowerCase();
  const view = c.type === "Image" ? `<img src="${src}" alt="${name}" loading="lazy">`
    : c.type === "Video" ? `<video src="${src}" controls preload="metadata"></video>`
    : c.type === "Audio" ? `<audio src="${src}" controls preload="metadata" style="width:100%"></audio>`
    : c.type === "PreviewableDocument" || c.type === "Document" ? `<iframe src="${src}" title="${name}" loading="lazy"></iframe>`
    : "";
  return `<figure class="wf-media" data-content-id="${c.id}">${view}<figcaption class="caption"><strong>${name}</strong><span class="muted">${label}${size}</span><a href="${src}?download=1">Download</a></figcaption></figure>`;
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
  return parts.join("\n").replace(CONTENT_TOKEN, "");
}
