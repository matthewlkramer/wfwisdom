import { createRequire } from "node:module";
import JSZip from "jszip";
import mammoth from "mammoth";
import { normalizeWs } from "./text.js";
const require = createRequire(import.meta.url);

export type FileKind = "pdf" | "docx" | "pptx" | "md" | "txt" | "xlsx" | "unknown";
export function kindOf(filename: string, mime?: string): FileKind {
  const ext = (filename.split(".").pop() ?? "").toLowerCase();
  if (ext === "pdf" || mime === "application/pdf") return "pdf";
  if (ext === "docx") return "docx";
  if (ext === "pptx") return "pptx";
  if (ext === "xlsx") return "xlsx";
  if (ext === "md" || ext === "markdown") return "md";
  if (ext === "txt" || (mime ?? "").startsWith("text/")) return "txt";
  return "unknown";
}
async function pdfText(buf: Buffer, maxPages = 80): Promise<string> {
  const pdfParse = require("pdf-parse") as (b: Buffer, o?: { max?: number }) => Promise<{ text: string; numpages: number }>;
  const r = await pdfParse(buf, { max: maxPages });
  return r.text;
}
async function pptxText(buf: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(buf);
  const slides = Object.keys(zip.files).filter((f) => /^ppt\/slides\/slide\d+\.xml$/.test(f)).sort((a, b) => Number(a.match(/\d+/)?.[0]) - Number(b.match(/\d+/)?.[0]));
  const parts: string[] = [];
  for (const f of slides) { const xml = await zip.file(f)!.async("string"); parts.push(xml.replace(/<a:p>/g, "\n").replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")); }
  return parts.join("\n\n");
}
async function xlsxText(buf: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(buf);
  const shared = zip.file("xl/sharedStrings.xml") ? (await zip.file("xl/sharedStrings.xml")!.async("string")).match(/<t[^>]*>([^<]*)<\/t>/g)?.map((m) => m.replace(/<[^>]+>/g, "")) ?? [] : [];
  const sheets = Object.keys(zip.files).filter((f) => /^xl\/worksheets\/sheet\d+\.xml$/.test(f)).sort();
  const out: string[] = [];
  for (const f of sheets) {
    const xml = await zip.file(f)!.async("string");
    const cells = [...xml.matchAll(/<c[^>]*?(?:t="(\w+)")?[^>]*>(?:<f>[^<]*<\/f>)?<v>([^<]*)<\/v>/g)].map((m) => (m[1] === "s" ? shared[Number(m[2])] ?? "" : m[2] ?? ""));
    out.push(cells.filter((c) => c && isNaN(Number(c))).join(" | "));
  }
  return out.join("\n\n");
}
export async function extractText(buf: Buffer, filename: string, mime?: string): Promise<{ text: string; kind: FileKind }> {
  const kind = kindOf(filename, mime);
  let text = "";
  if (kind === "pdf") text = await pdfText(buf);
  else if (kind === "docx") text = (await mammoth.extractRawText({ buffer: buf })).value;
  else if (kind === "pptx") text = await pptxText(buf);
  else if (kind === "xlsx") text = await xlsxText(buf);
  else if (kind === "md" || kind === "txt") text = buf.toString("utf8");
  else if (buf.subarray(0, 4).toString() === "%PDF") text = await pdfText(buf);
  else throw new Error(`Unsupported file type: ${filename}`);
  return { text: normalizeWs(text), kind };
}
