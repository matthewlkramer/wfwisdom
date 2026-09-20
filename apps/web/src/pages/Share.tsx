import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { STAGES, type JobSummary } from "@wfw/shared";
import { PenLine, Sparkles, Upload } from "lucide-react";
import { Fragment, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api, fmtDate } from "../api";
import { ErrorState, Loading, RubricBar, State } from "../components/ui";

type TypeRow = { id: string; key: string; name: string; shortDescription: string | null; jobKey: string | null };

/** One "share yours" form: a Google link or an upload, with an optional note. */
function ShareForm({ typeKey, typeName, onDone }: { typeKey: string | null; typeName: string; onDone: () => void }) {
  const [url, setUrl] = useState(""); const [title, setTitle] = useState(""); const [note, setNote] = useState(""); const [file, setFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const send = useMutation({ mutationFn: () => { const fd = new FormData(); if (file) fd.set("file", file); else fd.set("url", url.trim()); if (title.trim()) fd.set("title", title.trim()); if (note.trim()) fd.set("note", note.trim()); if (typeKey) fd.set("materialTypeKey", typeKey); return api.form<{ id: string }>("/api/contributions", fd); }, onSuccess: onDone });
  const canSend = !!file || /^https?:\/\/(docs|drive)\.google\.com\//.test(url.trim());
  return (
    <form className="share-form" onSubmit={(e) => { e.preventDefault(); send.mutate(); }}>
      <p className="muted" style={{ margin: 0, fontSize: ".875rem" }}>Share your <strong>{typeName.toLowerCase()}</strong>. The best way is a Google Doc, Sheet, or Slides link shared with anyone with the link; it stays yours to edit and the site picks up changes. A Word, PowerPoint, or PDF upload works too.</p>
      <div className="school-add">
        <input value={url} onChange={(e) => { setUrl(e.target.value); if (e.target.value) setFile(null); }} placeholder="Paste a Google link" aria-label="Google link" style={{ flex: "1 1 280px" }} />
        <span className="muted">or</span>
        <button type="button" onClick={() => fileRef.current?.click()}><Upload size={15} /> {file ? file.name : "Upload a file"}</button>
        <input ref={fileRef} type="file" accept=".docx,.doc,.pdf,.pptx,.xlsx,.md,.txt,.png,.jpg,.jpeg" style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0] ?? null; setFile(f); if (f) setUrl(""); e.target.value = ""; }} />
      </div>
      <div className="field-row"><label className="field"><span>Title (optional)</span><input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Leave blank to use the document's own title" maxLength={200} /></label><label className="field"><span>A note for staff (optional)</span><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="What it is, when you used it, anything to know" maxLength={400} /></label></div>
      {send.error ? <State kind="error" title="Could not share that">{(send.error as Error).message}</State> : null}
      <div className="wf-form-actions"><span className="muted" style={{ marginRight: "auto", fontSize: ".8rem" }}>Staff review it, place it on the map, and it appears with your name as the author.</span><button type="submit" className="primary-button" disabled={!canSend || send.isPending}>{send.isPending ? "Sharing…" : "Share it"}</button></div>
    </form>
  );
}

type MyItem = { id: string; title: string; description: string | null; url: string; status: string; nativeKind: string; googleKind: string | null; contentType: string | null; materialTypeKey: string | null; declineNote: string | null; createdAt: string; updatedAt: string | null; views: number; score: number; curation: string | null; stages: string[] | null; placements: { key: string; name: string; jobName: string; isPrimary: boolean }[]; votes: { yes: number; no: number }; clicks: number; versions: number };
const myStatus: Record<string, [string, string]> = { pending: ["Waiting for staff review", "attention"], published: ["On the map", "complete"], declined: ["Not added", "danger"], retired: ["Retired", "stage"] };

