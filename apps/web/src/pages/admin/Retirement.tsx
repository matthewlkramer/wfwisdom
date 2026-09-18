import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router-dom";
import type { ItemSummary } from "@wfw/shared";
import { api, fmtDate, fmtMonth } from "../../api";
import { ErrorState, Loading, State } from "../../components/ui";
type Row = ItemSummary & { reason: string | null; reviewedBy: string | null; reviewedAt: string | null };
export function AdminRetirement() {
  const qc = useQueryClient(); const [status, setStatus] = useState("pending");
  const q = useQuery({ queryKey: ["retirement", status], queryFn: () => api.get<{ items: Row[] }>(`/api/admin/retirement-queue?status=${status}`) });
  const decide = useMutation({ mutationFn: ({ id, decision, datedLabel }: { id: string; decision: string; datedLabel?: string }) => api.post(`/api/admin/retirement-queue/${id}`, { decision, datedLabel }), onSuccess: () => { qc.invalidateQueries({ queryKey: ["retirement"] }); qc.invalidateQueries({ queryKey: ["admin-overview"] }); } });
  return (
    <div style={{ display: "grid", gap: 14 }}>
      <State kind="info" title="Proposed retirement queue">Items the classifier flagged as dated arrive here after each re-index. Nothing is hidden until a person decides. <strong>Keep</strong> leaves it as is. <strong>Label as dated</strong> keeps it searchable with a visible year label and drops it from Start here and Most used. <strong>Hide</strong> removes it from teacher-leader views (still visible to staff).</State>
      <div className="segmented">{[["pending", "Awaiting decision"], ["keep", "Kept"], ["dated", "Labeled dated"], ["hidden", "Hidden"]].map(([k, l]) => <button key={k} className={status === k ? "active" : ""} onClick={() => setStatus(k!)}>{l}</button>)}</div>
      {q.isLoading ? <Loading /> : q.error ? <ErrorState error={q.error} retry={() => q.refetch()} /> : q.data!.items.length === 0 ? <State kind="empty" title="Nothing here" /> :
        <div className="table-wrap"><table className="wf-table"><thead><tr><th>Item</th><th>Updated</th><th>Views</th><th>Why flagged</th><th>{status === "pending" ? "Decision" : "Decided by"}</th></tr></thead><tbody>
          {q.data!.items.map((r) => <tr key={r.id}><td><Link to={`/item/${r.id}`}>{r.title}</Link>{r.dated ? <> <span className="wf-status wf-status-attention">{r.dated}</span></> : null}</td><td>{fmtMonth(r.updatedAt)}</td><td>{r.views}</td><td style={{ maxWidth: 420 }}>{r.reason}</td>
            <td>{status === "pending" ? <div className="inline-actions"><button className="small" onClick={() => decide.mutate({ id: r.id, decision: "keep" })}>Keep</button><button className="small" onClick={() => decide.mutate({ id: r.id, decision: "dated" })}>Label as dated</button><button className="danger small" onClick={() => decide.mutate({ id: r.id, decision: "hidden" })}>Hide</button></div> : <span className="muted">{r.reviewedBy} · {fmtDate(r.reviewedAt)}<br /><button className="link-button small" onClick={() => decide.mutate({ id: r.id, decision: status === "keep" ? "dated" : "keep" })}>{status === "keep" ? "Label as dated instead" : "Keep instead"}</button></span>}</td></tr>)}
        </tbody></table></div>}
    </div>
  );
}
