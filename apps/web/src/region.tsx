import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ChevronDown } from "lucide-react";
import { REGION_FILTER_OPTIONS, parseRegionFilter, regionLabel, type SessionUser } from "@wfw/shared";
import { api } from "./api";

const KEY = "wfw.resourceRegions";
/** Signed-out readers keep the choice in this browser; signed-in readers keep it on their user record. */
export function storedRegions(): string[] | null {
  try { const v = localStorage.getItem(KEY); return v === null ? null : parseRegionFilter(JSON.parse(v)); } catch { return null; }
}
function store(regions: string[]) { try { localStorage.setItem(KEY, JSON.stringify(regions)); } catch { /* private browsing */ } }

interface Ctx { regions: string[]; setRegions: (r: string[]) => void }
const RegionContext = createContext<Ctx>({ regions: [], setRegions: () => {} });

export function RegionProvider({ user, children }: { user: SessionUser | null; children: ReactNode }) {
  const qc = useQueryClient();
  const [regions, set] = useState<string[]>(() => (user?.resourceRegions?.length ? user.resourceRegions : storedRegions() ?? []));
  const setRegions = useCallback((r: string[]) => {
    const next = parseRegionFilter(r);
    set(next);
    store(next);
    // Every resource list is keyed on the regions, so refetching is all that is needed.
    if (user) void api.put("/api/me/regions", { regions: next }).catch(() => {});
    void qc.invalidateQueries();
  }, [qc, user]);
  const value = useMemo(() => ({ regions, setRegions }), [regions, setRegions]);
  return <RegionContext.Provider value={value}>{children}</RegionContext.Provider>;
}
export function useRegions(): Ctx { return useContext(RegionContext); }
/** Appended to every resource query so the API filters and the cache key changes with the choice. */
export function regionsParam(regions: string[]): string { return regions.length ? `regions=${encodeURIComponent(regions.join(","))}` : ""; }

/**
 * Multi-select region filter, styled like the document type filter beside it.
 *
 * Each tick stands on its own: Minnesota shows Minnesota's material and nothing else. A reader who
 * also wants the material written for nowhere in particular ticks "Not region-specific" as well.
 * Ticking none shows everything.
 */
export function RegionFilter({ label = "Region" }: { label?: string }) {
  const { regions, setRegions } = useRegions();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDoc); document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDoc); document.removeEventListener("keydown", onKey); };
  }, [open]);
  const text = regions.length === 0 ? "All regions" : regions.length === 1 ? regionLabel(regions[0]!) : `${regions.length} regions`;
  return (
    <div className="filter-select type-filter" ref={box}><span>{label}</span>
      <button type="button" className="type-filter-button" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen(!open)}>{text} <ChevronDown size={14} /></button>
      {open ? <div className="type-filter-menu" role="listbox" aria-multiselectable="true">
        {REGION_FILTER_OPTIONS.map((r) => <label key={r.key}><input type="checkbox" checked={regions.includes(r.key)} onChange={(e) => setRegions(e.target.checked ? [...regions, r.key] : regions.filter((x) => x !== r.key))} />{r.label}</label>)}
        <div className="type-filter-foot"><button type="button" className="link-button small" onClick={() => setRegions([])}>Clear</button><button type="button" className="small" onClick={() => setOpen(false)}>Done</button></div>
      </div> : null}
    </div>
  );
}
