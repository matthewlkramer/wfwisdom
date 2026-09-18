import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { FeedbackListResult, FeedbackResult, FeedbackStatus } from "@wfw/shared";
import { api, fmtDate } from "../../api";
import { ErrorState, Loading, SearchInput, State } from "../../components/ui";

const STATUSES: FeedbackStatus[] = ["open", "in_progress", "resolved", "dismissed"];
const CATEGORIES = ["bug", "question", "suggestion", "other"];
const humanize = (v: string) => v.replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase());
const tone = (s: FeedbackStatus) => (s === "resolved" ? "complete" : s === "in_progress" ? "active" : s === "dismissed" ? "stage" : "attention");

export function AdminFeedback() {
  const qc = useQueryClient();
  const [statuses, setStatuses] = useState<string[]>(["open"]);
  const [categories, setCategories] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<FeedbackResult | null>(null);
  const [notes, setNotes] = useState("");
  const q = useQuery({ queryKey: ["admin-feedback", statuses, categories, search, page], queryFn: () => api.get<FeedbackListResult>(`/api/admin/feedback?statuses=${statuses.join(",")}&categories=${categories.join(",")}&search=${encodeURIComponent(search.trim())}&page=${page}&limit=25`) });
  useEffect(() => { setPage(1); }, [statuses, categories, search]);
  const items = q.data?.feedback ?? [];
  const select = (i: FeedbackResult) => { setSelected(i); setNotes(i.adminNotes ?? ""); };
  // The selected note stays open after a status change even when the filter no longer matches it.
  const update = useMutation({ mutationFn: ({ id, changes }: { id: string; changes: { status?: FeedbackStatus; adminNotes?: string | null } }) => api.patch<{ feedback: FeedbackResult }>(`/api/admin/feedback/${id}`, changes), onSuccess: (r) => { if (r.feedback) setSelected(r.feedback); qc.invalidateQueries({ queryKey: ["admin-feedback"] }); } });
  const toggle = (list: string[], set: (v: string[]) => void, v: string) => set(list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div className="filter-bar">
        <div style={{ flex: "1 1 260px", maxWidth: 420 }}><SearchInput value={search} onChange={setSearch} placeholder="Search messages or reporters" /></div>
        <div className="chip-group" role="group" aria-label="Status">{STATUSES.map((s) => <button key={s} type="button" className={`chip${statuses.includes(s) ? " on" : ""}`} onClick={() => toggle(statuses, setStatuses, s)}>{humanize(s)}</button>)}</div>
        <div className="chip-group" role="group" aria-label="Category">{CATEGORIES.map((c) => <button key={c} type="button" className={`chip${categories.includes(c) ? " on" : ""}`} onClick={() => toggle(categories, setCategories, c)}>{humanize(c)}</button>)}</div>
      </div>
      {q.error ? <ErrorState error={q.error} retry={() => q.refetch()} /> : null}
      {update.error ? <State kind="error" title="Could not save">{String((update.error as Error).message)}</State> : null}
      <div className="wf-card" style={{ overflow: "auto" }}>
        {q.isLoading ? <div style={{ padding: 18 }}><Loading what="Loading the queue" /></div> : items.length === 0 ? <div style={{ padding: 18 }}><State kind="empty" title="No feedback found">No feedback matches these filters.</State></div> : (
          <table className="wf-table feedback-table"><thead><tr><th>Feedback</th><th>Reporter</th><th>Category</th><th>Status</th><th>Received</th></tr></thead><tbody>
            {items.map((i) => <tr key={i.id} className={i.id === selected?.id ? "selected" : ""} onClick={() => select(i)}><td className="feedback-message-cell"><strong>{i.message.length > 160 ? `${i.message.slice(0, 160)}…` : i.message}</strong><small>{i.pageTitle ?? i.pagePath ?? "Unknown page"}</small></td><td>{i.reporterName}<br /><small className="muted">{i.reporterEmail}</small></td><td>{humanize(i.category)}</td><td><span className={`wf-status wf-status-${tone(i.status)}`}>{humanize(i.status)}</span></td><td>{fmtDate(i.createdAt)}</td></tr>)}
          </tbody></table>
        )}
      </div>
      {q.data?.pagination ? <footer className="pagination"><span className="muted">{items.length} on this page · {q.data.pagination.total} total</span><div className="inline-actions"><button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}><ChevronLeft size={15} /> Previous</button><span>Page {page} of {q.data.pagination.pageCount}</span><button type="button" disabled={page >= q.data.pagination.pageCount} onClick={() => setPage((p) => p + 1)}>Next <ChevronRight size={15} /></button></div></footer> : null}
      {selected ? (
        <div className="feedback-inspector-layout">
          <section className="wf-card wf-card-section">
            <div className="wf-section-header" style={{ marginTop: 0 }}><div><p className="eyebrow">Selected feedback</p><h3>{humanize(selected.category)} from {selected.reporterName}</h3></div><button type="button" className="icon-button" onClick={() => setSelected(null)} aria-label="Close details"><X size={17} /></button></div>
            <blockquote className="feedback-quote">{selected.message}</blockquote>
            <p className="muted" style={{ fontSize: ".85rem" }}>{selected.pageUrl ? <a href={selected.pageUrl}>{selected.pageUrl}</a> : selected.pagePath ?? "No page recorded"} · {fmtDate(selected.createdAt)}{typeof selected.context.viewport === "string" ? ` · ${selected.context.viewport}` : ""}</p>
            {selected.screenshotDataUrl ? <a href={selected.screenshotDataUrl} target="_blank" rel="noreferrer" aria-label="Open full-size screenshot"><img className="feedback-screenshot" src={selected.screenshotDataUrl} alt={`Page captured with feedback from ${selected.reporterName}`} /></a> : <p className="muted">No screenshot was captured.</p>}
          </section>
          <section className="wf-card wf-card-section">
            <h3>Review action</h3>
            <label className="field">Status<select value={selected.status} disabled={update.isPending} onChange={(e) => update.mutate({ id: selected.id, changes: { status: e.target.value as FeedbackStatus } })}>{STATUSES.map((s) => <option key={s} value={s}>{humanize(s)}</option>)}</select></label>
            <label className="field">Staff notes<textarea rows={5} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="What did the team do?" /></label>
            <button type="button" className="primary-button" disabled={update.isPending} onClick={() => update.mutate({ id: selected.id, changes: { adminNotes: notes.trim() || null } })}>{update.isPending ? "Saving…" : "Save notes"}</button>
            <dl className="wf-record-facts" style={{ marginTop: 14 }}><div><dt>Reporter</dt><dd>{selected.reporterEmail}</dd></div>{selected.resolvedAt ? <div><dt>Resolved</dt><dd>{fmtDate(selected.resolvedAt)}</dd></div> : null}{typeof selected.context.userAgent === "string" ? <div><dt>Browser</dt><dd style={{ fontSize: ".75rem" }}>{selected.context.userAgent}</dd></div> : null}</dl>
          </section>
        </div>
      ) : null}
    </div>
  );
}