/** Everything this person has shared, with its standing and the levers to edit, move, or retire it. */
export function MyMaterials({ types }: { types: TypeRow[] }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["my-items"], queryFn: () => api.get<{ items: MyItem[] }>("/api/me/items") });
  const map = useQuery({ queryKey: ["map"], queryFn: () => api.get<{ jobs: JobSummary[] }>("/api/map") });
  const [openId, setOpenId] = useState<string | null>(null);
  const inv = () => { qc.invalidateQueries({ queryKey: ["my-items"] }); qc.invalidateQueries({ queryKey: ["my-contributions"] }); };
  const act = useMutation({ mutationFn: ({ id, action }: { id: string; action: "retire" | "restore" | "refresh" }) => api.post(`/api/me/items/${id}/${action}`), onSuccess: inv });
  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorState error={q.error} retry={() => q.refetch()} />;
  const rows = q.data!.items; if (!rows.length) return null;
  const subs = map.data?.jobs.flatMap((j) => j.subjobs.map((s) => ({ key: s.key, name: s.name, jobName: j.name }))) ?? [];
  return (
    <section className="wf-card wf-card-section" style={{ marginBottom: 20 }}>
      <div className="wf-section-header" style={{ margin: "0 0 10px" }}><div><h3 style={{ margin: 0 }}>Your materials</h3><p style={{ fontSize: ".85rem" }}>What you have shared, where it sits on the map, and how it is doing. Google files are re-read nightly; press Refresh to pull an edit in now.</p></div></div>
      <div className="table-wrap"><table className="wf-table my-items"><thead><tr><th>Material</th><th>Where it lives</th><th>Helpfulness</th><th>Use</th><th>Status</th><th></th></tr></thead><tbody>
        {rows.map((r) => { const [label, tone] = myStatus[r.status] ?? [r.status, "stage"]; const open = openId === r.id; return <Fragment key={r.id}>
          <tr><td><strong>{r.status === "published" ? <Link to={`/item/${r.id}`}>{r.title}</Link> : r.title}</strong><br /><small className="muted">{r.contentType ?? r.nativeKind}{r.materialTypeKey ? ` · ${types.find((t) => t.key === r.materialTypeKey)?.name ?? ""}` : ""} · shared {fmtDate(r.createdAt)}{r.versions > 1 ? ` · ${r.versions} versions` : ""}</small></td>
            <td style={{ fontSize: ".85rem" }}>{r.placements.length ? r.placements.map((p) => <div key={p.key}>{p.jobName} › {p.isPrimary ? <strong>{p.name}</strong> : p.name}</div>) : <span className="muted">Not placed yet</span>}{r.stages?.length ? <div className="muted">{r.stages.map((k) => STAGES.find((x) => x.key === k)?.name ?? k).join(", ")}</div> : null}</td>
            <td style={{ whiteSpace: "nowrap" }}><RubricBar score={Math.max(1, Math.min(5, Math.round(r.score / 20)))} /> {r.score}<br /><small className="muted">{r.votes.yes} helpful · {r.votes.no} not{r.curation ? ` · ${r.curation === "essential" ? "Essential" : "Staff pick"}` : ""}</small></td>
            <td style={{ fontSize: ".85rem" }}>{r.clicks} opens</td>
            <td><span className={`wf-status wf-status-${tone}`}>{label}</span>{r.declineNote ? <div className="muted" style={{ fontSize: ".78rem" }}>{r.declineNote}</div> : null}</td>
            <td><div className="inline-actions"><button type="button" className="small" onClick={() => setOpenId(open ? null : r.id)}>{open ? "Close" : "Edit"}</button>{r.nativeKind === "google" || r.nativeKind === "file" ? <button type="button" className="small" disabled={act.isPending} onClick={() => act.mutate({ id: r.id, action: "refresh" })}>Refresh</button> : null}{r.status === "retired" ? <button type="button" className="small" onClick={() => act.mutate({ id: r.id, action: "restore" })}>Restore</button> : r.status === "published" ? <button type="button" className="small" onClick={() => { if (confirm("Retire this from the map? You can restore it later.")) act.mutate({ id: r.id, action: "retire" }); }}>Retire</button> : null}</div></td></tr>
          {open ? <tr><td colSpan={6} style={{ background: "#f7faf8" }}><MyItemEditor item={r} subs={subs} onDone={() => { setOpenId(null); inv(); }} /></td></tr> : null}
        </Fragment>; })}
      </tbody></table></div>
      {act.error ? <State kind="error" title="That did not work">{(act.error as Error).message}</State> : null}
    </section>
  );
}

