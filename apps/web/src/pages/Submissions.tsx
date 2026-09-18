import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Download, Mail } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import type { ReviewResult } from "@wfw/shared";
import { api, fmtDate } from "../api";
import { ErrorState, Loading, RubricBar, State, VerdictPill } from "../components/ui";

type Row = { id: string; title: string | null; status: string; verdict: string | null; createdAt: string; typeName: string; typeKey: string; parentId: string | null; charCount: number; objectivesTotal: number | null; objectivesMax: number | null; openChanges: number | null; verifyCount: number | null };
type ListData = { submissions: Row[]; stats: { reviewsThisMonth: number; reviewsLeftToday: number; draftsLeftToday: number } };
const verdictTone = (v: string | null) => (!v ? "muted" : v.startsWith("Ready") ? "ready" : v.startsWith("Nearly") ? "nearly" : "needs");

/** Group submissions into version chains by following parent links; newest chain first. */
function chains(rows: Row[]): Row[][] {
  const byId = new Map(rows.map((r) => [r.id, r]));
  const rootOf = (r: Row) => { let cur = r; const seen = new Set<string>(); while (cur.parentId && byId.has(cur.parentId) && !seen.has(cur.id)) { seen.add(cur.id); cur = byId.get(cur.parentId)!; } return cur.id; };
  const groups = new Map<string, Row[]>();
  for (const r of rows) { const k = rootOf(r); groups.set(k, [...(groups.get(k) ?? []), r]); }
  return [...groups.values()].map((g) => g.sort((a, b) => a.createdAt.localeCompare(b.createdAt))).sort((a, b) => b[b.length - 1]!.createdAt.localeCompare(a[a.length - 1]!.createdAt));
}

export function MyDrafts() {
  const q = useQuery({ queryKey: ["my-submissions"], queryFn: () => api.get<ListData>("/api/submissions"), refetchInterval: (query) => (query.state.data?.submissions.some((s) => s.status === "queued" || s.status === "running") ? 3000 : false) });
  if (q.isLoading) return <div className="wf-page"><Loading /></div>;
  if (q.error) return <div className="wf-page"><ErrorState error={q.error} retry={() => q.refetch()} /></div>;
  const rows = q.data!.submissions; const st = q.data!.stats;
  const groups = chains(rows);
  const ready = groups.filter((g) => g[g.length - 1]!.verdict?.startsWith("Ready")).length;
  return (
    <div className="wf-page narrow">
      <div className="wf-page-header"><div><h1>My drafts</h1><p>Each draft keeps its versions together so you can see what improved. Only you and Wildflower staff can see these.</p></div><div className="wf-record-actions"><Link className="primary-button" to="/materials">Start a new draft</Link></div></div>
      <div className="stat-strip">{[[String(groups.length - ready), "drafts in progress"], [String(ready), "ready to use"], [String(st.reviewsThisMonth), "reviews this month"], [`${st.reviewsLeftToday}`, "reviews left today"]].map(([v, l]) => <div key={l} className="wf-card wf-card-metric"><span className="wf-card-value">{v}</span><small>{l}</small></div>)}</div>
      {groups.length ? <div style={{ display: "grid", gap: 12 }}>{groups.map((g) => { const last = g[g.length - 1]!; const first = g[0]!; const delta = first.objectivesTotal !== null && last.objectivesTotal !== null && g.length > 1 ? last.objectivesTotal - first.objectivesTotal : null; return (
        <div key={last.id} className="wf-card wf-card-section draft-chain">
          <div className="grow">
            <p className="eyebrow" style={{ margin: 0 }}>{last.typeName}</p>
            <h2 className="draft-chain-title"><Link to={`/drafts/${last.id}`}>{last.title ?? "Untitled draft"}</Link></h2>
            <div className="version-chain">{g.map((v, i) => <span key={v.id} className="version-chain-item"><Link to={`/drafts/${v.id}`} className={`version-chip ${verdictTone(v.verdict)}`}><small>v{i + 1} · {fmtDate(v.createdAt)}</small><strong>{v.status === "done" ? v.verdict : v.status === "failed" ? "Review failed" : "Reading your draft…"}</strong></Link>{i < g.length - 1 ? <ArrowRight size={16} className="muted" /> : null}</span>)}</div>
            <p className="muted" style={{ margin: "10px 0 0", fontSize: ".875rem" }}>
              {delta !== null ? `Objectives moved from ${first.objectivesTotal}/${first.objectivesMax} to ${last.objectivesTotal}/${last.objectivesMax}. ` : last.objectivesTotal !== null ? `Objectives ${last.objectivesTotal}/${last.objectivesMax}. ` : ""}
              {last.openChanges ? `${last.openChanges} priority change${last.openChanges === 1 ? "" : "s"} suggested. ` : ""}{last.verifyCount ? `${last.verifyCount} thing${last.verifyCount === 1 ? "" : "s"} to verify with your Ops Guide.` : ""}
            </p>
          </div>
          <div className="draft-chain-actions"><Link className="primary-button" to={`/drafts/${last.id}`}>{last.status === "done" ? "Open latest review" : "Open"}</Link>{last.status === "done" ? <Link to={`/materials/${last.typeKey}?resubmit=${last.id}`}>Revise and resubmit</Link> : null}</div>
        </div>); })}</div>
        : <State kind="empty" title="No drafts yet">Pick a material type, write or upload a draft, and get feedback in about a minute.</State>}
    </div>
  );
}

