import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronUp, FileText, Link2, Sparkles, Trash2, Upload, Wand2 } from "lucide-react";
import { useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import type { ItemSummary, SchoolMaterial } from "@wfw/shared";
import { ApiError, api, fmtDate } from "../api";
import { ErrorState, ItemCard, Loading, Markdown, State } from "../components/ui";
import { DraftsSection } from "./Submissions";
import { LanguageFilter, langParam, useLanguage } from "../language";

type TypeRow = { id: string; key: string; name: string; shortDescription: string | null; jobKey: string | null };

/** Documents and links about the writer's school. Reviews, drafting, and suggestions use them. */
export function SchoolMaterials({ compact }: { compact?: boolean }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["my-materials"], queryFn: () => api.get<{ materials: SchoolMaterial[] }>("/api/me/materials") });
  const [url, setUrl] = useState(""); const [open, setOpen] = useState(!compact);
  const fileRef = useRef<HTMLInputElement>(null);
  const invalidate = () => { qc.invalidateQueries({ queryKey: ["my-materials"] }); qc.invalidateQueries({ queryKey: ["type-suggested"] }); };
  const addFile = useMutation({ mutationFn: (f: File) => { const fd = new FormData(); fd.set("file", f); return api.form("/api/me/materials", fd); }, onSuccess: invalidate });
  const addLink = useMutation({ mutationFn: (u: string) => api.post("/api/me/materials", { url: u }), onSuccess: () => { setUrl(""); invalidate(); } });
  const remove = useMutation({ mutationFn: (id: string) => api.del(`/api/me/materials/${id}`), onSuccess: invalidate });
  const items = q.data?.materials ?? [];
  const err = addFile.error ?? addLink.error;
  return (
    <section className="wf-card wf-card-section school-panel">
      <div className="wf-section-header" style={{ margin: 0 }}>
        <div><h2 style={{ fontSize: compact ? "1.2rem" : undefined }}>About your school</h2><p style={{ fontSize: ".9rem" }}>{items.length ? `${items.length} document${items.length === 1 ? "" : "s"} shape every review, draft, and suggestion.` : "Share a few things about your school (vision, budget summary, website, enrollment plan). Reviews and drafts will use them."}</p></div>
        {compact ? <button type="button" className="link-button" onClick={() => setOpen(!open)} aria-expanded={open}>{open ? <><ChevronUp size={16} /> Hide</> : <><ChevronDown size={16} /> Manage</>}</button> : null}
      </div>
      {open ? (
        <div style={{ display: "grid", gap: 12, marginTop: 12 }}>
          {items.length ? <ul className="school-list">{items.map((m) => <li key={m.id}>{m.kind === "link" ? <Link2 size={15} /> : <FileText size={15} />}<span className="grow"><strong>{m.title}</strong><small className="muted">{m.kind === "link" ? m.url : m.filename} · {m.charCount.toLocaleString()} characters · added {fmtDate(m.createdAt)}{m.status !== "ok" ? " · could not refresh" : ""}</small></span><button type="button" className="link-button" aria-label={`Remove ${m.title}`} onClick={() => remove.mutate(m.id)}><Trash2 size={15} /></button></li>)}</ul> : null}
          <div className="school-add">
            <button type="button" onClick={() => fileRef.current?.click()} disabled={addFile.isPending}><Upload size={15} /> {addFile.isPending ? "Reading…" : "Upload a document"}</button>
            <input ref={fileRef} type="file" accept=".docx,.pdf,.pptx,.xlsx,.md,.txt" style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0]; if (f) addFile.mutate(f); e.target.value = ""; }} />
            <form onSubmit={(e) => { e.preventDefault(); if (url.trim()) addLink.mutate(url.trim()); }} className="school-link-form"><input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Paste a Google Doc, Sheet, Slides, or website link" aria-label="Link about your school" /><button type="submit" disabled={!url.trim() || addLink.isPending}>{addLink.isPending ? "Reading…" : "Add link"}</button></form>
          </div>
          {err ? <State kind="error" title="Could not add that">{(err as Error).message}</State> : null}
          <p className="muted" style={{ fontSize: ".8rem", margin: 0 }}>Only you and Wildflower staff can see these. Google links are re-read when you submit a draft, so edits in Google carry through.</p>
        </div>
      ) : null}
    </section>
  );
}

export function Materials() {
  const q = useQuery({ queryKey: ["types"], queryFn: () => api.get<{ types: TypeRow[]; jobs: { key: string; name: string }[] }>("/api/types") });
  if (q.isLoading) return <div className="wf-page"><Loading /></div>;
  if (q.error) return <div className="wf-page"><ErrorState error={q.error} retry={() => q.refetch()} /></div>;
  const { types, jobs } = q.data!;
  const groups = jobs.map((j) => ({ job: j, types: types.filter((t) => t.jobKey === j.key) })).filter((g) => g.types.length);
  const other = types.filter((t) => !jobs.some((j) => j.key === t.jobKey));
  return (
    <div className="wf-page">
      <div className="wf-page-header"><div><h1>Create custom materials</h1><p>Pick the kind of document you are working on. You will see what good looks like, the resources that help, a place to write or upload, and a reviewer that reads your draft against Wildflower's guidance.</p></div></div>
      <SchoolMaterials compact />
      <DraftsSection />
      {[...groups, ...(other.length ? [{ job: { key: "other", name: "Other" }, types: other }] : [])].map((g) => <section key={g.job.key}><div className="wf-section-header"><h2>{g.job.name}</h2></div><div className="wf-card-grid">{g.types.map((t) => <Link key={t.id} to={`/materials/${t.key}`} className="wf-card wf-card-record wf-card-button"><span className="wf-card-title">{t.name}</span>{t.shortDescription ? <span className="muted" style={{ fontSize: ".875rem" }}>{t.shortDescription}</span> : null}</Link>)}</div></section>)}
    </div>
  );
}

