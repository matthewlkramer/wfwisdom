import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import type { ItemSummary, StageKey } from "@wfw/shared";
import { api } from "../api";
import { ErrorState, ItemGrid, Loading, SearchInput, State } from "../components/ui";
import { LanguageFilter, langParam, useLanguage } from "../language";
import { RegionFilter, regionParam, useRegion } from "../region";
import { TypeFilter, typesParam, useDocTypes } from "../filters";
import { useNavigate } from "react-router-dom";
import { useState } from "react";

interface HomeData { stage: StageKey | null; startHere: ItemSummary[]; mostUsed: ItemSummary[]; stages: { key: StageKey; name: string; description: string }[] }
export function Home() {
  const qc = useQueryClient(); const nav = useNavigate(); const [q, setQ] = useState(""); const { language } = useLanguage(); const { region } = useRegion(); const { types: docTypes } = useDocTypes();
  const home = useQuery({ queryKey: ["home", language, region, docTypes], queryFn: () => api.get<HomeData>(`/api/map/home?${langParam(language)}&${regionParam(region)}&${typesParam(docTypes)}`) });
  const types = useQuery({ queryKey: ["types"], queryFn: () => api.get<{ types: { key: string; name: string }[] }>("/api/types") });
  const setStage = useMutation({ mutationFn: (stage: StageKey | null) => api.post("/api/map/stage", { stage }), onSuccess: () => qc.invalidateQueries({ queryKey: ["home"] }) });
  if (home.isLoading) return <div className="wf-page"><Loading /></div>;
  if (home.error) return <div className="wf-page"><ErrorState error={home.error} retry={() => home.refetch()} /></div>;
  const d = home.data!;
  const stageName = d.stages.find((s) => s.key === d.stage)?.name;
  return (
    <div className="wf-page">
      <div className="hero">
        <div className="hero-copy">
          <p className="eyebrow">Wildflower knowledge, organized for the work</p>
          <h1>{d.stage ? `You are in ${stageName}. Start with these.` : "Where are you in the journey?"}</h1>
          <p className="lede">{d.stage ? "The resources below are the ones staff mark essential for this stage. The map has everything else, organized by the job in front of you." : "Pick your stage and we will show you where to start. You can change it any time."}</p>
          <SearchInput large value={q} onChange={setQ} placeholder="Search, e.g. how do we set tuition levels" onSubmit={() => q.trim() && nav(`/search?q=${encodeURIComponent(q.trim())}`)} />
          <p className="muted" style={{ marginTop: 8, fontSize: ".85rem" }}>Or <Link to="/ask">ask a question</Link> and get an answer with citations.</p>
        </div>
        <div className="stage-picker" role="radiogroup" aria-label="Your stage">
          {d.stages.map((s) => <button key={s.key} role="radio" aria-checked={d.stage === s.key} className={d.stage === s.key ? "active" : ""} onClick={() => setStage.mutate(d.stage === s.key ? null : s.key)}><strong>{s.name}</strong><small>{s.description}</small></button>)}
        </div>
      </div>
      {d.stage ? <><div className="wf-section-header"><div><h2>Start here</h2><p>Staff-curated for {stageName}.</p></div><div className="inline-actions filter-group"><TypeFilter /><RegionFilter /><LanguageFilter /><Link className="secondary-button" to="/map">Browse the whole map</Link></div></div>{d.startHere.length ? <ItemGrid items={d.startHere} context={{ from: "start_here", stage: d.stage }} /> : <State kind="empty" title="Nothing curated for this stage yet">Staff can pin items to a stage from the curation page. Meanwhile, the map and search cover everything.</State>}</> : null}
      <div className="wf-section-header"><div><h2>Most used</h2><p>What the network is opening this month.</p></div>{!d.stage ? <div className="filter-group"><TypeFilter /><RegionFilter /><LanguageFilter /></div> : null}</div>
      <ItemGrid items={d.mostUsed} context={{ from: "most_used" }} />
      <div className="wf-section-header"><div><h2>Working on a document?</h2><p>Upload a draft and get specific, kind feedback against what a strong Ops Guide would expect.</p></div><Link className="primary-button" to="/materials">Get feedback on a draft</Link></div>
      <div className="upload-invite"><div className="chips">{(types.data?.types ?? []).slice(0, 12).map((t) => <Link key={t.key} to={`/materials/${t.key}`}>{t.name}</Link>)}<Link to="/materials">All {types.data?.types.length ?? ""} types →</Link></div></div>
    </div>
  );
}
