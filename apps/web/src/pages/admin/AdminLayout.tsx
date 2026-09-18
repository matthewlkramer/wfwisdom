import { NavLink, Outlet } from "react-router-dom";
export function AdminLayout() {
  const tabs = [["", "Overview"], ["taxonomy", "Taxonomy"], ["curation", "Curation"], ["retirement", "Retirement queue"], ["types", "Material types"], ["base-prompt", "Base prompt"], ["submissions", "Submission log"], ["settings", "Settings"], ["activity", "Activity"]] as const;
  return (
    <div className="wf-page">
      <div className="wf-page-header"><div><p className="eyebrow">Staff workspace</p><h1>Wildflower Wisdom admin</h1><p>Everything staff might want to change lives here: the map, curation, material types and prompts, models, limits, and the re-index.</p></div></div>
      <nav className="wf-tabs" aria-label="Admin sections">{tabs.map(([p, l]) => <NavLink key={p} to={`/admin${p ? `/${p}` : ""}`} end={p === ""}>{l}</NavLink>)}</nav>
      <Outlet />
    </div>
  );
}
