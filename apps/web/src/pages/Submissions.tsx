import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Mail } from "lucide-react";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { ReviewResult } from "@wfw/shared";
import { api, fmtDate } from "../api";
import { ErrorState, Loading, RubricBar, State, VerdictPill } from "../components/ui";

type Row = { id: string; title: string | null; status: string; verdict: string | null; createdAt: string; typeName: string; typeKey: string; parentId: string | null; charCount: number };
export function MyDrafts() {
  const q = useQuery({ queryKey: ["my-submissions"], queryFn: () => api.get<{ submissions: Row[] }>("/api/submissions") });
  if (q.isLoading) return <div className="wf-page"><Loading /></div>;
  if (q.error) return <div className="wf-page"><ErrorState error={q.error} retry={() => q.refetch()} /></div>;
  const rows = q.data!.submissions;
  return (
    <div className="wf-page narrow">
      <div className="wf-page-header"><div><h1>My drafts</h1><p>Every draft you have submitted and the feedback it got. Only you and Wildflower staff can see these.</p></div><div className="wf-record-actions"><Link className="primary-button" to="/materials">Submit a new draft</Link></div></div>
      {rows.length ? <div className="table-wrap"><table className="wf-table"><thead><tr><th>Draft</th><th>Type</th><th>Submitted</th><th>Verdict</th></tr></thead><tbody>{rows.map((r) => <tr key={r.id}><td><Link to={`/drafts/${r.id}`}>{r.title ?? "Untitled"}</Link>{r.parentId ? <span className="muted"> · revision</span> : null}</td><td>{r.typeName}</td><td>{fmtDate(r.createdAt)}</td><td>{r.status === "done" && r.verdict ? <VerdictPill verdict={r.verdict} /> : r.status === "failed" ? <span className="wf-status wf-status-danger">Failed</span> : <span className="wf-status">In progress</span>}</td></tr>)}</tbody></table></div> : <State kind="empty" title="No drafts yet">Pick a material type to get feedback on a draft.</State>}
    </div>
  );
}

type Sub = { id: string; title: string | null; status: string; verdict: string | null; review: ReviewResult | null; error: string | null; createdAt: string; completedAt: string | null; emailedAt: string | null; typeName: string; typeKey: string; draftText: string; charCount: number; parentId: string | null; model: string | null; source: string; filename: string | null };
export function SubmissionPage() {
  const { id } = useParams(); const qc = useQueryClient(); const [showDraft, setShowDraft] = useState(false);
  const q = useQuery({ queryKey: ["submission", id], queryFn: () => api.get<Sub>(`/api/submissions/${id}`), refetchInterval: (query) => { const s = query.state.data?.status; return s === "queued" || s === "running" ? 2500 : false; } });
  const email = useMutation({ mutationFn: () => api.post<{ to: string }>(`/api/submissions/${id}/email`), onSuccess: () => qc.invalidateQueries({ queryKey: ["submission", id] }) });
  if (q.isLoading) return <div className="wf-page"><Loading /></div>;
  if (q.error) return <div className="wf-page"><ErrorState error={q.error} retry={() => q.refetch()} /></div>;
  const s = q.data!;
  return (
    <div className="wf-page narrow">
      <Link to="/my" className="wf-page-back">← My drafts</Link>
      <div className="wf-page-header"><div><p className="eyebrow">{s.typeName}</p><h1>{s.title ?? "Untitled draft"}</h1><p>Submitted {fmtDate(s.createdAt)}{s.filename ? ` from ${s.filename}` : ""} · {s.charCount.toLocaleString()} characters</p></div>
        {s.status === "done" ? <div className="wf-record-actions"><a className="secondary-button" href={`/api/submissions/${s.id}/download`}><Download size={16} /> Download</a><button className="secondary-button" onClick={() => email.mutate()} disabled={email.isPending}><Mail size={16} /> {email.isPending ? "Sending…" : s.emailedAt ? "Email again" : "Email me this"}</button><Link className="primary-button" to={`/materials/${s.typeKey}?resubmit=${s.id}`}>Revise and resubmit</Link></div> : null}</div>
      {email.isSuccess ? <State kind="success" title={`Sent to ${email.data.to}`} /> : email.error ? <ErrorState error={email.error} /> : null}
      {s.status === "queued" || s.status === "running" ? <State kind="loading" title="Reading your draft">The reviewer is working through it against the guide for this type. This usually takes under a minute.</State>
        : s.status === "failed" ? <State kind="error" title="The review did not complete">{s.error ?? "Unknown error"}. You can <Link to={`/materials/${s.typeKey}`}>submit it again</Link>.</State>
        : s.review ? <Review r={s.review} /> : null}
      <details style={{ marginTop: 20 }} open={showDraft} onToggle={(e) => setShowDraft((e.target as HTMLDetailsElement).open)}><summary>Your draft as reviewed</summary><pre className="mono" style={{ background: "white", border: "1px solid var(--wf-border)", borderRadius: 10, padding: 14 }}>{s.draftText}</pre></details>
    </div>
  );
}

