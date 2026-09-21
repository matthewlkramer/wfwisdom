import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { REGION_CHOICES, isResourceRegion, type ResourceRegion, type SessionUser } from "@wfw/shared";
import { api } from "./api";

const KEY = "wfw.resourceRegion";
/** Signed-out readers keep the choice in this browser; signed-in readers keep it on their user record. */
export function storedRegion(): ResourceRegion | null {
  try { const v = localStorage.getItem(KEY); return isResourceRegion(v) ? v : null; } catch { return null; }
}
function store(region: ResourceRegion) { try { localStorage.setItem(KEY, region); } catch { /* private browsing */ } }

interface Ctx { region: ResourceRegion; setRegion: (r: ResourceRegion) => void }
const RegionContext = createContext<Ctx>({ region: "all", setRegion: () => {} });

export function RegionProvider({ user, children }: { user: SessionUser | null; children: ReactNode }) {
  const qc = useQueryClient();
  const [region, set] = useState<ResourceRegion>(() => user?.resourceRegion ?? storedRegion() ?? "all");
  const setRegion = useCallback((r: ResourceRegion) => {
    set(r);
    store(r);
    // Every resource list is keyed on the region, so refetching is all that is needed.
    if (user) void api.put("/api/me/region", { region: r }).catch(() => {});
    void qc.invalidateQueries();
  }, [qc, user]);
  const value = useMemo(() => ({ region, setRegion }), [region, setRegion]);
  return <RegionContext.Provider value={value}>{children}</RegionContext.Provider>;
}
export function useRegion(): Ctx { return useContext(RegionContext); }
/** Appended to every resource query so the API filters and the cache key changes with the choice. */
export function regionParam(region: ResourceRegion): string { return `region=${encodeURIComponent(region)}`; }

/**
 * Picking a region shows that region's material together with everything that is not region-specific —
 * what a teacher leader there actually needs. "Not region-specific" narrows to the latter on its own,
 * and "All regions" shows other regions' material too.
 */
export function RegionFilter({ label = "Region" }: { label?: string }) {
  const { region, setRegion } = useRegion();
  const title = region === "all" ? "Showing every region's resources"
    : region === "general" ? "Showing only resources that are not written for one region"
    : "Showing this region's resources and the ones that apply everywhere";
  return (
    <label className="filter-select"><span>{label}</span>
      <select value={region} onChange={(e) => { const v = e.target.value; if (isResourceRegion(v)) setRegion(v); }} aria-label={label} title={title}>
        {REGION_CHOICES.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
      </select>
    </label>
  );
}
