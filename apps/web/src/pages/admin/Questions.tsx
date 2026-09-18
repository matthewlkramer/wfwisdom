import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ChevronLeft, ChevronRight, X } from "lucide-react";
import { Link } from "react-router-dom";
import type { StaffQuestion, StaffQuestionListResult } from "@wfw/shared";
import { api, fmtDate } from "../../api";
import { ErrorState, Loading, State } from "../../components/ui";

const REVIEWED = [["all", "All"], ["unreviewed", "Unreviewed"], ["reviewed", "Reviewed"]] as const;
const SHARE = [["all", "All"], ["pending", "Waiting on approval"], ["approved", "Approved"], ["rejected", "Rejected"]] as const;
type Reviewed = (typeof REVIEWED)[number][0];
type Share = (typeof SHARE)[number][0];

export function AdminQuestions() {
  const qc = useQueryClient();
  const [reviewed, setReviewed] = useState<Reviewed>("unreviewed");
  const [share, setShare] = useState<Share>("all");
  const [page, setPage] = useState(1);
  const [note, setNote] = useState<Record<string, string>>({});
  useEffect(() => { setPage(1); }, [reviewed, share]);

  const q = useQuery({ queryKey: ["admin-questions", reviewed, share, page], queryFn: () => api.get<StaffQuestionListResult>(`/api/admin/questions?reviewed=${reviewed}&share=${share}&page=${page}&limit=25`) });
  const refresh = () => qc.invalidateQueries({ queryKey: ["admin-questions"] });
  const update = useMutation({ mutationFn: ({ id, changes }: { id: string; changes: { reviewed?: boolean; shareStatus?: "approved" | "rejected" | "pending" } }) => api.patch<{ question: StaffQuestion }>(`/api/admin/questions/${id}`, changes), onSuccess: refresh });
  const addNote = useMutation({ mutationFn: ({ id, body }: { id: string; body: string }) => api.post<{ question: StaffQuestion }>(`/api/admin/questions/${id}/notes`, { body }), onSuccess: (_r, v) => { setNote((n) => ({ ...n, [v.id]: "" })); refresh(); } });

  const questions = q.data?.questions ?? [];
  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div className="filter-bar">
        <div className="chip-group" role="group" aria-label="Review state">{REVIEWED.map(([k, label]) => <button key={k} type="button" className={`chip${reviewed === k ? " on" : ""}`} onClick={() => setReviewed(k)}>{label}</button>)}</div>
        <div className="chip-group" role="group" aria-label="Sharing">{SHARE.map(([k, label]) => <button key={k} type="button" className={`chip${share === k ? " on" : ""}`} onClick={() => setShare(k)}>{label}</button>)}</div>
      </div>
      {q.error ? <ErrorState error={q.error} retry={() => q.refetch()} /> : null}
      {update.error ? <State kind="error" title="Could not save">{String((update.error as Error).message)}</State> : null}
      {addNote.error ? <State kind="error" title="Could not add the note">{String((addNote.error as Error).message)}</State> : null}

      {q.isLoading ? <Loading what="Loading the queue" />
        : questions.length === 0 ? <State kind="empty" title="Nothing here">No question matches these filters. Questions appear when the asker ticks "let staff review this" or offers to share it.</State>
        : <div className="wf-list">
          {questions.map((it) => (
            <article key={it.id} className="wf-card wf-card-section question-row">
              <div className="wf-record-heading">
                <span><strong>{it.question}</strong></span>
                <span className="wf-record-tags">
                  {it.reviewedAt ? <span className="wf-status wf-status-complete">Reviewed</span> : <span className="wf-status wf-status-attention">Unreviewed</span>}
                  {it.share.requested ? <span className={`wf-status wf-status-${it.share.status === "approved" ? "complete" : it.share.status === "rejected" ? "stage" : "active"}`}>Share: {it.share.status === "pending" ? "waiting" : it.share.status}</span> : null}
                </span>
              </div>
              <p className="muted" style={{ margin: 0, fontSize: ".85rem" }}>
                {it.askerName} &lt;{it.askerEmail}&gt; · {fmtDate(it.createdAt)}
                {it.share.requested ? ` · asked to share ${it.share.attribution === "name" ? "with their name" : "anonymously"}` : ""}
                {it.covered === false ? " · Connected did not cover this" : ""}
              </p>
              <div className="question-answer" style={{ whiteSpace: "pre-wrap" }}>{it.answer ?? "No answer was recorded."}</div>
              {it.citations.length ? <ul className="chat-cites">{it.citations.map((c, i) => <li key={c.itemId}>[{i + 1}] <Link to={`/item/${c.itemId}`}>{c.title}</Link></li>)}</ul> : null}

              {it.notes.length ? <ul className="wf-list tight" style={{ fontSize: ".875rem" }}>{it.notes.map((n) => <li key={n.id}><strong>{n.authorName}</strong> <span className="muted">· {fmtDate(n.createdAt)}</span><div>{n.body}</div></li>)}</ul> : null}
              <label className="field">Add a note<textarea rows={2} value={note[it.id] ?? ""} onChange={(e) => setNote((n) => ({ ...n, [it.id]: e.target.value }))} placeholder="What did we learn from this question?" /></label>
              <div className="inline-actions">
                <button type="button" disabled={addNote.isPending || !(note[it.id] ?? "").trim()} onClick={() => addNote.mutate({ id: it.id, body: (note[it.id] ?? "").trim() })}>Save note</button>
                <button type="button" className={it.reviewedAt ? "" : "primary-button"} disabled={update.isPending} onClick={() => update.mutate({ id: it.id, changes: { reviewed: !it.reviewedAt } })}>{it.reviewedAt ? "Mark unreviewed" : "Mark reviewed"}</button>
                {it.share.requested && it.share.status !== "approved" ? <button type="button" disabled={update.isPending} onClick={() => update.mutate({ id: it.id, changes: { shareStatus: "approved" } })}><Check size={15} /> Approve sharing</button> : null}
                {it.share.requested && it.share.status !== "rejected" ? <button type="button" disabled={update.isPending} onClick={() => update.mutate({ id: it.id, changes: { shareStatus: "rejected" } })}><X size={15} /> Reject sharing</button> : null}
              </div>
              {it.reviewedAt ? <p className="muted" style={{ margin: 0, fontSize: ".78rem" }}>Reviewed by {it.reviewedBy} on {fmtDate(it.reviewedAt)}{it.shareDecidedAt ? ` · sharing decided by ${it.shareDecidedBy} on ${fmtDate(it.shareDecidedAt)}` : ""}</p> : null}
            </article>
          ))}
        </div>}

      {q.data?.pagination ? <footer className="pagination"><span className="muted">{questions.length} on this page · {q.data.pagination.total} total</span><div className="inline-actions"><button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}><ChevronLeft size={15} /> Previous</button><span>Page {page} of {q.data.pagination.pageCount}</span><button type="button" disabled={page >= q.data.pagination.pageCount} onClick={() => setPage((p) => p + 1)}>Next <ChevronRight size={15} /></button></div></footer> : null}
    </div>
  );
}