export function Review({ r }: { r: ReviewResult }) {
  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div><VerdictPill verdict={r.verdict} /></div>
      <div className="one-thing"><strong>If you fix one thing:</strong> {r.one_thing}</div>
      <p style={{ fontSize: "1.02rem" }}>{r.summary}</p>
      <section className="wf-card wf-card-section"><h3>Rubric</h3><div className="table-wrap" style={{ border: 0 }}><table className="wf-table"><tbody>{r.rubric.map((c) => <tr key={c.criterion}><td style={{ whiteSpace: "nowrap" }}><strong>{c.criterion}</strong></td><td style={{ whiteSpace: "nowrap" }}><RubricBar score={c.score} /> {c.score}/5</td><td>{c.note}</td></tr>)}</tbody></table></div></section>
      <section className="wf-card wf-card-section"><h3>What is working</h3><ul className="wf-list tight">{r.strengths.map((s, i) => <li key={i}>{s}</li>)}</ul></section>
      <section className="wf-card wf-card-section"><h3>Priority changes</h3><ol style={{ paddingLeft: 20, display: "grid", gap: 12, margin: 0 }}>{r.priority_changes.map((p, i) => <li key={i}><strong>{p.what}</strong><div className="muted">{p.why}</div><div><em>How:</em> {p.how}</div></li>)}</ol></section>
      {r.line_notes.length ? <section className="wf-card wf-card-section"><h3>Line notes</h3><div style={{ display: "grid", gap: 12 }}>{r.line_notes.map((n, i) => <div key={i}><div className="quote">“{n.quote}”</div><div>{n.note}</div></div>)}</div></section> : null}
      {r.example_rewrites.length ? <section className="wf-card wf-card-section"><h3>Example rewrites</h3><p className="muted">One option, not a replacement. Keep your own voice.</p><div style={{ display: "grid", gap: 14 }}>{r.example_rewrites.map((e, i) => <div key={i}><div className="quote">Original: {e.original}</div><div style={{ margin: "6px 0" }}><strong>Option:</strong> {e.rewrite}</div><div className="muted">{e.why}</div></div>)}</div></section> : null}
      {r.questions_for_writer.length ? <section className="wf-card wf-card-section"><h3>Questions for you</h3><ul className="wf-list tight">{r.questions_for_writer.map((s, i) => <li key={i}>{s}</li>)}</ul></section> : null}
      {r.verify_with_humans.length ? <section className="wf-card wf-card-section" style={{ borderColor: "#e1c978", background: "#fffaf0" }}><h3 style={{ color: "var(--wf-warning)" }}>Verify with your Operations Guide, attorney, or accountant</h3><ul className="wf-list tight">{r.verify_with_humans.map((s, i) => <li key={i}>{s}</li>)}</ul></section> : null}
      {r.recommended_resources.length ? <section className="wf-card wf-card-section"><h3>Connected resources</h3><ul className="wf-list tight">{r.recommended_resources.map((x, i) => <li key={i}><a href={x.url} target="_blank" rel="noreferrer">{x.title} ↗</a> <span className="muted">— {x.why}</span></li>)}</ul></section> : null}
      {r.nits.length ? <section className="wf-card wf-card-section"><h3>Nits</h3><ul className="wf-list tight">{r.nits.map((s, i) => <li key={i}>{s}</li>)}</ul></section> : null}
      <p className="muted" style={{ fontSize: ".8rem" }}>This feedback was generated by an AI reviewer using Wildflower's guidance for this material type. It is a starting point, not a decision. Your Operations Guide is the person to talk to about anything legal, financial, or licensing-related.</p>
    </div>
  );
}
