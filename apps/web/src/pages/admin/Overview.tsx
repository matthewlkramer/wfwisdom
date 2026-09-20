import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router-dom";
import type { Settings } from "@wfw/shared";
import { api, fmtDate } from "../../api";
import { ErrorState, Loading, State } from "../../components/ui";
type Run = { id: string; kind: string; status: string; triggeredBy: string | null; startedAt: string; finishedAt: string | null; stats: Record<string, unknown>; error: string | null; log: string };
type Overview = { counts: { items: number; withText: number; linkOnly: number; chunks: number; pendingReview: number; users: number; staff: number; submissions: number; submissionCost: number }; usageToday: { reviews: number; chatTurns: number; reviewCost: number; chatCost: number }; indexing: boolean; importing: boolean; lastRuns: Run[]; settings: Settings };
type ImportStatus = { counts: { remainingPosts: number; remainingSeries: number; remainingQuestions: number; imported: number; failed: number; files: number }; failed: { id: string; title: string; kind: string; error: string | null }[]; running: boolean; lastRuns: Run[]; connectedSyncEnabled: boolean; driveReady: boolean };

/** Moving everything out of Connected into Wisdom-owned files, so Connected can be switched off. */
function ImportPanel() {
  const qc = useQueryClient(); const [openRun, setOpenRun] = useState<string | null>(null);
  const q = useQuery({ queryKey: ["admin-import"], queryFn: () => api.get<ImportStatus>("/api/admin/import/status"), refetchInterval: (query) => (query.state.data?.running ? 4000 : false) });
  const run = useQuery({ queryKey: ["admin-run", openRun], queryFn: () => api.get<Run>(`/api/admin/runs/${openRun}`), enabled: !!openRun, refetchInterval: (query) => (query.state.data?.status === "running" ? 3000 : false) });
  const inv = () => { qc.invalidateQueries({ queryKey: ["admin-import"] }); qc.invalidateQueries({ queryKey: ["admin-overview"] }); };
  const start = useMutation({ mutationFn: (b: { limit?: number; dryRun?: boolean }) => api.post<{ runId: string }>("/api/admin/import/start", b), onSuccess: (r) => { setOpenRun(r.runId); inv(); } });
  const sync = useMutation({ mutationFn: (connectedSyncEnabled: boolean) => api.put("/api/admin/settings", { connectedSyncEnabled }), onSuccess: inv });
  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorState error={q.error} retry={() => q.refetch()} />;
  const d = q.data!; const c = d.counts; const remaining = c.remainingPosts + c.remainingSeries + c.remainingQuestions;
  const runInfo = run.data ?? d.lastRuns[0];
  return (
    <section className="wf-card wf-card-section">
      <div className="wf-section-header" style={{ marginTop: 0 }}><div><h2>Move off Connected</h2><p>Copies every Connected item into Wildflower Wisdom for good: files go to the Wisdom Drive folder (Office files become Google Docs, Slides, and Sheets), posts with real text become Google Docs, and series and questions become native items. Ids, placements, curation, and votes are kept. It can be stopped and re-run; finished items are skipped and failed ones retried. Try a few first, then import everything.</p></div>
        <div className="inline-actions"><button className="primary-button" onClick={() => start.mutate({})} disabled={d.running || start.isPending || !d.driveReady || remaining === 0}>{d.running ? "Importing…" : "Import everything"}</button><button onClick={() => start.mutate({ limit: 5 })} disabled={d.running || start.isPending || !d.driveReady || remaining === 0} title="Import the next five items only">Import 5 as a test</button><button onClick={() => start.mutate({ dryRun: true, limit: 50 })} disabled={d.running || start.isPending || remaining === 0} title="Log what would happen to the next 50 items without uploading or changing anything">Dry run</button></div></div>
      {!d.driveReady ? <State kind="info" title="Drive is not set up here">GOOGLE_SERVICE_ACCOUNT_JSON and GOOGLE_SHARED_DRIVE_ID must be set for files to be uploaded. A dry run still works.</State> : null}
      <div className="admin-grid" style={{ marginTop: 12 }}>
        {[["Still in Connected", remaining], ["Posts left", c.remainingPosts], ["Series left", c.remainingSeries], ["Questions left", c.remainingQuestions], ["Imported", c.imported], ["Files in Drive", c.files], ["Failed last time", c.failed]].map(([l, v]) => <div key={String(l)} className="wf-card wf-card-metric"><span className="wf-card-value">{v as number}</span><small>{l as string}</small></div>)}
      </div>
      <p className="muted" style={{ fontSize: ".85rem", marginTop: 12 }}>Connected sync is <strong>{d.connectedSyncEnabled ? "on" : "off"}</strong>: {d.connectedSyncEnabled ? "the nightly index still reads Connected for items not yet imported. It switches itself off when nothing is left." : "the nightly index no longer talks to Connected; it only refreshes Google files. Connected can be shut down."} <button className="link-button small" onClick={() => sync.mutate(!d.connectedSyncEnabled)} disabled={sync.isPending}>{d.connectedSyncEnabled ? "Switch off now" : "Switch back on"}</button></p>
      <p className="muted" style={{ fontSize: ".85rem" }}>Large videos take a while on the published site. The same import can be run from the Replit workspace, which is faster: set <code>IMPORT_DATABASE_URL</code> to the production database URL there and run <code>pnpm import:connected</code>.</p>
      {start.error ? <ErrorState error={start.error} /> : null}
      {runInfo ? <div><p className="muted" style={{ fontSize: ".85rem" }}>Last run: {runInfo.status} · started {fmtDate(runInfo.startedAt)} by {runInfo.triggeredBy ?? "?"}{runInfo.finishedAt ? ` · finished ${new Date(runInfo.finishedAt).toLocaleTimeString()}` : ""} · {Object.entries(runInfo.stats).map(([k, v]) => `${k} ${k === "bytesUploaded" ? `${(Number(v) / 1024 / 1024).toFixed(0)} MB` : String(v)}`).join(", ")}</p>{runInfo.error ? <State kind="error" title="Run failed">{runInfo.error}</State> : null}{(openRun || runInfo.status === "running") && runInfo.log ? <pre className="mono log-box">{runInfo.log}</pre> : null}<div className="inline-actions" style={{ marginTop: 8 }}>{d.lastRuns.map((r) => <button key={r.id} className="link-button small" onClick={() => setOpenRun(r.id)}>{r.status} · {fmtDate(r.startedAt)}</button>)}</div></div> : null}
      {d.failed.length ? <div style={{ marginTop: 12 }}><h3 style={{ margin: "0 0 6px" }}>Could not be imported</h3><p className="muted" style={{ fontSize: ".85rem", marginTop: 0 }}>These are retried on the next run. If one keeps failing, open it to see what it holds.</p><ul className="wf-list tight" style={{ fontSize: ".875rem" }}>{d.failed.map((f) => <li key={f.id}><Link to={`/item/${f.id}`}>{f.title}</Link> <span className="muted">({f.kind}) {f.error}</span></li>)}</ul></div> : null}
    </section>
  );
}
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
        <div className="wf-section-header" style={{ marginTop: 0 }}><div><h2>{s.connectedSyncEnabled ? "Re-index Connected" : "Nightly refresh"}</h2><p>{s.connectedSyncEnabled ? "Pulls every post, series, and question from Connected through the Bloomfire API, extracts attachment and linked Google Doc text, embeds what changed, writes summaries, and recomputes scores. Runs nightly at 03:10 UTC; run it now after big changes in Connected." : "Connected sync is off. The nightly run picks up edits made in Google, embeds what changed, writes summaries, and recomputes scores."}</p></div>
          <div className="inline-actions"><button className="primary-button" onClick={() => reindex.mutate(false)} disabled={d.indexing || d.importing || reindex.isPending}>{d.indexing ? "Running…" : s.connectedSyncEnabled ? "Re-index now" : "Refresh now"}</button><button onClick={() => reindex.mutate(true)} disabled={d.indexing || d.importing || reindex.isPending} title="Re-fetch every item even if unchanged">Full re-index</button><button onClick={() => rescore.mutate()} disabled={rescore.isPending}>Recompute scores</button></div></div>
        {reindex.error ? <ErrorState error={reindex.error} /> : null}
        {runInfo ? <div><p className="muted" style={{ fontSize: ".85rem" }}>Last run: {runInfo.status} · started {fmtDate(runInfo.startedAt)} by {runInfo.triggeredBy ?? "?"}{runInfo.finishedAt ? ` · finished ${new Date(runInfo.finishedAt).toLocaleTimeString()}` : ""} · {Object.entries(runInfo.stats).map(([k, v]) => `${k} ${v}`).join(", ")}</p>{runInfo.error ? <State kind="error" title="Run failed">{runInfo.error}</State> : null}{(openRun || runInfo.status === "running") && runInfo.log ? <pre className="mono log-box">{runInfo.log}</pre> : null}<div className="inline-actions" style={{ marginTop: 8 }}>{d.lastRuns.map((r) => <button key={r.id} className="link-button small" onClick={() => setOpenRun(r.id)}>{r.status} · {fmtDate(r.startedAt)}</button>)}</div></div> : <State kind="empty" title="Connected has not been indexed yet">Run the first index to populate the map and search.</State>}
      </section>
      <ImportPanel />
      <section className="wf-card wf-card-section"><h2>Models and limits</h2><p className="muted">Reviews: {s.reviewModel} ({s.reviewEffort}) · Assist and chat: {s.assistModel} / {s.chatModel} · Embeddings: {s.embeddingModel} · {s.reviewsPerAccountPerDay} reviews per account per day, {s.reviewsPerDayGlobal} per day overall. <Link to="/admin/settings">Change in Settings</Link>.</p></section>
    </div>
  );
}
