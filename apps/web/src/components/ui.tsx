import { AlertTriangle, CheckCircle2, Info, Loader2, Search } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { linkifyParts, type ItemSummary } from "@wfw/shared";
import { fmtMonth, signalClick } from "../api";

export function State({ kind = "info", title, children, icon }: { kind?: "info" | "error" | "success" | "loading" | "empty"; title: string; children?: ReactNode; icon?: ReactNode }) {
  const cls = kind === "error" ? "wf-state wf-state-error" : kind === "success" ? "wf-state wf-state-success" : kind === "info" ? "wf-state wf-state-info" : "wf-state";
  const ic = icon ?? (kind === "loading" ? <Loader2 className="wf-spin" size={20} /> : kind === "error" ? <AlertTriangle size={20} /> : kind === "success" ? <CheckCircle2 size={20} /> : <Info size={20} />);
  return <div className={cls} role={kind === "error" ? "alert" : "status"}><span className="wf-state-icon">{ic}</span><div><strong>{title}</strong>{children ? <p>{children}</p> : null}</div></div>;
}
export function Loading({ what = "Loading" }: { what?: string }) { return <State kind="loading" title={`${what}…`} />; }
export function ErrorState({ error, retry }: { error: unknown; retry?: () => void }) {
  const msg = error instanceof Error ? error.message : String(error);
  return <State kind="error" title="Something went wrong">{msg}{retry ? <> <button className="link-button" onClick={retry}>Retry</button></> : null}</State>;
}
export function SearchInput({ value, onChange, placeholder, large, autoFocus, onSubmit }: { value: string; onChange: (v: string) => void; placeholder?: string; large?: boolean; autoFocus?: boolean; onSubmit?: () => void }) {
  return <form className={`wf-search${large ? " large" : ""}`} role="search" onSubmit={(e) => { e.preventDefault(); onSubmit?.(); }}><Search size={18} /><input type="search" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder ?? "Search Connected"} aria-label={placeholder ?? "Search Connected"} autoFocus={autoFocus} /></form>;
}
/** Renders plain text with bare URLs as real links that open in a new tab. */
export function Linkify({ text }: { text: string }) {
  return <>{linkifyParts(text).map((p, i) => (p.kind === "link" ? <a key={i} href={p.href} target="_blank" rel="noopener noreferrer">{p.text}</a> : <span key={i}>{p.text}</span>))}</>;
}
export function Pill({ item }: { item: ItemSummary }) {
  return <>{item.curation === "essential" ? <span className="wf-status wf-status-essential">Essential</span> : item.curation === "recommended" ? <span className="wf-status wf-status-recommended">Staff pick</span> : null}{item.dated ? <span className="wf-status wf-status-attention">{item.dated}</span> : null}</>;
}
export function ItemCard({ item, context, showWhy = true }: { item: ItemSummary; context?: Record<string, unknown>; showWhy?: boolean }) {
  // A resource list is a series underneath; it is labelled by what it reads as, not how it is built.
  const kindLabel = item.contentType === "resource_list" ? "Resource list" : item.isSeries || item.kind === "series" ? "Series" : item.kind === "question" ? "Q&A" : item.contentType ? item.contentType[0]!.toUpperCase() + item.contentType.slice(1) : "Post";
  return (
    <article className="wf-card wf-card-record">
      <div className="wf-record-heading"><span><Link className="wf-card-title" to={`/item/${item.id}`} onClick={() => signalClick(item.id, context ?? {})}>{item.title}</Link></span><span className="wf-record-tags"><Pill item={item} /></span></div>
      {showWhy && item.why ? <p className="item-why">{item.why}</p> : null}
      {item.children?.length ? <ol className="series-items">{item.children.map((c) => <li key={c.id}><Link to={`/item/${c.id}`} onClick={() => signalClick(c.id, { ...(context ?? {}), viaSeries: item.id })}>{c.title}</Link></li>)}</ol> : null}
      {item.summary ? <p className="item-summary">{item.summary}</p> : item.description ? <p className="item-summary">{item.description.slice(0, 220)}{item.description.length > 220 ? "…" : ""}</p> : null}
      <div className="item-meta"><span className="wf-status wf-status-stage">{kindLabel}</span>{item.updatedAt ? <span>Updated {fmtMonth(item.updatedAt)}</span> : null}{item.attachmentCount ? <span>{item.attachmentCount} attachment{item.attachmentCount > 1 ? "s" : ""}</span> : null}{item.linkOnly ? <span>Link out</span> : null}</div>
    </article>
  );
}
export function ItemGrid({ items, context, empty = "Nothing here yet.", wide }: { items: ItemSummary[]; context?: Record<string, unknown>; empty?: string; wide?: boolean }) {
  if (!items.length) return <State kind="empty" title={empty} />;
  return <div className={`wf-card-grid${wide ? " wide" : ""}`}>{items.map((it) => <ItemCard key={it.id} item={it} context={context} />)}</div>;
}
/** Tiny markdown renderer for the subset used in guides and reviews: headings, bold, italics, links, lists, quotes, paragraphs. */
export function Markdown({ text, className = "prose" }: { text: string; className?: string }) {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const inline = (s: string) => esc(s).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>").replace(/`([^`]+)`/g, "<code>$1</code>").replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>');
  const lines = text.replace(/\r/g, "").split("\n"); const out: string[] = []; let list: "ul" | "ol" | null = null; let para: string[] = [];
  const flushP = () => { if (para.length) { out.push(`<p>${inline(para.join(" "))}</p>`); para = []; } };
  const closeList = () => { if (list) { out.push(`</${list}>`); list = null; } };
  for (const raw of lines) {
    const l = raw.trimEnd();
    const h = /^(#{1,4})\s+(.*)/.exec(l); const ol = /^\s*\d+[.)]\s+(.*)/.exec(l); const ul = /^\s*[-*•]\s+(.*)/.exec(l); const q = /^>\s?(.*)/.exec(l);
    if (!l.trim()) { flushP(); closeList(); continue; }
    if (h) { flushP(); closeList(); const lvl = Math.min(4, h[1]!.length + 2); out.push(`<h${lvl}>${inline(h[2]!)}</h${lvl}>`); continue; }
    if (ol || ul) { flushP(); const kind = ol ? "ol" : "ul"; if (list !== kind) { closeList(); out.push(`<${kind}>`); list = kind; } out.push(`<li>${inline((ol ?? ul)![1]!)}</li>`); continue; }
    if (q) { flushP(); closeList(); out.push(`<blockquote>${inline(q[1]!)}</blockquote>`); continue; }
    para.push(l);
  }
  flushP(); closeList();
  return <div className={className} dangerouslySetInnerHTML={{ __html: out.join("\n") }} />;
}
export function RubricBar({ score }: { score: number }) { return <span className="rubric-bar" aria-label={`${score} of 5`}>{[1, 2, 3, 4, 5].map((i) => <i key={i} className={i <= score ? "on" : ""} />)}</span>; }
export function VerdictPill({ verdict }: { verdict: string }) { const cls = verdict.startsWith("Ready") ? "ready" : verdict.startsWith("Nearly") ? "nearly" : "needs"; return <span className={`verdict ${cls}`}>{verdict}</span>; }