type TypeDetail = { type: { id: string; key: string; name: string; shortDescription: string | null; guideMd: string; rubric: { criterion: string; description: string }[]; version: number }; resources: ItemSummary[] };

/** The writing workspace: guide on demand, a big writing box, objectives and resources alongside. */
export function MaterialType() {
  const { key } = useParams(); const nav = useNavigate(); const [sp] = useSearchParams(); const parentId = sp.get("resubmit") ?? undefined;
  const { language } = useLanguage();
  const q = useQuery({ queryKey: ["type", key, language], queryFn: () => api.get<TypeDetail>(`/api/types/${key}?${langParam(language)}`) });
  const sug = useQuery({ queryKey: ["type-suggested", key, language], queryFn: () => api.get<{ items: ItemSummary[]; basedOn: string[] }>(`/api/types/${key}/suggested?${langParam(language)}`) });
  const mats = useQuery({ queryKey: ["my-materials"], queryFn: () => api.get<{ materials: SchoolMaterial[] }>("/api/me/materials") });
  const [mode, setMode] = useState<"write" | "upload" | "link">("write");
  const [guideOpen, setGuideOpen] = useState(false);
  const [title, setTitle] = useState(""); const [text, setText] = useState(sp.get("text") ?? ""); const [file, setFile] = useState<File | null>(null); const [docUrl, setDocUrl] = useState(""); const [drag, setDrag] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const draft = useMutation({ mutationFn: () => api.post<{ text: string; usedSchool: number }>("/api/submissions/draft", { typeKey: key, notes: text }), onSuccess: (r) => { setText(r.text); setMode("write"); } });
  const submit = useMutation({ mutationFn: async () => { const fd = new FormData(); fd.set("typeKey", key!); if (title) fd.set("title", title); if (mode === "upload" && file) fd.set("file", file); else if (mode === "link" && docUrl) fd.set("docUrl", docUrl.trim()); else fd.set("text", text); if (parentId) fd.set("parentId", parentId); return api.form<{ id: string }>("/api/submissions", fd); }, onSuccess: (r) => nav(`/drafts/${r.id}`) });
  if (q.isLoading) return <div className="wf-page"><Loading /></div>;
  if (q.error) return <div className="wf-page"><ErrorState error={q.error} retry={() => q.refetch()} /></div>;
  const { type, resources } = q.data!;
  const err = submit.error instanceof ApiError ? submit.error : submit.error ? new ApiError(String(submit.error), 500) : null;
  const derr = draft.error instanceof ApiError ? draft.error : draft.error ? new ApiError(String(draft.error), 500) : null;
  const schoolCount = mats.data?.materials.length ?? 0;
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  const canSubmit = mode === "write" ? text.trim().length >= 40 : mode === "upload" ? !!file : docUrl.trim().length > 10;
  return (
    <div className="wf-page">
      <Link to="/materials" className="wf-page-back">← Create custom materials</Link>
      <div className="wf-page-header"><div><h1>{type.name}</h1>{type.shortDescription ? <p>{type.shortDescription}</p> : null}</div>
        <div className="wf-record-actions"><button type="button" onClick={() => setGuideOpen(!guideOpen)} aria-expanded={guideOpen}>{guideOpen ? "Hide the guide" : "What good looks like"}</button><button className="primary-button" disabled={!canSubmit || submit.isPending} onClick={() => submit.mutate()}>{submit.isPending ? "Sending…" : "Get feedback"}</button></div></div>
      {guideOpen ? <section className="wf-card wf-card-section guide-panel"><Markdown text={type.guideMd} /></section> : null}
      {parentId ? <State kind="info" title="Revising an earlier draft">This review will be linked to it so you can see what changed.</State> : null}
      <div className="workspace">
        <section className="wf-card writing-box" id="submit-box">
          <div className="writing-tabs" role="tablist">
            <button role="tab" aria-selected={mode === "write"} className={mode === "write" ? "active" : ""} onClick={() => setMode("write")}>Write here</button>
            <button role="tab" aria-selected={mode === "upload"} className={mode === "upload" ? "active" : ""} onClick={() => setMode("upload")}>Upload a file</button>
            <button role="tab" aria-selected={mode === "link"} className={mode === "link" ? "active" : ""} onClick={() => setMode("link")}>Google Doc link</button>
            <span className="grow" />
            {mode === "write" ? <span className="muted" style={{ fontSize: ".8rem" }}>{words.toLocaleString()} words{text.length > 30000 ? " · over the limit" : ""}</span> : null}
          </div>
          {mode === "write" ? (
            <>
              <textarea className="writing-area" value={text} onChange={(e) => setText(e.target.value)} placeholder={`Write your ${type.name.toLowerCase()} here, or jot a few notes and press "Draft it for me".`} aria-label="Your draft" spellCheck />
              <div className="writing-foot">
                <button type="button" className="draft-button" onClick={() => draft.mutate()} disabled={draft.isPending}><Wand2 size={16} /> {draft.isPending ? "Drafting…" : text.trim() ? "Draft it for me from these notes" : "Draft it for me"}</button>
                <span className="muted" style={{ fontSize: ".8rem" }}>{schoolCount ? `Uses your ${schoolCount} school document${schoolCount === 1 ? "" : "s"} and Wildflower's guidance.` : <>Drafts use placeholders for facts about your school. <Link to="/materials">Share school documents</Link> to fill them in.</>}</span>
              </div>
              {draft.isSuccess ? <State kind="success" title="Draft ready">Read it closely, make it yours, then get feedback. Placeholders in [brackets] need your facts.</State> : null}
              {derr ? <State kind={derr.status === 429 ? "info" : "error"} title={derr.status === 429 ? "Not right now" : "Could not draft"}>{derr.message}</State> : null}
            </>
          ) : mode === "upload" ? (
            <div className={`dropzone tall${drag ? " active" : ""}`} onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={(e) => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files[0]; if (f) setFile(f); }}>
              <Upload size={26} /><p style={{ margin: "8px 0" }}>{file ? <strong>{file.name}</strong> : "Drop a file here (.docx, .pdf, .pptx, .md, .txt, up to 5 MB)"}</p>
              <div className="inline-actions"><button type="button" className="small" onClick={() => fileRef.current?.click()}>Choose file</button>{file ? <button type="button" className="link-button small" onClick={() => setFile(null)}>Remove</button> : null}</div>
              <input ref={fileRef} type="file" accept=".docx,.pdf,.pptx,.md,.txt" style={{ display: "none" }} onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            </div>
          ) : (
            <div className="link-mode">
              <label className="field"><span>Google Doc, Sheet, or Slides link</span><input value={docUrl} onChange={(e) => setDocUrl(e.target.value)} placeholder="https://docs.google.com/document/d/…" /></label>
              <p className="muted" style={{ fontSize: ".85rem" }}>Share it with anyone with the link, or with the Wildflower Wisdom service account. The current text is read when you press Get feedback, so keep editing in Google and resubmit when ready.</p>
            </div>
          )}
          <div className="writing-meta"><label className="field" style={{ margin: 0 }}><span>Title (optional)</span><input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={`e.g. ${type.name} for Marigold Montessori`} maxLength={200} /></label></div>
          {err ? <State kind={err.status === 429 ? "info" : "error"} title={err.status === 429 ? "Not right now" : "Could not submit"}>{err.message}</State> : null}
          <div className="wf-form-actions"><span className="muted" style={{ marginRight: "auto", fontSize: ".8rem" }}>Reviewed by an AI model using Wildflower's guidance{schoolCount ? " and what you shared about your school" : ""}. Takes about a minute.</span><button className="primary-button" disabled={!canSubmit || submit.isPending} onClick={() => submit.mutate()}>{submit.isPending ? "Sending…" : "Get feedback"}</button></div>
        </section>
        <aside className="workspace-side">
          <div className="wf-card wf-card-section"><h3 style={{ marginTop: 0 }}>Objectives</h3><p className="muted" style={{ fontSize: ".82rem", marginTop: -2 }}>What the reviewer looks for.</p><ol className="objectives">{type.rubric.map((c) => <li key={c.criterion}><strong>{c.criterion}.</strong> {c.description}</li>)}</ol></div>
          {sug.data?.items.length ? <div><div className="wf-section-header" style={{ margin: "0 0 8px" }}><h3 style={{ margin: 0 }}><Sparkles size={16} style={{ verticalAlign: "-2px" }} /> Suggested for your school</h3></div><p className="muted" style={{ fontSize: ".8rem", margin: "0 0 8px" }}>Picked from what you shared: {sug.data.basedOn.slice(0, 3).join(", ")}.</p><div style={{ display: "grid", gap: 10 }}>{sug.data.items.map((r) => <ItemCard key={r.id} item={r} context={{ from: "type-suggested", type: key }} showWhy={false} />)}</div></div> : null}
          <div><div className="wf-section-header" style={{ margin: "0 0 8px" }}><h3 style={{ margin: 0 }}>Use these as you write</h3><LanguageFilter /></div>{resources.length ? <div style={{ display: "grid", gap: 10 }}>{resources.map((r) => <ItemCard key={r.id} item={r} context={{ from: "type", type: key }} showWhy={false} />)}</div> : <p className="muted">{language === "all" ? "No linked resources yet." : "No linked resources in this language. Switch to All resources to see the rest."}</p>}</div>
        </aside>
      </div>
    </div>
  );
}
