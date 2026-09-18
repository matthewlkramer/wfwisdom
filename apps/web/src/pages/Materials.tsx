import { useMutation, useQuery } from "@tanstack/react-query";
import { Upload } from "lucide-react";
import { useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import type { ItemSummary } from "@wfw/shared";
import { ApiError, api } from "../api";
import { ErrorState, ItemCard, Loading, Markdown, State } from "../components/ui";

type TypeRow = { id: string; key: string; name: string; shortDescription: string | null; jobKey: string | null };
export function Materials() {
  const q = useQuery({ queryKey: ["types"], queryFn: () => api.get<{ types: TypeRow[]; jobs: { key: string; name: string }[] }>("/api/types") });
  if (q.isLoading) return <div className="wf-page"><Loading /></div>;
  if (q.error) return <div className="wf-page"><ErrorState error={q.error} retry={() => q.refetch()} /></div>;
  const { types, jobs } = q.data!;
  const groups = jobs.map((j) => ({ job: j, types: types.filter((t) => t.jobKey === j.key) })).filter((g) => g.types.length);
  const other = types.filter((t) => !jobs.some((j) => j.key === t.jobKey));
  return (
    <div className="wf-page">
      <div className="wf-page-header"><div><h1>Get feedback on a draft</h1><p>Pick the kind of document you are working on. You will see what good looks like, the Connected resources that help, and a place to submit your draft for specific, kind feedback.</p></div></div>
      {[...groups, ...(other.length ? [{ job: { key: "other", name: "Other" }, types: other }] : [])].map((g) => <section key={g.job.key}><div className="wf-section-header"><h2>{g.job.name}</h2></div><div className="wf-card-grid">{g.types.map((t) => <Link key={t.id} to={`/materials/${t.key}`} className="wf-card wf-card-record wf-card-button"><span className="wf-card-title">{t.name}</span>{t.shortDescription ? <p className="item-summary">{t.shortDescription}</p> : null}</Link>)}</div></section>)}
    </div>
  );
}

export function MaterialType() {
  const { key } = useParams(); const nav = useNavigate(); const [sp] = useSearchParams(); const parentId = sp.get("resubmit") ?? undefined;
  const q = useQuery({ queryKey: ["type", key], queryFn: () => api.get<{ type: { id: string; key: string; name: string; shortDescription: string | null; guideMd: string; rubric: { criterion: string; description: string }[]; version: number }; resources: ItemSummary[] }>(`/api/types/${key}`) });
  const [tab, setTab] = useState<"guide" | "submit">(parentId ? "submit" : "guide");
  const [title, setTitle] = useState(""); const [text, setText] = useState(sp.get("text") ?? ""); const [file, setFile] = useState<File | null>(null); const [drag, setDrag] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const submit = useMutation({ mutationFn: async () => { const fd = new FormData(); fd.set("typeKey", key!); if (title) fd.set("title", title); if (file) fd.set("file", file); else fd.set("text", text); if (parentId) fd.set("parentId", parentId); return api.form<{ id: string }>("/api/submissions", fd); }, onSuccess: (r) => nav(`/drafts/${r.id}`) });
  if (q.isLoading) return <div className="wf-page"><Loading /></div>;
  if (q.error) return <div className="wf-page"><ErrorState error={q.error} retry={() => q.refetch()} /></div>;
  const { type, resources } = q.data!;
  const err = submit.error instanceof ApiError ? submit.error : submit.error ? new ApiError(String(submit.error), 500) : null;
  return (
    <div className="wf-page">
      <Link to="/materials" className="wf-page-back">← All material types</Link>
      <div className="wf-page-header"><div><h1>{type.name}</h1>{type.shortDescription ? <p>{type.shortDescription}</p> : null}</div><div className="wf-record-actions"><button className="primary-button" onClick={() => { setTab("submit"); document.getElementById("submit-box")?.scrollIntoView({ behavior: "smooth" }); }}>Submit a draft</button></div></div>
      <div className="wf-tabs" role="tablist"><button role="tab" aria-selected={tab === "guide"} className={tab === "guide" ? "active" : ""} onClick={() => setTab("guide")}>What good looks like</button><button role="tab" aria-selected={tab === "submit"} className={tab === "submit" ? "active" : ""} onClick={() => setTab("submit")}>Submit your draft</button></div>
      <div className="two-col">
        <div>
          {tab === "guide" ? <div className="wf-card wf-card-section"><Markdown text={type.guideMd} /><h3 style={{ marginTop: 16 }}>How it will be scored</h3><ul className="wf-list tight" style={{ fontSize: ".9rem" }}>{type.rubric.map((c) => <li key={c.criterion}><strong>{c.criterion}.</strong> {c.description}</li>)}</ul></div>
            : <div className="wf-card wf-card-section" id="submit-box">
              {parentId ? <State kind="info" title="Resubmitting a revision">This review will be linked to your earlier draft so you can compare.</State> : null}
              <form onSubmit={(e) => { e.preventDefault(); submit.mutate(); }} style={{ display: "grid", gap: 14, marginTop: parentId ? 12 : 0 }}>
                <label className="field"><span>Title (optional)</span><input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={`e.g. ${type.name} for Marigold Montessori`} maxLength={200} /></label>
                <div className={`dropzone${drag ? " active" : ""}`} onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={(e) => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files[0]; if (f) setFile(f); }}>
                  <Upload size={22} /><p style={{ margin: "6px 0" }}>{file ? <strong>{file.name}</strong> : "Drop a file here (.docx, .pdf, .pptx, .md, .txt, up to 5 MB)"}</p>
                  <div className="inline-actions"><button type="button" className="small" onClick={() => fileRef.current?.click()}>Choose file</button>{file ? <button type="button" className="link-button small" onClick={() => setFile(null)}>Remove</button> : null}</div>
                  <input ref={fileRef} type="file" accept=".docx,.pdf,.pptx,.md,.txt" style={{ display: "none" }} onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
                </div>
                {!file ? <label className="field"><span>Or paste your draft</span><textarea rows={14} value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste the full text of your draft" /><span className="muted">{text.length.toLocaleString()} characters</span></label> : null}
                {err ? <State kind={err.status === 429 ? "info" : "error"} title={err.status === 429 ? "Not right now" : "Could not submit"}>{err.message}</State> : null}
                <div className="wf-form-actions"><span className="muted" style={{ marginRight: "auto", fontSize: ".8rem" }}>Reviewed by an AI model using Wildflower's guidance. Takes about a minute. You can email or download the result.</span><button className="primary-button" type="submit" disabled={submit.isPending || (!file && text.trim().length < 40)}>{submit.isPending ? "Submitting…" : "Get feedback"}</button></div>
              </form></div>}
        </div>
        <aside className="sticky"><div className="wf-section-header" style={{ margin: "0 0 10px" }}><h2 style={{ fontSize: "1.25rem" }}>Connected resources for this</h2></div>{resources.length ? <div style={{ display: "grid", gap: 10 }}>{resources.map((r) => <ItemCard key={r.id} item={r} context={{ from: "type", type: type.key }} showWhy={false} />)}</div> : <State kind="empty" title="No resources linked yet" />}</aside>
      </div>
    </div>
  );
}
