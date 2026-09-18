// Turning bare URLs in plain text (summaries, notes) into link segments the web app can render.

export type TextSegment = { kind: "text"; text: string } | { kind: "link"; text: string; href: string };

const URL_RE = /(https?:\/\/[^\s<>()[\]{}"']+|www\.[^\s<>()[\]{}"']+)/gi;
/** Trailing sentence punctuation is part of the sentence, not the URL. */
const TRAILING = /[.,;:!?)\]}'"…]+$/;

/**
 * Split text into plain and link segments. Deterministic and allocation-light; never returns an
 * empty text segment, so callers can render the result directly.
 */
export function linkifyParts(text: string): TextSegment[] {
  const out: TextSegment[] = [];
  if (!text) return out;
  let last = 0;
  URL_RE.lastIndex = 0;
  for (let m = URL_RE.exec(text); m; m = URL_RE.exec(text)) {
    let raw = m[0];
    const trimmed = raw.replace(TRAILING, "");
    // Keep a closing paren that belongs to the URL, e.g. a wiki link ending in "(1)".
    const kept = trimmed.split("(").length === trimmed.split(")").length ? trimmed : raw.replace(/[.,;:!?'"…]+$/, "");
    raw = kept || raw;
    const start = m.index;
    if (start > last) out.push({ kind: "text", text: text.slice(last, start) });
    out.push({ kind: "link", text: raw, href: raw.startsWith("www.") ? `https://${raw}` : raw });
    last = start + raw.length;
    URL_RE.lastIndex = last;
  }
  if (last < text.length) out.push({ kind: "text", text: text.slice(last) });
  return out;
}
