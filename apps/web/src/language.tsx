import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { RESOURCE_LANGUAGES, isResourceLanguage, type ResourceLanguage, type SessionUser } from "@wfw/shared";
import { api } from "./api";

const KEY = "wfw.resourceLanguage";
/** Signed-out readers keep the choice in this browser; signed-in readers keep it on their user record. */
export function storedLanguage(): ResourceLanguage | null {
  try { const v = localStorage.getItem(KEY); return isResourceLanguage(v) ? v : null; } catch { return null; }
}
function store(lang: ResourceLanguage) { try { localStorage.setItem(KEY, lang); } catch { /* private browsing */ } }

interface Ctx { language: ResourceLanguage; setLanguage: (l: ResourceLanguage) => void }
const LanguageContext = createContext<Ctx>({ language: "all", setLanguage: () => {} });

export function LanguageProvider({ user, children }: { user: SessionUser | null; children: ReactNode }) {
  const qc = useQueryClient();
  const [language, set] = useState<ResourceLanguage>(() => user?.resourceLanguage ?? storedLanguage() ?? "all");
  const setLanguage = useCallback((l: ResourceLanguage) => {
    set(l);
    store(l);
    // Every resource list is keyed on the language, so refetching is all that is needed.
    if (user) void api.put("/api/me/language", { language: l }).catch(() => {});
    void qc.invalidateQueries();
  }, [qc, user]);
  const value = useMemo(() => ({ language, setLanguage }), [language, setLanguage]);
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}
export function useLanguage(): Ctx { return useContext(LanguageContext); }
/** Appended to every resource query so the API filters and the cache key changes with the choice. */
export function langParam(language: ResourceLanguage): string { return `lang=${language}`; }

export function LanguageFilter({ label = "Language" }: { label?: string }) {
  const { language, setLanguage } = useLanguage();
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {RESOURCE_LANGUAGES.map((l) => (
        <button key={l.key} type="button" role="radio" aria-checked={language === l.key} className={language === l.key ? "active" : ""} onClick={() => setLanguage(l.key)}>{l.label}</button>
      ))}
    </div>
  );
}
