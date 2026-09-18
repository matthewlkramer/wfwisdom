import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router-dom";
import type { Settings } from "@wfw/shared";
import { api, fmtDate } from "../../api";
import { ErrorState, Loading, State } from "../../components/ui";
type Run = { id: string; kind: string; status: string; triggeredBy: string | null; startedAt: string; finishedAt: string | null; stats: Record<string, unknown>; error: string | null; log: string };
type Overview = { counts: { items: number; withText: number; linkOnly: number; chunks: number; pendingReview: number; users: number; staff: number; submissions: number; submissionCost: number }; usageToday: { reviews: number; chatTurns: number; reviewCost: number; chatCost: number }; indexing: boolean; lastRuns: Run[]; settings: Settings };
export function AdminOverview() {
  const qc = useQueryClient(); const [openRun, setOpenRun] = useState<string | null>(null);
  const q = useQuery({ queryKey: ["admin-overview"], queryFn: () => api.get<Overview>("/api/admin/overview"), refetchInterval: (query) => (query.state.data?.indexing ? 4000 : false) });
  const run = useQuery({ queryKey: ["admin-run", openRun], queryFn: () => api.get<Run>(`/api/admin/runs/${openRun}`), enabled: !!openRun, refetchInterval: (query) => (query.state.data?.status === "running" ? 3000 : false) });
  const reindex = useMutation({ mutationFn: (full: boolean) => api.post<{ runId: string }>("/api/admin/reindex", { full }), onSuccess: (r) => { setOpenRun(r.runId); qc.invalidateQueries({ queryKey: ["admin-overview"] }); } });
  const rescore = useMutation({ mutationFn: () => api.post("/api/admin/rescore"), onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-overview"] }) });
  const kill = useMutation({ mutationFn: (killSwitch: boolean) => api.put("/api/admin/settings", { killSwitch }), onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-overview"] }) });
  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorState error={q.error} retry={() => q.refetch()} />;
  const d = q.data!;
  const s = d.settings;
  const runInfo = run.data ?? d.lastRuns[0];
  return (
    <div style={{ display: "grid", gap: 20 }}>
      <div className="kill"><strong>AI kill switch:</strong> <span>{s.killSwitch ? "ON. Reviews and chat are paused for everyone." : "Off. Reviews and chat are running."}</span><button className={s.killSwitch ? "primary-button" : "danger"} onClick={() => kill.mutate(!s.killSwitch)} disabled={kill.isPending}>{s.killSwitch ? "Resume AI features" : "Pause all AI features"}</button></div>
      <div className="admin-grid">
        {[["Items indexed", d.counts.items], ["With searchable text", d.counts.withText], ["Link-only", d.counts.linkOnly], ["Embedded chunks", d.counts.chunks], ["Awaiting retirement review", d.counts.pendingReview], ["Users", `${d.counts.users} (${d.counts.staff} staff)`], ["Reviews today", `${d.usageToday.reviews} / ${s.reviewsPerDayGlobal}`], ["Chat turns today", `${d.usageToday.chatTurns} / ${s.chatTurnsPerDayGlobal}`], ["Spend today", `$${(d.usageToday.reviewCost + d.usageToday.chatCost).toFixed(2)}`], ["Reviews all time", `${d.counts.submissions} ($${d.counts.submissionCost.toFixed(2)})`]].map(([l, v]) => <div key={String(l)} className="wf-card wf-card-metric"><span className="wf-card-value">{v as string}</span><small>{l as string}</small></div>)}
      </div>
      <section className="wf-card wf-card-section">
        <div className="wf-section-header" style={{ marginTop: 0 }}><div><h2>Re-index Connected</h2><p>Pulls every post, series, and question from Connected through the Bloomfire API, extracts attachment and linked Google Doc text, embeds what changed, writes summaries, and recomputes scores. Runs nightly at 03:10 UTC; run it now after big changes in Connected.</p></div>
          <div className="inline-actions"><button className="primary-button" onClick={() => reindex.mutate(false)} disabled={d.indexing || reindex.isPending}>{d.indexing ? "Running…" : "Re-index now"}</button><button onClick={() => reindex.mutate(true)} disabled={d.indexing || reindex.isPending} title="Re-fetch every item even if unchanged">Full re-index</button><button onClick={() => rescore.mutate()} disabled={rescore.isPending}>Recompute scores</button></div></div>
        {reindex.error ? <ErrorState error={reindex.error} /> : null}
        {runInfo ? <div><p className="muted" style={{ fontSize: ".85rem" }}>Last run: {runInfo.status} · started {fmtDate(runInfo.startedAt)} by {runInfo.triggeredBy ?? "?"}{runInfo.finishedAt ? ` · finished ${new Date(runInfo.finishedAt).toLocaleTimeString()}` : ""} · {Object.entries(runInfo.stats).map(([k, v]) => `${k} ${v}`).join(", ")}</p>{runInfo.error ? <State kind="error" title="Run failed">{runInfo.error}</State> : null}{(openRun || runInfo.status === "running") && runInfo.log ? <pre className="mono log-box">{runInfo.log}</pre> : null}<div className="inline-actions" style={{ marginTop: 8 }}>{d.lastRuns.map((r) => <button key={r.id} className="link-button small" onClick={() => setOpenRun(r.id)}>{r.status} · {fmtDate(r.startedAt)}</button>)}</div></div> : <State kind="empty" title="Connected has not been indexed yet">Run the first index to populate the map and search.</State>}
      </section>
      <section className="wf-card wf-card-section"><h2>Models and limits</h2><p className="muted">Reviews: {s.reviewModel} ({s.reviewEffort}) · Assist and chat: {s.assistModel} / {s.chatModel} · Embeddings: {s.embeddingModel} · {s.reviewsPerAccountPerDay} reviews per account per day, {s.reviewsPerDayGlobal} per day overall. <Link to="/admin/settings">Change in Settings</Link>.</p></section>
    </div>
  );
}