type Sub = { id: string; title: string | null; status: string; verdict: string | null; review: ReviewResult | null; error: string | null; createdAt: string; completedAt: string | null; emailedAt: string | null; typeName: string; typeKey: string; draftText: string; charCount: number; parentId: string | null; filename: string | null; versionNumber: number; parentReview: { rubric: { criterion: string; score: number }[]; verdict: string | null; createdAt: string } | null };
type Tab = "overview" | "changes" | "notes" | "rewrites" | "questions";

/** Find each line note's quote in the draft and number it in place. */
function annotate(draft: string, notes: { quote: string; note: string }[]): ReactNode[] {
  const marks: { start: number; end: number; n: number }[] = [];
  const lower = draft.toLowerCase();
  notes.forEach((ln, i) => { const q = ln.quote.replace(/^["“”']+|["“”']+$/g, "").trim(); if (q.length < 6) return; let idx = lower.indexOf(q.toLowerCase()); if (idx < 0 && q.length > 40) idx = lower.indexOf(q.slice(0, 40).toLowerCase()); if (idx >= 0 && !marks.some((m) => idx < m.end && idx + q.length > m.start)) marks.push({ start: idx, end: idx + Math.min(q.length, draft.length - idx), n: i + 1 }); });
  marks.sort((a, b) => a.start - b.start);
  const out: ReactNode[] = []; let pos = 0;
  for (const m of marks) { if (m.start > pos) out.push(draft.slice(pos, m.start)); out.push(<mark key={m.n} className="note-mark" id={`mark-${m.n}`}>{draft.slice(m.start, m.end)}<sup>{m.n}</sup></mark>); pos = m.end; }
  if (pos < draft.length) out.push(draft.slice(pos));
  return out;
}

export function SubmissionPage() {
  const { id } = useParams(); const qc = useQueryClient(); const [tab, setTab] = useState<Tab>("overview");
  const q = useQuery({ queryKey: ["submission", id], queryFn: () => api.get<Sub>(`/api/submissions/${id}`), refetchInterval: (query) => { const s = query.state.data?.status; return s === "queued" || s === "running" ? 2500 : false; } });
  const email = useMutation({ mutationFn: () => api.post<{ to: string }>(`/api/submissions/${id}/email`), onSuccess: () => qc.invalidateQueries({ queryKey: ["submission", id] }) });
  const s = q.data;
  const annotated = useMemo(() => (s?.review ? annotate(s.draftText, s.review.line_notes) : [s?.draftText ?? ""]), [s?.draftText, s?.review]);
  if (q.isLoading) return <div className="wf-page"><Loading /></div>;
  if (q.error || !s) return <div className="wf-page"><ErrorState error={q.error} retry={() => q.refetch()} /></div>;
  const r = s.review;
  const parentScores = new Map((s.parentReview?.rubric ?? []).map((c) => [c.criterion, c.score]));
  return (
    <div className="wf-page">
      <Link to="/my" className="wf-page-back">← My drafts</Link>
      <div className="wf-page-header"><div><p className="eyebrow">{s.typeName} · version {s.versionNumber}</p><h1>{s.title ?? "Untitled draft"}</h1><p>Submitted {fmtDate(s.createdAt)}{s.filename ? ` from ${s.filename}` : ""} · {s.charCount.toLocaleString()} characters{s.parentReview ? ` · revised from a draft reviewed ${fmtDate(s.parentReview.createdAt)}` : ""}</p></div>
        {s.status === "done" ? <div className="wf-record-actions"><a className="secondary-button" href={`/api/submissions/${s.id}/download`}><Download size={16} /> Download</a><button className="secondary-button" onClick={() => email.mutate()} disabled={email.isPending}><Mail size={16} /> {s.emailedAt ? "Email again" : "Email me this"}</button><Link className="primary-button" to={`/materials/${s.typeKey}?resubmit=${s.id}&text=${encodeURIComponent(s.draftText.slice(0, 6000))}`}>Revise and resubmit</Link></div> : null}</div>
      {email.isSuccess ? <State kind="success" title={`Sent to ${email.data.to}`} /> : email.error ? <ErrorState error={email.error} /> : null}
      {s.status === "queued" || s.status === "running" ? <State kind="loading" title="Reading your draft">The reviewer is working through it against the guide for this type. This usually takes under a minute.</State>
        : s.status === "failed" ? <State kind="error" title="The review did not complete">{s.error ?? "Unknown error"}. You can <Link to={`/materials/${s.typeKey}`}>submit it again</Link>.</State>
        : r ? (
          <>
            <div className="verdict-strip wf-card">
              <div className="verdict-strip-main"><VerdictPill verdict={r.verdict} /><div><strong>If you fix one thing:</strong> {r.one_thing}</div></div>
              <div className="verdict-strip-objectives">{r.rubric.map((c) => { const prev = parentScores.get(c.criterion); const d = prev !== undefined ? c.score - prev : null; return <div key={c.criterion} className="objective-row"><span>{c.criterion}</span><RubricBar score={c.score} /><span className="muted">{c.score}/5{d !== null && d !== 0 ? <em className={d > 0 ? "up" : "down"}> {d > 0 ? "▲" : "▼"}{Math.abs(d)}</em> : null}</span></div>; })}</div>
            </div>
            <div className="review-layout">
              <section className="wf-card wf-card-section draft-pane"><p className="eyebrow" style={{ marginBottom: 12 }}>Your draft · notes are numbered in place</p><div className="draft-text">{annotated}</div></section>
              <aside className="review-pane">
                <div className="wf-tabs" role="tablist" style={{ margin: 0 }}>{([["overview", "Overview"], ["changes", `Changes (${r.priority_changes.length})`], ["notes", `Line notes (${r.line_notes.length})`], ["rewrites", `Rewrites (${r.example_rewrites.length})`], ["questions", `Questions (${r.questions_for_writer.length})`]] as [Tab, string][]).map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? "active" : ""} onClick={() => setTab(k)}>{l}</button>)}</div>
                {tab === "overview" ? <div className="review-tab">
                  <p style={{ fontSize: "1.02rem" }}>{r.summary}</p>
                  <h3>What is working</h3><ul className="wf-list tight">{r.strengths.map((x, i) => <li key={i}>{x}</li>)}</ul>
                  <h3>How it meets the objectives</h3><div style={{ display: "grid", gap: 8 }}>{r.rubric.map((c) => <div key={c.criterion} className="objective-note"><strong>{c.criterion}</strong> <RubricBar score={c.score} /><div className="muted">{c.note}</div></div>)}</div>
                  {r.verify_with_humans.length ? <div className="verify-box"><strong>Verify with your Operations Guide, attorney, or accountant</strong><ul className="wf-list tight">{r.verify_with_humans.map((x, i) => <li key={i}>{x}</li>)}</ul></div> : null}
                  {r.recommended_resources.length ? <><h3>Connected resources</h3><ul className="wf-list tight">{r.recommended_resources.map((x, i) => <li key={i}><a href={x.url} target="_blank" rel="noreferrer">{x.title} ↗</a> — {x.why}</li>)}</ul></> : null}
                  {r.nits.length ? <><h3>Nits</h3><ul className="wf-list tight">{r.nits.map((x, i) => <li key={i}>{x}</li>)}</ul></> : null}
                </div> : null}
                {tab === "changes" ? <div className="review-tab"><ol className="priority-list">{r.priority_changes.map((p, i) => <li key={i}><strong>{p.what}</strong><div className="muted">{p.why}</div><div><em>How:</em> {p.how}</div></li>)}</ol></div> : null}
                {tab === "notes" ? <div className="review-tab">{r.line_notes.length ? r.line_notes.map((n, i) => <a key={i} href={`#mark-${i + 1}`} className="line-note"><span className="line-note-n">{i + 1}</span><span><em className="muted">“{n.quote}”</em><div>{n.note}</div></span></a>) : <p className="muted">No line notes for this draft.</p>}</div> : null}
                {tab === "rewrites" ? <div className="review-tab"><p className="muted">One option, not a replacement. Keep your own voice.</p>{r.example_rewrites.map((e, i) => <div key={i} className="rewrite"><div className="quote">“{e.original}”</div><div className="rewrite-option">{e.rewrite}</div><div className="muted">{e.why}</div></div>)}</div> : null}
                {tab === "questions" ? <div className="review-tab"><ul className="wf-list">{r.questions_for_writer.map((x, i) => <li key={i}>{x}</li>)}</ul></div> : null}
                <p className="muted" style={{ fontSize: ".8rem" }}>This feedback was generated by an AI reviewer using Wildflower's guidance for this material type. It is a starting point, not a decision. Your Operations Guide is the person to talk to about anything legal, financial, or licensing-related.</p>
              </aside>
            </div>
          </>
        ) : null}
      {!r ? <details style={{ marginTop: 20 }}><summary>Your draft as submitted</summary><pre className="mono draft-pre">{s.draftText}</pre></details> : null}
    </div>
  );
}

/** Kept for the admin submission detail and email preview. */
export function Review({ r }: { r: ReviewResult }) {
  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div><VerdictPill verdict={r.verdict} /></div>
      <div className="one-thing"><strong>If you fix one thing:</strong> {r.one_thing}</div>
      <p style={{ fontSize: "1.02rem" }}>{r.summary}</p>
      <section className="wf-card wf-card-section"><h3>Objectives</h3><div className="table-wrap" style={{ border: 0 }}><table className="wf-table"><tbody>{r.rubric.map((c) => <tr key={c.criterion}><td style={{ whiteSpace: "nowrap" }}><strong>{c.criterion}</strong></td><td style={{ whiteSpace: "nowrap" }}><RubricBar score={c.score} /> {c.score}/5</td><td>{c.note}</td></tr>)}</tbody></table></div></section>
      <section className="wf-card wf-card-section"><h3>What is working</h3><ul className="wf-list tight">{r.strengths.map((s, i) => <li key={i}>{s}</li>)}</ul></section>
      <section className="wf-card wf-card-section"><h3>Priority changes</h3><ol style={{ paddingLeft: 20, display: "grid", gap: 12, margin: 0 }}>{r.priority_changes.map((p, i) => <li key={i}><strong>{p.what}</strong><div className="muted">{p.why}</div><div><em>How:</em> {p.how}</div></li>)}</ol></section>
      {r.line_notes.length ? <section className="wf-card wf-card-section"><h3>Line notes</h3><div style={{ display: "grid", gap: 12 }}>{r.line_notes.map((n, i) => <div key={i}><div className="quote">“{n.quote}”</div><div>{n.note}</div></div>)}</div></section> : null}
      {r.example_rewrites.length ? <section className="wf-card wf-card-section"><h3>Example rewrites</h3>{r.example_rewrites.map((e, i) => <div key={i} className="rewrite"><div className="quote">“{e.original}”</div><div className="rewrite-option">{e.rewrite}</div><div className="muted">{e.why}</div></div>)}</section> : null}
      {r.questions_for_writer.length ? <section className="wf-card wf-card-section"><h3>Questions for you</h3><ul className="wf-list tight">{r.questions_for_writer.map((s, i) => <li key={i}>{s}</li>)}</ul></section> : null}
      {r.verify_with_humans.length ? <section className="wf-card wf-card-section verify-box"><h3 style={{ color: "var(--wf-warning)" }}>Verify with your Operations Guide, attorney, or accountant</h3><ul className="wf-list tight">{r.verify_with_humans.map((s, i) => <li key={i}>{s}</li>)}</ul></section> : null}
      {r.recommended_resources.length ? <section className="wf-card wf-card-section"><h3>Connected resources</h3><ul className="wf-list tight">{r.recommended_resources.map((x, i) => <li key={i}><a href={x.url} target="_blank" rel="noreferrer">{x.title} ↗</a> — {x.why}</li>)}</ul></section> : null}
      {r.nits.length ? <section className="wf-card wf-card-section"><h3>Nits</h3><ul className="wf-list tight">{r.nits.map((s, i) => <li key={i}>{s}</li>)}</ul></section> : null}
    </div>
  );
}
