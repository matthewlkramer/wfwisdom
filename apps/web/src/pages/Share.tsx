import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileText, Link2, PenLine, Sparkles, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api, fmtDate } from "../api";
import { ErrorState, Loading, State } from "../components/ui";

type TypeRow = { id: string; key: string; name: string; shortDescription: string | null; jobKey: string | null };
type Contribution = { id: string; title: string; status: string; nativeKind: string; googleKind: string | null; materialTypeKey: string | null; declineNote: string | null; createdAt: string; url: string };
const statusLabel: Record<string, [string, string]> = { pending: ["Waiting for staff review", "attention"], published: ["Published", "complete"], declined: ["Not added", "danger"] };

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

export function SharePage() {
  const qc = useQueryClient();
  const types = useQuery({ queryKey: ["types"], queryFn: () => api.get<{ types: TypeRow[]; jobs: { key: string; name: string }[] }>("/api/types") });
  const mine = useQuery({ queryKey: ["my-contributions"], queryFn: () => api.get<{ contributions: Contribution[] }>("/api/contributions") });
  const [open, setOpen] = useState<string | null>(null); const [thanks, setThanks] = useState(false);
  if (types.isLoading) return <div className="wf-page"><Loading /></div>;
  if (types.error) return <div className="wf-page"><ErrorState error={types.error} retry={() => types.refetch()} /></div>;
  const { types: ts, jobs } = types.data!;
  const groups = jobs.map((j) => ({ job: j, types: ts.filter((t) => t.jobKey === j.key) })).filter((g) => g.types.length);
  const done = () => { setOpen(null); setThanks(true); qc.invalidateQueries({ queryKey: ["my-contributions"] }); window.scrollTo({ top: 0, behavior: "smooth" }); };
  return (
    <div className="wf-page">
      <div className="wf-page-header"><div><h1>Share your materials</h1><p>Two ways to add to what the network knows: make something new with the site's help, or share something you already use so other teacher leaders can learn from it.</p></div></div>
      {thanks ? <State kind="success" title="Thank you">Staff will review it. You can see its status below.</State> : null}
      <div className="share-intro">
        <Link to="/materials" className="wf-card wf-card-section share-card"><Sparkles size={22} /><div><h2>Create something custom</h2><p>Pick a material type, write or draft it with help, and get feedback against Wildflower's guidance before you use it.</p><span className="link">Go to Create custom materials →</span></div></Link>
        <div className="wf-card wf-card-section share-card"><PenLine size={22} /><div><h2>Share what you have made</h2><p>Below are the kinds of materials the site keeps for the network. If you have one you are proud of, or one that simply works, would you be open to sharing it? A Google link is best; uploads work too.</p></div></div>
      </div>
      {mine.data?.contributions.length ? <section className="wf-card wf-card-section" style={{ marginBottom: 20 }}><h3 style={{ marginTop: 0 }}>What you have shared</h3><ul className="school-list">{mine.data.contributions.map((c) => { const [label, tone] = statusLabel[c.status] ?? [c.status, "stage"]; return <li key={c.id}>{c.nativeKind === "google" ? <Link2 size={15} /> : <FileText size={15} />}<span className="grow"><strong>{c.status === "published" ? <Link to={`/item/${c.id}`}>{c.title}</Link> : c.title}</strong><small className="muted">{fmtDate(c.createdAt)}{c.materialTypeKey ? ` · ${ts.find((t) => t.key === c.materialTypeKey)?.name ?? c.materialTypeKey}` : ""}{c.declineNote ? ` · ${c.declineNote}` : ""}</small></span><span className={`wf-status wf-status-${tone}`}>{label}</span></li>; })}</ul></section> : null}
      {groups.map((g) => <section key={g.job.key}><div className="wf-section-header"><h2>{g.job.name}</h2></div><div className="share-grid">{g.types.map((t) => <div key={t.id} className={`wf-card wf-card-section share-type${open === t.key ? " open" : ""}`}><div className="share-type-head"><div><strong className="wf-card-title" style={{ fontSize: "1.05rem" }}>{t.name}</strong>{t.shortDescription ? <div className="muted" style={{ fontSize: ".85rem", marginTop: 2 }}>{t.shortDescription}</div> : null}</div><button type="button" className={open === t.key ? "" : "primary-button small"} onClick={() => setOpen(open === t.key ? null : t.key)}>{open === t.key ? "Close" : "Share yours"}</button></div>{open === t.key ? <ShareForm typeKey={t.key} typeName={t.name} onDone={done} /> : null}</div>)}</div></section>)}
      <section><div className="wf-section-header"><div><h2>Something else</h2><p>A resource that does not fit the types above is welcome too.</p></div><button type="button" className={open === "__other" ? "" : "primary-button"} onClick={() => setOpen(open === "__other" ? null : "__other")}>{open === "__other" ? "Close" : "Share a resource"}</button></div>{open === "__other" ? <div className="wf-card wf-card-section"><ShareForm typeKey={null} typeName="resource" onDone={done} /></div> : null}</section>
    </div>
  );
}