function MyItemEditor({ item, subs, onDone }: { item: MyItem; subs: { key: string; name: string; jobName: string }[]; onDone: () => void }) {
  const [title, setTitle] = useState(item.title); const [desc, setDesc] = useState(item.description ?? ""); const [url, setUrl] = useState(""); const [chosen, setChosen] = useState<string[]>(item.placements.map((p) => p.key)); const [stages, setStages] = useState<string[]>(item.stages ?? []);
  const save = useMutation({ mutationFn: () => api.patch(`/api/me/items/${item.id}`, { title, description: desc || null, url: url.trim() || undefined, subjobKeys: chosen, stages }), onSuccess: onDone });
  return (
    <div style={{ display: "grid", gap: 10 }}>
      <div className="field-row"><label className="field"><span>Title</span><input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} /></label><label className="field"><span>One-line description</span><input value={desc} onChange={(e) => setDesc(e.target.value)} maxLength={600} /></label></div>
      {item.nativeKind === "google" ? <label className="field"><span>Point at a different Google file (optional)</span><input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Paste a new Google link to replace the current one" /></label> : null}
      <div><strong style={{ fontSize: ".85rem" }}>Where it lives on the map</strong> <span className="muted" style={{ fontSize: ".8rem" }}>(first pick is primary)</span><div className="inline-actions" style={{ marginTop: 6, flexWrap: "wrap" }}>{chosen.map((k) => <span key={k} className="wf-status wf-status-teal">{subs.find((s) => s.key === k)?.name ?? k} <button type="button" className="link-button small" onClick={() => setChosen(chosen.filter((x) => x !== k))} aria-label="Remove">×</button></span>)}<select value="" onChange={(e) => { if (e.target.value) setChosen([...chosen, e.target.value]); }}><option value="">Add to…</option>{subs.filter((s) => !chosen.includes(s.key)).map((s) => <option key={s.key} value={s.key}>{s.jobName} › {s.name}</option>)}</select></div></div>
      <div><strong style={{ fontSize: ".85rem" }}>Stages</strong><div className="chip-group" style={{ marginTop: 6 }}>{STAGES.map((s) => <button key={s.key} type="button" className={`chip${stages.includes(s.key) ? " on" : ""}`} onClick={() => setStages(stages.includes(s.key) ? stages.filter((x) => x !== s.key) : [...stages, s.key])}>{s.name}</button>)}</div></div>
      {save.error ? <State kind="error" title="Could not save">{(save.error as Error).message}</State> : null}
      <div className="wf-form-actions"><button type="button" onClick={onDone}>Cancel</button><button type="button" className="primary-button" disabled={save.isPending || !title.trim()} onClick={() => save.mutate()}>{save.isPending ? "Saving…" : "Save"}</button></div>
    </div>
  );
}

export function SharePage() {
  const qc = useQueryClient();
  const types = useQuery({ queryKey: ["types"], queryFn: () => api.get<{ types: TypeRow[]; jobs: { key: string; name: string }[] }>("/api/types") });
  const [open, setOpen] = useState<string | null>(null); const [thanks, setThanks] = useState(false);
  if (types.isLoading) return <div className="wf-page"><Loading /></div>;
  if (types.error) return <div className="wf-page"><ErrorState error={types.error} retry={() => types.refetch()} /></div>;
  const { types: ts, jobs } = types.data!;
  const groups = jobs.map((j) => ({ job: j, types: ts.filter((t) => t.jobKey === j.key) })).filter((g) => g.types.length);
  const done = () => { setOpen(null); setThanks(true); qc.invalidateQueries({ queryKey: ["my-contributions"] }); qc.invalidateQueries({ queryKey: ["my-items"] }); window.scrollTo({ top: 0, behavior: "smooth" }); };
  return (
    <div className="wf-page">
      <div className="wf-page-header"><div><h1>Share your materials</h1><p>Two ways to add to what the network knows: make something new with the site's help, or share something you already use so other teacher leaders can learn from it.</p></div></div>
      {thanks ? <State kind="success" title="Thank you">Staff will review it. You can see its status below.</State> : null}
      <div className="share-intro">
        <Link to="/materials" className="wf-card wf-card-section share-card"><Sparkles size={22} /><div><h2>Create something custom</h2><p>Pick a material type, write or draft it with help, and get feedback against Wildflower's guidance before you use it.</p><span className="link">Go to Create custom materials →</span></div></Link>
        <div className="wf-card wf-card-section share-card"><PenLine size={22} /><div><h2>Share what you have made</h2><p>Below are the kinds of materials the site keeps for the network. If you have one you are proud of, or one that simply works, would you be open to sharing it? A Google link is best; uploads work too.</p></div></div>
      </div>
      <MyMaterials types={ts} />
      {groups.map((g) => <section key={g.job.key}><div className="wf-section-header"><h2>{g.job.name}</h2></div><div className="share-grid">{g.types.map((t) => <div key={t.id} className={`wf-card wf-card-section share-type${open === t.key ? " open" : ""}`}><div className="share-type-head"><div><strong className="wf-card-title" style={{ fontSize: "1.05rem" }}>{t.name}</strong>{t.shortDescription ? <div className="muted" style={{ fontSize: ".85rem", marginTop: 2 }}>{t.shortDescription}</div> : null}</div><button type="button" className={open === t.key ? "" : "primary-button small"} onClick={() => setOpen(open === t.key ? null : t.key)}>{open === t.key ? "Close" : "Share yours"}</button></div>{open === t.key ? <ShareForm typeKey={t.key} typeName={t.name} onDone={done} /> : null}</div>)}</div></section>)}
      <section><div className="wf-section-header"><div><h2>Something else</h2><p>A resource that does not fit the types above is welcome too.</p></div><button type="button" className={open === "__other" ? "" : "primary-button"} onClick={() => setOpen(open === "__other" ? null : "__other")}>{open === "__other" ? "Close" : "Share a resource"}</button></div>{open === "__other" ? <div className="wf-card wf-card-section"><ShareForm typeKey={null} typeName="resource" onDone={done} /></div> : null}</section>
    </div>
  );
}
