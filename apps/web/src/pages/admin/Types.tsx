import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import type { ItemSummary, ReviewResult } from "@wfw/shared";
import { api, fmtDate } from "../../api";
import { ErrorState, Loading, Markdown, SearchInput, State } from "../../components/ui";
import { Review } from "../Submissions";
type T = { id: string; key: string; name: string; shortDescription: string | null; jobKey: string | null; sort: number; active: boolean; guideMd: string; rubric: { criterion: string; description: string }[]; reviewerNotes: string; model: string | null; reasoningEffort: string | null; version: number; updatedAt: string; updatedBy: string | null; submissionCount?: number };
export function AdminTypes() {
  const qc = useQueryClient(); const nav = useNavigate();
  const q = useQuery({ queryKey: ["admin-types"], queryFn: () => api.get<{ types: T[] }>("/api/admin/types") });
  const jobs = useQuery({ queryKey: ["types"], queryFn: () => api.get<{ jobs: { key: string; name: string }[] }>("/api/types") });
  const [n, setN] = useState({ key: "", name: "", jobKey: "", guideMd: "**Purpose.** \n\n**Audience.** \n\n**Must-have elements.**\n1. \n\n**Common mistakes.**\n- \n\n**Tone.** \n\n**Wildflower-specific considerations.**\n- ", rubric: [{ criterion: "", description: "" }] });
  const create = useMutation({ mutationFn: () => api.post<T>("/api/admin/types", { ...n, jobKey: n.jobKey || null, rubric: n.rubric.filter((r) => r.criterion) }), onSuccess: (t) => { qc.invalidateQueries({ queryKey: ["admin-types"] }); nav(`/admin/types/${t.id}`); } });
  const toggle = useMutation({ mutationFn: ({ id, active }: { id: string; active: boolean }) => api.patch(`/api/admin/types/${id}`, { active }), onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-types"] }); qc.invalidateQueries({ queryKey: ["types"] }); } });
  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorState error={q.error} retry={() => q.refetch()} />;
  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div className="table-wrap"><table className="wf-table"><thead><tr><th>Type</th><th>Job</th><th>Version</th><th>Model</th><th>Submissions</th><th>Updated</th><th></th></tr></thead><tbody>
        {q.data!.types.map((t) => <tr key={t.id} className={t.active ? "" : "muted"}><td><Link to={`/admin/types/${t.id}`}>{t.name}</Link>{!t.active ? <span className="wf-status" style={{ marginLeft: 6 }}>inactive</span> : null}<div className="muted" style={{ fontSize: ".8rem" }}>{t.shortDescription}</div></td><td>{jobs.data?.jobs.find((j) => j.key === t.jobKey)?.name ?? t.jobKey}</td><td>v{t.version}</td><td>{t.model ?? "default"}{t.reasoningEffort ? ` / ${t.reasoningEffort}` : ""}</td><td>{t.submissionCount ?? 0}</td><td>{fmtDate(t.updatedAt)}<div className="muted" style={{ fontSize: ".75rem" }}>{t.updatedBy}</div></td><td><button className="small" onClick={() => toggle.mutate({ id: t.id, active: !t.active })}>{t.active ? "Deactivate" : "Activate"}</button></td></tr>)}
      </tbody></table></div>
      <form className="wf-card wf-card-section" onSubmit={(e) => { e.preventDefault(); create.mutate(); }} style={{ display: "grid", gap: 12 }}><h2>Add a material type</h2>
        <div className="field-row"><label className="field"><span>Key (lowercase, underscores)</span><input required pattern="[a-z][a-z0-9_]*" value={n.key} onChange={(e) => setN({ ...n, key: e.target.value })} /></label><label className="field"><span>Name</span><input required value={n.name} onChange={(e) => setN({ ...n, name: e.target.value })} /></label><label className="field"><span>Job</span><select value={n.jobKey} onChange={(e) => setN({ ...n, jobKey: e.target.value })}><option value="">—</option>{jobs.data?.jobs.map((j) => <option key={j.key} value={j.key}>{j.name}</option>)}</select></label></div>
        <label className="field"><span>What good looks like (Markdown)</span><textarea rows={10} value={n.guideMd} onChange={(e) => setN({ ...n, guideMd: e.target.value })} /></label>
        <RubricEditor rubric={n.rubric} onChange={(rubric) => setN({ ...n, rubric })} />
        {create.error ? <ErrorState error={create.error} /> : null}
        <div className="wf-form-actions"><button className="primary-button" type="submit">Create type</button></div></form>
    </div>
  );
}
function RubricEditor({ rubric, onChange }: { rubric: { criterion: string; description: string }[]; onChange: (r: { criterion: string; description: string }[]) => void }) {
  return <div className="field"><span>Rubric criteria (scored 1 to 5)</span><div style={{ display: "grid", gap: 6 }}>{rubric.map((r, i) => <div key={i} className="inline-actions" style={{ display: "grid", gridTemplateColumns: "minmax(140px,1fr) minmax(200px,2fr) auto", gap: 6 }}><input placeholder="Criterion" value={r.criterion} onChange={(e) => onChange(rubric.map((x, j) => (j === i ? { ...x, criterion: e.target.value } : x)))} /><input placeholder="What a 5 looks like" value={r.description} onChange={(e) => onChange(rubric.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)))} /><button type="button" className="link-button small" onClick={() => onChange(rubric.filter((_, j) => j !== i))}>Remove</button></div>)}<div><button type="button" className="small" onClick={() => onChange([...rubric, { criterion: "", description: "" }])} disabled={rubric.length >= 8}>Add criterion</button></div></div></div>;
}
export function AdminTypeEditor() {
  const { id } = useParams(); const qc = useQueryClient();
  const q = useQuery({ queryKey: ["admin-type", id], queryFn: () => api.get<{ type: T; versions: { version: number; note: string | null; createdBy: string | null; createdAt: string }[]; resources: ItemSummary[] }>(`/api/admin/types/${id}`) });
  const jobs = useQuery({ queryKey: ["types"], queryFn: () => api.get<{ jobs: { key: string; name: string }[] }>("/api/types") });
  const [f, setF] = useState<T | null>(null); const [note, setNote] = useState(""); const [tab, setTab] = useState<"edit" | "resources" | "test" | "history">("edit");
  useEffect(() => { if (q.data) setF(q.data.type); }, [q.data]);
  const save = useMutation({ mutationFn: (t: T) => api.patch<T>(`/api/admin/types/${id}`, { name: t.name, shortDescription: t.shortDescription, jobKey: t.jobKey, guideMd: t.guideMd, rubric: t.rubric, reviewerNotes: t.reviewerNotes, model: t.model, reasoningEffort: t.reasoningEffort, active: t.active, note }), onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-type", id] }); qc.invalidateQueries({ queryKey: ["admin-types"] }); qc.invalidateQueries({ queryKey: ["type"] }); setNote(""); } });
  if (q.isLoading || !f) return <Loading />;
  if (q.error) return <ErrorState error={q.error} retry={() => q.refetch()} />;
  const dirty = JSON.stringify(f) !== JSON.stringify(q.data!.type);
  return (
    <div style={{ display: "grid", gap: 14 }}>
      <Link to="/admin/types" className="wf-page-back">← Material types</Link>
      <div className="wf-page-header" style={{ marginBottom: 0 }}><div><h2>{q.data!.type.name}</h2><p>Version {q.data!.type.version} · <Link to={`/materials/${q.data!.type.key}`}>view as a teacher leader</Link></p></div></div>
      <div className="wf-tabs">{(["edit", "resources", "test", "history"] as const).map((t) => <button key={t} className={tab === t ? "active" : ""} onClick={() => setTab(t)}>{{ edit: "Guide and prompt", resources: `Linked resources (${q.data!.resources.length})`, test: "Test the prompt", history: `Version history (${q.data!.versions.length})` }[t]}</button>)}</div>
      {tab === "edit" ? <form onSubmit={(e) => { e.preventDefault(); save.mutate(f); }} style={{ display: "grid", gap: 14 }}>
        <div className="field-row"><label className="field"><span>Name</span><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></label><label className="field"><span>Short description</span><input value={f.shortDescription ?? ""} onChange={(e) => setF({ ...f, shortDescription: e.target.value })} /></label><label className="field"><span>Job</span><select value={f.jobKey ?? ""} onChange={(e) => setF({ ...f, jobKey: e.target.value || null })}><option value="">—</option>{jobs.data?.jobs.map((j) => <option key={j.key} value={j.key}>{j.name}</option>)}</select></label><label className="field"><span>Model override</span><select value={f.model ?? ""} onChange={(e) => setF({ ...f, model: e.target.value || null })}><option value="">Use global default</option>{["gpt-5.6-sol", "gpt-5.6-terra", "gpt-5.6-luna"].map((m) => <option key={m}>{m}</option>)}</select></label><label className="field"><span>Reasoning effort override</span><select value={f.reasoningEffort ?? ""} onChange={(e) => setF({ ...f, reasoningEffort: e.target.value || null })}><option value="">Use global default</option><option>low</option><option>medium</option><option>high</option></select></label></div>
        <div className="two-col"><label className="field"><span>What good looks like (Markdown; shown to teacher leaders and sent to the reviewer)</span><textarea rows={26} value={f.guideMd} onChange={(e) => setF({ ...f, guideMd: e.target.value })} /></label><div className="wf-card wf-card-section" style={{ maxHeight: 620, overflow: "auto" }}><p className="eyebrow">Preview</p><Markdown text={f.guideMd} /></div></div>
        <RubricEditor rubric={f.rubric} onChange={(rubric) => setF({ ...f, rubric })} />
        <label className="field"><span>Reviewer notes (sent to the model only; how to judge this type)</span><textarea rows={4} value={f.reviewerNotes} onChange={(e) => setF({ ...f, reviewerNotes: e.target.value })} /></label>
        <label className="field"><span>Change note (saved with the new version)</span><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Tightened the tuition section after the Sept gathering" /></label>
        {save.error ? <ErrorState error={save.error} /> : save.isSuccess && !dirty ? <State kind="success" title="Saved" /> : null}
        <div className="wf-form-actions"><button type="button" onClick={() => setF(q.data!.type)} disabled={!dirty}>Discard changes</button><button className="primary-button" type="submit" disabled={!dirty || save.isPending}>Save{dirty ? " as new version" : ""}</button></div>
      </form> : null}
      {tab === "resources" ? <ResourcesEditor typeId={f.id} current={q.data!.resources} onSaved={() => qc.invalidateQueries({ queryKey: ["admin-type", id] })} /> : null}
      {tab === "test" ? <PromptTester type={f} /> : null}
      {tab === "history" ? <VersionHistory typeId={f.id} versions={q.data!.versions} current={f.version} /> : null}
    </div>
  );
}
function ResourcesEditor({ typeId, current, onSaved }: { typeId: string; current: ItemSummary[]; onSaved: () => void }) {
  const [list, setList] = useState(current); const [q, setQ] = useState(""); const [applied, setApplied] = useState("");
  const results = useQuery({ queryKey: ["admin-item-search", applied], queryFn: () => api.get<{ results: ItemSummary[] }>(`/api/admin/item-search?q=${encodeURIComponent(applied)}`), enabled: applied.length >= 2 });
  const save = useMutation({ mutationFn: () => api.put(`/api/admin/types/${typeId}/resources`, { itemIds: list.map((l) => l.id) }), onSuccess: onSaved });
  return <div className="two-col"><div className="wf-card wf-card-section"><h3>Linked Connected resources (shown with the guide and offered to the reviewer)</h3>{list.length ? <ol style={{ paddingLeft: 20 }}>{list.map((r, i) => <li key={r.id} style={{ marginBottom: 6 }}>{r.title} <span className="inline-actions"><button className="link-button small" disabled={i === 0} onClick={() => { const n = [...list]; [n[i - 1], n[i]] = [n[i]!, n[i - 1]!]; setList(n); }}>↑</button><button className="link-button small" onClick={() => setList(list.filter((x) => x.id !== r.id))}>Remove</button></span></li>)}</ol> : <State kind="empty" title="No resources linked" />}<div className="wf-form-actions"><button className="primary-button" onClick={() => save.mutate()} disabled={save.isPending}>Save resources</button></div>{save.isSuccess ? <State kind="success" title="Saved" /> : null}</div>
    <div className="wf-card wf-card-section"><h3>Add from Connected</h3><SearchInput value={q} onChange={setQ} placeholder="Search the index" onSubmit={() => setApplied(q)} /><div style={{ marginTop: 10 }}>{results.isLoading ? <Loading what="Searching" /> : results.data?.results.map((r) => <div key={r.id} className="sort-row"><span className="grow" style={{ fontSize: ".875rem" }}>{r.title}</span><button className="small" disabled={list.some((l) => l.id === r.id) || list.length >= 20} onClick={() => setList([...list, r])}>Add</button></div>)}</div></div></div>;
}
function PromptTester({ type }: { type: T }) {
  const [draft, setDraft] = useState(""); const [useEdits, setUseEdits] = useState(true);
  const test = useMutation({ mutationFn: () => api.post<{ review: ReviewResult; model: string; effort: string; usage: { total_tokens: number }; costUsd: number; seconds: number; systemPromptChars: number }>(`/api/admin/types/${type.id}/test`, { draft, ...(useEdits ? { guideMd: type.guideMd, rubric: type.rubric, reviewerNotes: type.reviewerNotes } : {}), ...(type.model ? { model: type.model } : {}), ...(type.reasoningEffort ? { effort: type.reasoningEffort } : {}) }) });
  return <div style={{ display: "grid", gap: 12 }}><State kind="info" title="Test against a sample draft">Runs the full review exactly as a teacher leader would get it, using the guide and rubric currently in the editor (unsaved edits included when the box is checked). Test runs are logged in the submission log as tests and count toward spend but not toward user limits.</State>
    <label className="field"><span>Sample draft</span><textarea rows={12} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Paste a sample draft of this type" /></label>
    <div className="inline-actions"><label><input type="checkbox" checked={useEdits} onChange={(e) => setUseEdits(e.target.checked)} /> Use the unsaved edits in the editor</label><button className="primary-button" disabled={draft.length < 40 || test.isPending} onClick={() => test.mutate()}>{test.isPending ? "Reviewing (about a minute)…" : "Run the review"}</button></div>
    {test.error ? <ErrorState error={test.error} /> : null}
    {test.data ? <><p className="muted">{test.data.model} / {test.data.effort} · {test.data.seconds.toFixed(0)}s · {test.data.usage.total_tokens.toLocaleString()} tokens · ${test.data.costUsd.toFixed(3)} · system prompt {test.data.systemPromptChars.toLocaleString()} chars</p><Review r={test.data.review} /></> : null}</div>;
}
function VersionHistory({ typeId, versions, current }: { typeId: string; versions: { version: number; note: string | null; createdBy: string | null; createdAt: string }[]; current: number }) {
  const qc = useQueryClient(); const [open, setOpen] = useState<number | null>(null);
  const v = useQuery({ queryKey: ["type-version", typeId, open], queryFn: () => api.get<{ guideMd: string; rubric: { criterion: string; description: string }[]; reviewerNotes: string; name: string }>(`/api/admin/types/${typeId}/versions/${open}`), enabled: open !== null });
  const restore = useMutation({ mutationFn: (ver: number) => api.post(`/api/admin/types/${typeId}/restore/${ver}`), onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-type", typeId] }); setOpen(null); } });
  return <div className="two-col"><div className="table-wrap"><table className="wf-table"><thead><tr><th>Version</th><th>Note</th><th>By</th><th>When</th><th></th></tr></thead><tbody>{versions.map((x) => <tr key={x.version}><td>v{x.version}{x.version === current ? " (current)" : ""}</td><td>{x.note}</td><td>{x.createdBy}</td><td>{fmtDate(x.createdAt)}</td><td className="inline-actions"><button className="link-button small" onClick={() => setOpen(x.version)}>View</button>{x.version !== current ? <button className="small" onClick={() => { if (confirm(`Restore version ${x.version} as a new version?`)) restore.mutate(x.version); }}>Restore</button> : null}</td></tr>)}</tbody></table></div>
    <div className="wf-card wf-card-section" style={{ maxHeight: 640, overflow: "auto" }}>{open === null ? <State kind="empty" title="Select a version to view it" /> : v.isLoading ? <Loading /> : v.data ? <><p className="eyebrow">Version {open}: {v.data.name}</p><Markdown text={v.data.guideMd} /><h4>Rubric</h4><ul>{v.data.rubric.map((r) => <li key={r.criterion}><strong>{r.criterion}.</strong> {r.description}</li>)}</ul><h4>Reviewer notes</h4><p className="muted">{v.data.reviewerNotes}</p></> : null}</div></div>;
}
