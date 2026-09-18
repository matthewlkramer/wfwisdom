import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import type { Settings } from "@wfw/shared";
import { api } from "../../api";
import { ErrorState, Loading, State } from "../../components/ui";
export function AdminSettings() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["admin-settings"], queryFn: () => api.get<{ settings: Settings; defaults: Settings }>("/api/admin/settings") });
  const [form, setForm] = useState<Settings | null>(null);
  useEffect(() => { if (q.data) setForm(q.data.settings); }, [q.data]);
  const save = useMutation({ mutationFn: (s: Settings) => api.put("/api/admin/settings", s), onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-settings"] }); qc.invalidateQueries({ queryKey: ["admin-overview"] }); } });
  if (q.isLoading || !form) return <Loading />;
  if (q.error) return <ErrorState error={q.error} retry={() => q.refetch()} />;
  const num = (k: keyof Settings, label: string, hint?: string) => <label className="field"><span>{label}</span><input type="number" min={0} step="any" value={form[k] as number} onChange={(e) => setForm({ ...form, [k]: Number(e.target.value) })} />{hint ? <span className="muted">{hint}</span> : null}</label>;
  const txt = (k: keyof Settings, label: string, hint?: string) => <label className="field"><span>{label}</span><input value={form[k] as string} onChange={(e) => setForm({ ...form, [k]: e.target.value })} />{hint ? <span className="muted">{hint}</span> : null}</label>;
  const sel = (k: keyof Settings, label: string, opts: string[]) => <label className="field"><span>{label}</span><select value={form[k] as string} onChange={(e) => setForm({ ...form, [k]: e.target.value })}>{opts.map((o) => <option key={o}>{o}</option>)}</select></label>;
  const models = ["gpt-5.6-sol", "gpt-5.6-terra", "gpt-5.6-luna"];
  const worst = (form.reviewsPerDayGlobal * ((11_000 * 4 + (form.maxReviewOutputTokens + 8000) * 20) / 1e6)).toFixed(0);
  return (
    <form onSubmit={(e) => { e.preventDefault(); save.mutate(form); }} style={{ display: "grid", gap: 18 }}>
      <section className="wf-card wf-card-section"><h2>Models</h2><div className="field-row">{sel("reviewModel", "Draft reviews", models)}{sel("reviewEffort", "Review reasoning effort", ["low", "medium", "high"])}{sel("assistModel", "Query rewriting, explanations, summaries", models)}{sel("chatModel", "Chat answers", models)}{sel("embeddingModel", "Embeddings", ["text-embedding-3-small", "text-embedding-3-large"])}</div><p className="muted" style={{ marginTop: 10, fontSize: ".85rem" }}>Per-type model and effort overrides live on each material type. Changing the embedding model requires a full re-index.</p></section>
      <section className="wf-card wf-card-section"><h2>Limits and cost controls</h2><div className="field-row">{num("reviewsPerAccountPerDay", "Reviews per account per day")}{num("reviewsPerDayGlobal", "Reviews per day, whole site")}{num("chatTurnsPerAccountPerDay", "Chat turns per account per day")}{num("draftsPerAccountPerDay", "\"Draft it for me\" per account per day")}{num("draftsPerDayGlobal", "Drafts per day, whole site")}{num("chatTurnsPerDayGlobal", "Chat turns per day, whole site")}{num("maxUploadBytes", "Max upload size (bytes)")}{num("maxDraftChars", "Max draft length (characters)")}{num("maxReviewOutputTokens", "Max review output tokens")}</div><p className="muted" style={{ marginTop: 10, fontSize: ".85rem" }}>Worst-case daily review spend at these limits: about ${worst} (every review at the caps on {form.reviewModel}). Typical use is a small fraction of that.</p></section>
      <section className="wf-card wf-card-section"><h2>Helpfulness score</h2><div className="field-row">
        <label className="field"><span>Curation weight</span><input type="number" step="0.05" min={0} max={1} value={form.scoreWeights.curation} onChange={(e) => setForm({ ...form, scoreWeights: { ...form.scoreWeights, curation: Number(e.target.value) } })} /></label>
        <label className="field"><span>Usage weight</span><input type="number" step="0.05" min={0} max={1} value={form.scoreWeights.usage} onChange={(e) => setForm({ ...form, scoreWeights: { ...form.scoreWeights, usage: Number(e.target.value) } })} /></label>
        <label className="field"><span>Freshness weight</span><input type="number" step="0.05" min={0} max={1} value={form.scoreWeights.freshness} onChange={(e) => setForm({ ...form, scoreWeights: { ...form.scoreWeights, freshness: Number(e.target.value) } })} /></label>
        <label className="field"><span>Freshness ladder (by year since update)</span><input value={form.freshnessLadder.join(", ")} onChange={(e) => setForm({ ...form, freshnessLadder: e.target.value.split(",").map((x) => Number(x.trim())).filter((x) => !isNaN(x)) })} /></label>
        <label className="field"><span>Evergreen content types (decay at half speed)</span><input value={form.evergreenContentTypes.join(", ")} onChange={(e) => setForm({ ...form, evergreenContentTypes: e.target.value.split(",").map((x) => x.trim()).filter(Boolean) })} /></label>
        {num("startHereCap", "Start here cap")}{num("signalBlendCeiling", "Max weight of wfwisdom signals (0-1)")}{num("signalHalfLifeDays", "Signal half-life (days)")}</div><p className="muted" style={{ marginTop: 10, fontSize: ".85rem" }}>Weights must add to 1. Scores recompute monthly, after every re-index, and on demand from the Overview.</p></section>
      <section className="wf-card wf-card-section"><h2>Access</h2><div className="field-row">{txt("staffDomain", "Staff Google Workspace domain", "Accounts whose verified hosted domain matches get the staff workspace.")}</div></section>
      {save.error ? <ErrorState error={save.error} /> : save.isSuccess ? <State kind="success" title="Saved" /> : null}
      <div className="wf-form-actions"><button type="button" onClick={() => setForm(q.data!.defaults)}>Reset to defaults</button><button className="primary-button" type="submit" disabled={save.isPending}>Save settings</button></div>
    </form>
  );
}
