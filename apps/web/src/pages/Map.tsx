import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { ItemSummary, JobSummary, StageKey } from "@wfw/shared";
import { api } from "../api";
import { ErrorState, ItemGrid, Loading } from "../components/ui";

type MapData = { jobs: JobSummary[]; stages: { key: StageKey; name: string }[] };
export function MapPage() {
  const m = useQuery({ queryKey: ["map"], queryFn: () => api.get<MapData>("/api/map") });
  const [stage, setStage] = useState<StageKey | "">("");
  if (m.isLoading) return <div className="wf-page"><Loading /></div>;
  if (m.error) return <div className="wf-page"><ErrorState error={m.error} retry={() => m.refetch()} /></div>;
  const jobs = m.data!.jobs.filter((j) => !stage || j.subjobs.some((s) => s.stages.includes(stage)));
  return (
    <div className="wf-page">
      <div className="wf-page-header"><div><h1>The map</h1><p>Everything in Connected, organized by the job in front of you. Two clicks to any resource. Filter by your stage to see only what applies now.</p></div>
        <div className="wf-record-actions"><div className="segmented" role="radiogroup" aria-label="Stage filter"><button className={stage === "" ? "active" : ""} onClick={() => setStage("")}>All stages</button>{m.data!.stages.map((s) => <button key={s.key} className={stage === s.key ? "active" : ""} onClick={() => setStage(s.key)}>{s.name}</button>)}</div></div></div>
      <div className="wf-card-grid wide">
        {jobs.map((j) => <section key={j.id} className={`wf-card wf-card-section job-card${j.staffOnly ? " staff-only" : ""}`}><h2 className="wf-card-title">{j.name}{j.staffOnly ? <span className="wf-status" style={{ marginLeft: 8 }}>Foundation staff</span> : null}</h2>{j.description ? <p className="item-summary">{j.description}</p> : null}
          <ul>{j.subjobs.filter((s) => !stage || s.stages.includes(stage)).map((s) => <li key={s.id}><Link to={`/map/${s.key}`}><span>{s.name}</span><span>{s.itemCount}</span></Link></li>)}</ul></section>)}
      </div>
    </div>
  );
}
export function SubjobPage() {
  const { key } = useParams();
  const q = useQuery({ queryKey: ["subjob", key], queryFn: () => api.get<{ subjob: { key: string; name: string; description: string | null; stages: StageKey[] }; job: { key: string; name: string } | null; items: ItemSummary[] }>(`/api/map/subjob/${key}`) });
  if (q.isLoading) return <div className="wf-page"><Loading /></div>;
  if (q.error) return <div className="wf-page"><ErrorState error={q.error} retry={() => q.refetch()} /></div>;
  const d = q.data!;
  return (
    <div className="wf-page">
      <Link to="/map" className="wf-page-back">← Map{d.job ? ` · ${d.job.name}` : ""}</Link>
      <div className="wf-page-header"><div><h1>{d.subjob.name}</h1><p>{d.items.length} resource{d.items.length === 1 ? "" : "s"}, best first. Staff picks and Essentials are marked.{d.subjob.stages.length ? ` Relevant in: ${d.subjob.stages.join(", ")}.` : ""}</p></div></div>
      <ItemGrid items={d.items} context={{ from: "map", subjob: d.subjob.key }} empty="No resources placed here yet." />
    </div>
  );
}
