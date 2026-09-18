import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { ReviewResult } from "@wfw/shared";
import { api, fmtDate } from "../../api";
import { ErrorState, Loading, State, VerdictPill } from "../../components/ui";
import { Review } from "../Submissions";
type Row = { id: string; title: string | null; status: string; verdict: string | null; createdAt: string; source: string; charCount: number; costUsd: string | null; model: string | null; userName: string; userEmail: string; typeName: string; typeKey: string; typeVersion: number; contributed: boolean };
export function AdminSubmissions() {
  const [page, setPage] = useState(0);
  const q = useQuery({ queryKey: ["admin-submissions", page], queryFn: () => api.get<{ submissions: Row[] }>(`/api/admin/submissions?page=${page}`) });
  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorState error={q.error} retry={() => q.refetch()} />;
  return <div style={{ display: "grid", gap: 12 }}>
    <State kind="info" title="Every draft submitted, with who sent it">Use this to follow up with teams and to see where prompts need tuning. Rows marked contributed are drafts the writer offered as examples for other teams.</State>
    <div className="table-wrap"><table className="wf-table"><thead><tr><th>When</th><th>Who</th><th>Type</th><th>Draft</th><th>Verdict</th><th>Cost</th></tr></thead><tbody>
      {q.data!.submissions.map((r) => <tr key={r.id}><td>{fmtDate(r.createdAt)}</td><td>{r.userName}<div className="muted" style={{ fontSize: ".75rem" }}>{r.userEmail}</div></td><td>{r.typeName} <span className="muted">v{r.typeVersion}</span>{r.source === "test" ? <span className="wf-status" style={{ marginLeft: 6 }}>test</span> : null}</td><td><Link to={`/admin/submissions/${r.id}`}>{r.title ?? "Untitled"}</Link> <span className="muted">({r.charCount.toLocaleString()} chars)</span>{r.contributed ? <span className="wf-status wf-status-teal" style={{ marginLeft: 6 }}>contributed</span> : null}</td><td>{r.verdict ? <VerdictPill verdict={r.verdict} /> : <span className="wf-status">{r.status}</span>}</td><td>{r.costUsd ? `$${Number(r.costUsd).toFixed(3)}` : ""}</td></tr>)}
    </tbody></table></div>
    <div className="inline-actions"><button className="small" disabled={page === 0} onClick={() => setPage(page - 1)}>Previous</button><span className="muted">Page {page + 1}</span><button className="small" disabled={q.data!.submissions.length < 50} onClick={() => setPage(page + 1)}>Next</button></div>
  </div>;
}
export function AdminSubmissionDetail() {
  const { id } = useParams();
  const q = useQuery({ queryKey: ["admin-submission", id], queryFn: () => api.get<{ id: string; title: string | null; status: string; verdict: string | null; review: ReviewResult | null; error: string | null; draftText: string; createdAt: string; model: string | null; reasoningEffort: string | null; usage: Record<string, number> | null; costUsd: string | null; userName: string; userEmail: string; typeName: string; typeKey: string; typeVersion: number; basePromptVersion: number | null }>(`/api/admin/submissions/${id}`) });
  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorState error={q.error} retry={() => q.refetch()} />;
  const s = q.data!;
  return <div style={{ display: "grid", gap: 14 }}><Link to="/admin/submissions" className="wf-page-back">← Submission log</Link>
    <div className="wf-page-header" style={{ marginBottom: 0 }}><div><p className="eyebrow">{s.typeName} v{s.typeVersion} · base prompt v{s.basePromptVersion ?? "?"}</p><h2>{s.title ?? "Untitled"}</h2><p>{s.userName} &lt;{s.userEmail}&gt; · {fmtDate(s.createdAt)} · {s.model} / {s.reasoningEffort} · {s.usage?.total_tokens?.toLocaleString() ?? "?"} tokens · ${Number(s.costUsd ?? 0).toFixed(3)}</p></div></div>
    <div className="two-col"><div>{s.review ? <Review r={s.review} /> : s.error ? <State kind="error" title="Failed">{s.error}</State> : <State kind="loading" title={s.status} />}</div><div className="wf-card wf-card-section sticky" style={{ maxHeight: "80vh", overflow: "auto" }}><p className="eyebrow">Draft as submitted</p><pre className="mono">{s.draftText}</pre></div></div></div>;
}
