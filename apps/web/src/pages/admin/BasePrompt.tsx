import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { api, fmtDate } from "../../api";
import { ErrorState, Loading, State } from "../../components/ui";
export function AdminBasePrompt() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["base-prompt"], queryFn: () => api.get<{ current: { version: number; text: string }; versions: { version: number; note: string | null; createdBy: string | null; createdAt: string }[] }>("/api/admin/base-prompt") });
  const [text, setText] = useState(""); const [note, setNote] = useState(""); const [viewing, setViewing] = useState<number | null>(null);
  useEffect(() => { if (q.data) setText(q.data.current.text); }, [q.data]);
  const old = useQuery({ queryKey: ["base-prompt-v", viewing], queryFn: () => api.get<{ text: string }>(`/api/admin/base-prompt/${viewing}`), enabled: viewing !== null });
  const save = useMutation({ mutationFn: () => api.post("/api/admin/base-prompt", { text, note }), onSuccess: () => { qc.invalidateQueries({ queryKey: ["base-prompt"] }); setNote(""); } });
  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorState error={q.error} retry={() => q.refetch()} />;
  const dirty = text !== q.data!.current.text;
  return <div style={{ display: "grid", gap: 14 }}>
    <State kind="info" title="One prompt every material type inherits">This is the Wildflower voice, the values, and the rules for how the reviewer behaves. Each type adds its own guide, rubric, and reviewer notes underneath. Saving creates a new version; every review records which version it used.</State>
    <div className="two-col"><form onSubmit={(e) => { e.preventDefault(); save.mutate(); }} style={{ display: "grid", gap: 10 }}><label className="field"><span>Base prompt (version {q.data!.current.version})</span><textarea rows={30} value={text} onChange={(e) => setText(e.target.value)} /></label><label className="field"><span>Change note</span><input value={note} onChange={(e) => setNote(e.target.value)} /></label>{save.error ? <ErrorState error={save.error} /> : save.isSuccess && !dirty ? <State kind="success" title="Saved as a new version" /> : null}<div className="wf-form-actions"><button type="button" onClick={() => setText(q.data!.current.text)} disabled={!dirty}>Discard</button><button className="primary-button" type="submit" disabled={!dirty || save.isPending}>Save as new version</button></div></form>
      <div><div className="table-wrap"><table className="wf-table"><thead><tr><th>Version</th><th>Note</th><th>By</th><th>When</th></tr></thead><tbody>{q.data!.versions.map((v) => <tr key={v.version}><td><button className="link-button small" onClick={() => setViewing(v.version)}>v{v.version}</button></td><td>{v.note}</td><td>{v.createdBy}</td><td>{fmtDate(v.createdAt)}</td></tr>)}</tbody></table></div>{viewing !== null && old.data ? <div className="wf-card wf-card-section" style={{ marginTop: 10 }}><div className="inline-actions"><span className="eyebrow">Version {viewing}</span><button className="small" onClick={() => setText(old.data.text)}>Load into editor</button></div><pre className="mono" style={{ maxHeight: 400, overflow: "auto" }}>{old.data.text}</pre></div> : null}</div></div>
  </div>;
}
