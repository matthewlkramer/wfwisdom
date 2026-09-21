import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import type { JobSummary, StageKey } from "@wfw/shared";
import { api } from "../../api";
import { ErrorState, Loading, State } from "../../components/ui";
import { TaxonomyTree } from "./TaxonomyTree";
type MapData = { jobs: JobSummary[]; stages: { key: StageKey; name: string }[] };
/** Two jobs on one page: editing the shape of the taxonomy, and moving resources around inside it. */
export function AdminTaxonomy() {
  const [view, setView] = useState<"structure" | "resources">("structure");
  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div className="wf-toolbar" role="tablist" aria-label="Taxonomy view">
        <button role="tab" aria-selected={view === "structure"} className={view === "structure" ? "primary-button small" : "small"} onClick={() => setView("structure")}>Structure</button>
        <button role="tab" aria-selected={view === "resources"} className={view === "resources" ? "primary-button small" : "small"} onClick={() => setView("resources")}>Move resources</button>
      </div>
      {view === "structure" ? <TaxonomyStructure /> : <TaxonomyTree />}
    </div>
  );
}

function TaxonomyStructure() {
  const qc = useQueryClient(); const inv = () => { qc.invalidateQueries({ queryKey: ["map"] }); };
  const q = useQuery({ queryKey: ["map"], queryFn: () => api.get<MapData>("/api/map") });
  const [editing, setEditing] = useState<{ kind: "job" | "subjob"; id: string } | null>(null);
  const [newJob, setNewJob] = useState({ key: "", name: "" }); const [newSub, setNewSub] = useState<{ jobId: string; key: string; name: string } | null>(null);
  const patchJob = useMutation({ mutationFn: ({ id, ...b }: { id: string } & Record<string, unknown>) => api.patch(`/api/admin/jobs/${id}`, b), onSuccess: inv });
  const patchSub = useMutation({ mutationFn: ({ id, ...b }: { id: string } & Record<string, unknown>) => api.patch(`/api/admin/subjobs/${id}`, b), onSuccess: inv });
  const addJob = useMutation({ mutationFn: (b: { key: string; name: string }) => api.post("/api/admin/jobs", b), onSuccess: () => { inv(); setNewJob({ key: "", name: "" }); } });
  const addSub = useMutation({ mutationFn: (b: { jobId: string; key: string; name: string }) => api.post("/api/admin/subjobs", b), onSuccess: () => { inv(); setNewSub(null); } });
  const reorder = useMutation({ mutationFn: (b: { jobs?: string[]; subjobs?: string[] }) => api.put("/api/admin/reorder", b), onSuccess: inv });
  const merge = useMutation({ mutationFn: ({ id, into }: { id: string; into: string }) => api.post(`/api/admin/subjobs/${id}/merge-into/${into}`), onSuccess: inv });
  const delJob = useMutation({ mutationFn: (id: string) => api.del(`/api/admin/jobs/${id}`), onSuccess: inv });
  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorState error={q.error} retry={() => q.refetch()} />;
  const { jobs, stages } = q.data!;
  const move = (ids: string[], i: number, dir: -1 | 1, kind: "jobs" | "subjobs") => { const j = i + dir; if (j < 0 || j >= ids.length) return; const next = [...ids]; [next[i], next[j]] = [next[j]!, next[i]!]; reorder.mutate({ [kind]: next }); };
  const err = [patchJob, patchSub, addJob, addSub, reorder, merge, delJob].find((m) => m.error)?.error;
  return (
    <div style={{ display: "grid", gap: 16 }}>
      <State kind="info" title="Changes apply immediately">Renames, reorders, moves, and merges take effect for every user as soon as you save. Items keep their placements when you rename or move a sub-job. Deleting a sub-job that still holds items is blocked; merge it instead.</State>
      {err ? <ErrorState error={err} /> : null}
      <div className="sort-list">
        {jobs.map((j, ji) => <div key={j.id} className="wf-card wf-card-section">
          <div className="sort-row" style={{ border: 0, padding: 0 }}>
            <button className="link-button small" onClick={() => move(jobs.map((x) => x.id), ji, -1, "jobs")} title="Move up"><ArrowUp size={14} /></button><button className="link-button small" onClick={() => move(jobs.map((x) => x.id), ji, 1, "jobs")} title="Move down"><ArrowDown size={14} /></button>
            {editing?.kind === "job" && editing.id === j.id ? <JobEditor job={j} onSave={(b) => { patchJob.mutate({ id: j.id, ...b }); setEditing(null); }} onCancel={() => setEditing(null)} /> : <><div className="grow"><strong style={{ fontFamily: "var(--wf-font-title)", fontSize: "1.15rem", color: "var(--teal-deep)" }}>{j.name}</strong> <span className="muted">· {j.key}</span>{j.staffOnly ? <span className="wf-status" style={{ marginLeft: 8 }}>staff only</span> : null}{j.hidden ? <span className="wf-status wf-status-attention" style={{ marginLeft: 8 }}>hidden</span> : null}<div className="muted" style={{ fontSize: ".85rem" }}>{j.description}</div></div><div className="inline-actions"><button className="small" onClick={() => setEditing({ kind: "job", id: j.id })}>Edit</button><button className="small" onClick={() => setNewSub({ jobId: j.id, key: `${j.key}.`, name: "" })}>Add sub-job</button>{j.subjobs.length === 0 ? <button className="danger small" onClick={() => { if (confirm(`Delete job "${j.name}"?`)) delJob.mutate(j.id); }}>Delete</button> : null}</div></>}
          </div>
          <div className="sort-list" style={{ marginTop: 10 }}>
            {j.subjobs.map((s, si) => <div key={s.id} className="sort-row">
              <button className="link-button small" onClick={() => move(j.subjobs.map((x) => x.id), si, -1, "subjobs")} title="Move up"><ArrowUp size={14} /></button><button className="link-button small" onClick={() => move(j.subjobs.map((x) => x.id), si, 1, "subjobs")} title="Move down"><ArrowDown size={14} /></button>
              {editing?.kind === "subjob" && editing.id === s.id ? <SubjobEditor sub={s} jobs={jobs} stages={stages} onSave={(b) => { patchSub.mutate({ id: s.id, ...b }); setEditing(null); }} onMerge={(into) => { if (confirm("Move every item into the target sub-job and delete this one?")) merge.mutate({ id: s.id, into }); setEditing(null); }} onCancel={() => setEditing(null)} /> : <><div className="grow"><Link to={`/map/${s.key}`}>{s.name}</Link> <span className="muted">· {s.itemCount} items · {s.stages.join(", ") || "no stages"}</span></div><button className="small" onClick={() => setEditing({ kind: "subjob", id: s.id })}>Edit</button></>}
            </div>)}
            {newSub?.jobId === j.id ? <form className="sort-row" onSubmit={(e) => { e.preventDefault(); addSub.mutate(newSub); }}><input placeholder="key (e.g. space.search)" value={newSub.key} onChange={(e) => setNewSub({ ...newSub, key: e.target.value })} /><input className="grow" placeholder="Name" value={newSub.name} onChange={(e) => setNewSub({ ...newSub, name: e.target.value })} /><button className="primary-button small" type="submit">Add</button><button className="small" type="button" onClick={() => setNewSub(null)}>Cancel</button></form> : null}
          </div>
        </div>)}
      </div>
      <form className="wf-card wf-card-section" onSubmit={(e) => { e.preventDefault(); addJob.mutate(newJob); }}><h3>Add a job</h3><div className="field-row"><label className="field"><span>Key (lowercase, no spaces)</span><input value={newJob.key} onChange={(e) => setNewJob({ ...newJob, key: e.target.value })} required pattern="[a-z][a-z0-9_]*" /></label><label className="field"><span>Name</span><input value={newJob.name} onChange={(e) => setNewJob({ ...newJob, name: e.target.value })} required /></label></div><div className="wf-form-actions"><button className="primary-button" type="submit">Add job</button></div></form>
    </div>
  );
}
function JobEditor({ job, onSave, onCancel }: { job: JobSummary; onSave: (b: Record<string, unknown>) => void; onCancel: () => void }) {
  const [f, setF] = useState({ name: job.name, description: job.description ?? "", staffOnly: job.staffOnly, hidden: job.hidden });
  return <form className="grow" style={{ display: "grid", gap: 8 }} onSubmit={(e) => { e.preventDefault(); onSave(f); }}><div className="field-row"><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoFocus /><input value={f.description} placeholder="Description" onChange={(e) => setF({ ...f, description: e.target.value })} /></div><div className="inline-actions"><label><input type="checkbox" checked={f.staffOnly} onChange={(e) => setF({ ...f, staffOnly: e.target.checked })} /> Foundation partner job (shown last, labeled)</label><label><input type="checkbox" checked={f.hidden} onChange={(e) => setF({ ...f, hidden: e.target.checked })} /> Hidden from teacher leaders</label><button className="primary-button small" type="submit">Save</button><button className="small" type="button" onClick={onCancel}>Cancel</button></div></form>;
}
function SubjobEditor({ sub, jobs, stages, onSave, onMerge, onCancel }: { sub: JobSummary["subjobs"][number]; jobs: JobSummary[]; stages: { key: StageKey; name: string }[]; onSave: (b: Record<string, unknown>) => void; onMerge: (into: string) => void; onCancel: () => void }) {
  const parent = jobs.find((j) => j.subjobs.some((s) => s.id === sub.id))!;
  const [f, setF] = useState({ name: sub.name, description: sub.description ?? "", jobId: parent.id, stages: sub.stages as string[] }); const [mergeInto, setMergeInto] = useState("");
  return <form className="grow" style={{ display: "grid", gap: 8 }} onSubmit={(e) => { e.preventDefault(); onSave(f); }}>
    <div className="field-row"><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoFocus /><input value={f.description} placeholder="Description" onChange={(e) => setF({ ...f, description: e.target.value })} /><select value={f.jobId} onChange={(e) => setF({ ...f, jobId: e.target.value })}>{jobs.map((j) => <option key={j.id} value={j.id}>Move to: {j.name}</option>)}</select></div>
    <div className="inline-actions">{stages.map((s) => <label key={s.key}><input type="checkbox" checked={f.stages.includes(s.key)} onChange={(e) => setF({ ...f, stages: e.target.checked ? [...f.stages, s.key] : f.stages.filter((x) => x !== s.key) })} /> {s.name}</label>)}</div>
    <div className="inline-actions"><button className="primary-button small" type="submit">Save</button><button className="small" type="button" onClick={onCancel}>Cancel</button><span className="muted">·</span><select value={mergeInto} onChange={(e) => setMergeInto(e.target.value)}><option value="">Merge into…</option>{jobs.flatMap((j) => j.subjobs.filter((s) => s.id !== sub.id).map((s) => <option key={s.id} value={s.id}>{j.name} › {s.name}</option>))}</select><button className="danger small" type="button" disabled={!mergeInto} onClick={() => onMerge(mergeInto)}>Merge and delete</button></div>
  </form>;
}
