import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { STAGES, type ItemSummary, type JobSummary, type StageKey } from "@wfw/shared";
import { api } from "../api";
import { ErrorState, ItemCard, ItemGrid, Loading } from "../components/ui";
import { LanguageFilter, langParam, useLanguage } from "../language";
import { RegionFilter, regionParam, useRegion } from "../region";
import { TypeFilter, typesParam, useDocTypes } from "../filters";

type MapData = { jobs: JobSummary[]; stages: { key: StageKey; name: string; blurb?: string }[]; stageCounts: Record<string, number> };
type JobData = { job: { key: string; name: string; description: string | null; staffOnly: boolean }; subjobs: { key: string; name: string; description: string | null; stages: StageKey[]; itemCount: number; items: ItemSummary[] }[] };
const isStage = (s: string | null): s is StageKey => !!s && STAGES.some((x) => x.key === s);

/** The map: a stage rail on top, jobs on the left, and the selected job's sub-jobs with their best resources on the right. */
export function MapPage() {
  const [sp, setSp] = useSearchParams();
  const { language } = useLanguage(); const { region } = useRegion(); const { types } = useDocTypes();
  const stage = isStage(sp.get("stage")) ? (sp.get("stage") as StageKey) : "";
  // The type filter goes to the job list too, so the count beside a job matches the cards the job page shows.
  const m = useQuery({ queryKey: ["map", language, region, types], queryFn: () => api.get<MapData>(`/api/map?${langParam(language)}&${regionParam(region)}&${typesParam(types)}`) });
  const jobs = (m.data?.jobs ?? []).filter((j) => !stage || j.subjobs.some((s) => s.stages.includes(stage)));
  const jobKey = sp.get("job") && jobs.some((j) => j.key === sp.get("job")) ? sp.get("job")! : jobs[0]?.key ?? "";
  const j = useQuery({ queryKey: ["map-job", jobKey, language, region, types], queryFn: () => api.get<JobData>(`/api/map/job/${jobKey}?${langParam(language)}&${regionParam(region)}&${typesParam(types)}`), enabled: !!jobKey });
  useEffect(() => { document.getElementById("map-detail")?.scrollTo?.(0, 0); }, [jobKey]);
  if (m.isLoading) return <div className="wf-page"><Loading /></div>;
  if (m.error) return <div className="wf-page"><ErrorState error={m.error} retry={() => m.refetch()} /></div>;
  const set = (patch: Record<string, string>) => { const next = new URLSearchParams(sp); for (const [k, v] of Object.entries(patch)) { if (v) next.set(k, v); else next.delete(k); } setSp(next, { replace: true }); };
  const counts = m.data!.stageCounts ?? {};
  const visibleSubs = (j.data?.subjobs ?? []).filter((s) => !stage || s.stages.includes(stage));
  return (
    <div className="wf-page">
      <div className="wf-page-header"><div><p className="eyebrow">The map</p><h1>{stage ? `What is in front of you in ${STAGES.find((s) => s.key === stage)?.name}` : "Everything, organized by the job in front of you"}</h1><p>Pick a stage to narrow the map to what applies now. Pick a job to see its sub-jobs with the best resources in each.</p></div></div>
      <div className="filter-row">
        <div className="stage-rail" role="radiogroup" aria-label="Stage">
          <button className={stage === "" ? "active" : ""} onClick={() => set({ stage: "" })}><strong>All stages</strong><span>{Object.values(counts).length ? "every resource" : ""}</span></button>
          {STAGES.map((s) => <button key={s.key} className={stage === s.key ? "active" : ""} onClick={() => set({ stage: s.key })}><strong>{s.name}</strong><span>{counts[s.key] ?? 0} resources</span></button>)}
        </div>
        <div className="filter-group"><TypeFilter /><RegionFilter /><LanguageFilter /></div>
      </div>
      <div className="map-explorer">
        <nav className="map-jobs" aria-label="Jobs">
          <div className="map-jobs-label">Jobs</div>
          {jobs.map((jb) => <button key={jb.key} className={jb.key === jobKey ? "active" : ""} onClick={() => set({ job: jb.key })}><span>{jb.name}</span><span className="count">{jb.subjobs.filter((s) => !stage || s.stages.includes(stage)).reduce((a, s) => a + s.itemCount, 0)}</span></button>)}
        </nav>
        <div id="map-detail" className="map-detail">
          {j.isLoading || !j.data ? <Loading /> : (
            <>
              <div className="map-detail-header"><h2>{j.data.job.name}{j.data.job.staffOnly ? <span className="wf-status" style={{ marginLeft: 10 }}>Foundation staff</span> : null}</h2>{j.data.job.description ? <p className="muted">{j.data.job.description}</p> : null}</div>
              {visibleSubs.map((s) => (
                <section key={s.key} className="map-subjob">
                  <div className="map-subjob-head"><div><Link to={`/map/${s.key}`} className="map-subjob-title">{s.name}</Link>{s.stages.length ? <span className="muted"> · {s.stages.map((k) => STAGES.find((x) => x.key === k)?.name ?? k).join(" · ")}</span> : null}</div><Link to={`/map/${s.key}`} className="map-subjob-all">All {s.itemCount} resource{s.itemCount === 1 ? "" : "s"} →</Link></div>
                  {s.items.length ? <div className="wf-card-grid three">{s.items.map((it) => <ItemCard key={it.id} item={it} context={{ from: "map", subjob: s.key }} showWhy={false} />)}</div> : <p className="muted" style={{ margin: "4px 0 0" }}>Nothing placed here yet.</p>}
                </section>
              ))}
              {!visibleSubs.length ? <p className="muted">No sub-jobs of this job apply in this stage.</p> : null}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export function SubjobPage() {
  const { key } = useParams(); const { language } = useLanguage(); const { region } = useRegion(); const { types } = useDocTypes();
  const q = useQuery({ queryKey: ["subjob", key, language, region, types], queryFn: () => api.get<{ subjob: { key: string; name: string; description: string | null; stages: StageKey[] }; job: { key: string; name: string } | null; items: ItemSummary[] }>(`/api/map/subjob/${key}?${langParam(language)}&${regionParam(region)}&${typesParam(types)}`) });
  if (q.isLoading) return <div className="wf-page"><Loading /></div>;
  if (q.error) return <div className="wf-page"><ErrorState error={q.error} retry={() => q.refetch()} /></div>;
  const d = q.data!;
  return (
    <div className="wf-page">
      <Link to={d.job ? `/map?job=${d.job.key}` : "/map"} className="wf-page-back">← Map{d.job ? ` · ${d.job.name}` : ""}</Link>
      <div className="wf-page-header"><div><h1>{d.subjob.name}</h1><p>{d.items.length} resource{d.items.length === 1 ? "" : "s"}, best first. Staff picks and Essentials are marked.{d.subjob.stages.length ? ` Relevant in: ${d.subjob.stages.map((k) => STAGES.find((x) => x.key === k)?.name ?? k).join(", ")}.` : ""}</p></div><div className="wf-record-actions filter-group"><TypeFilter /><RegionFilter /><LanguageFilter /></div></div>
      <ItemGrid items={d.items} context={{ from: "map", subjob: d.subjob.key }} empty="No resources placed here yet." />
    </div>
  );
}
