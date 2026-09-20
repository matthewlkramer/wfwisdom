import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ChevronDown } from "lucide-react";
import { DOC_TYPES } from "@wfw/shared";

const KEY = "wfw.docTypes";
function stored(): string[] { try { const v = JSON.parse(localStorage.getItem(KEY) ?? "[]"); return Array.isArray(v) ? v.filter((x) => DOC_TYPES.some((t) => t.key === x)) : []; } catch { return []; } }
interface Ctx { types: string[]; setTypes: (t: string[]) => void }
const TypeContext = createContext<Ctx>({ types: [], setTypes: () => {} });

/** The reader's document type filter, kept in this browser; every list query carries it. */
export function TypeFilterProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient(); const [types, set] = useState<string[]>(stored);
  const setTypes = (t: string[]) => { set(t); try { localStorage.setItem(KEY, JSON.stringify(t)); } catch { /* private browsing */ } void qc.invalidateQueries(); };
  const value = useMemo(() => ({ types, setTypes }), [types]); // eslint-disable-line react-hooks/exhaustive-deps
  return <TypeContext.Provider value={value}>{children}</TypeContext.Provider>;
}
export function useDocTypes(): Ctx { return useContext(TypeContext); }
export function typesParam(types: string[]): string { return types.length ? `types=${encodeURIComponent(types.join(","))}` : ""; }

/** Multi-select dropdown for document types, styled like the other filters. */
export function TypeFilter() {
  const { types, setTypes } = useDocTypes(); const [open, setOpen] = useState(false); const box = useRef<HTMLDivElement>(null);
  useEffect(() => { if (!open) return; const onDoc = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); }; const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); }; document.addEventListener("mousedown", onDoc); document.addEventListener("keydown", onKey); return () => { document.removeEventListener("mousedown", onDoc); document.removeEventListener("keydown", onKey); }; }, [open]);
  const label = types.length === 0 ? "All types" : types.length === 1 ? DOC_TYPES.find((t) => t.key === types[0])?.label ?? "1 type" : `${types.length} types`;
  return (
    <div className="filter-select type-filter" ref={box}><span>Type</span>
      <button type="button" className="type-filter-button" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen(!open)}>{label} <ChevronDown size={14} /></button>
      {open ? <div className="type-filter-menu" role="listbox" aria-multiselectable="true">
        {DOC_TYPES.map((t) => <label key={t.key}><input type="checkbox" checked={types.includes(t.key)} onChange={(e) => setTypes(e.target.checked ? [...types, t.key] : types.filter((x) => x !== t.key))} />{t.label}</label>)}
        <div className="type-filter-foot"><button type="button" className="link-button small" onClick={() => setTypes([])}>Clear</button><button type="button" className="small" onClick={() => setOpen(false)}>Done</button></div>
      </div> : null}
    </div>
  );
}
