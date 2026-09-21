import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import type { ItemSummary } from "@wfw/shared";
import { api } from "../api";
import { ErrorState, ItemGrid, Loading, SearchInput, State } from "../components/ui";
import { LanguageFilter, langParam, useLanguage } from "../language";
import { RegionFilter, regionParam, useRegion } from "../region";
import { TypeFilter, typesParam, useDocTypes } from "../filters";
export function SearchPage() {
  const [sp, setSp] = useSearchParams(); const q = sp.get("q") ?? ""; const [draft, setDraft] = useState(q); const { language } = useLanguage(); const { region } = useRegion(); const { types } = useDocTypes();
  useEffect(() => setDraft(q), [q]);
  const r = useQuery({ queryKey: ["search", q, language, region, types], queryFn: () => api.get<{ query: string; rewritten: string | null; mode: string; results: ItemSummary[] }>(`/api/search?q=${encodeURIComponent(q)}&${langParam(language)}&${regionParam(region)}&${typesParam(types)}`), enabled: q.length >= 2 });
  const results = r.data?.results ?? [];
  return (
    <div className="wf-page">
      <div className="wf-page-header"><div><h1>Search</h1><p>Semantic search over everything in Wildflower Wisdom, including attachment text, ranked with helpfulness in mind.</p></div></div>
      <div className="filter-row"><div className="grow"><SearchInput large autoFocus value={draft} onChange={setDraft} onSubmit={() => setSp({ q: draft.trim() })} /></div><div className="filter-group"><TypeFilter /><RegionFilter /><LanguageFilter /></div></div>
      <div style={{ height: 16 }} />
      {q.length < 2 ? <State kind="empty" title="Type a question or a few words">Try “how do we set tuition levels” or “sample board resolution to open a bank account”.</State>
        : r.isLoading ? <Loading what="Searching" /> : r.error ? <ErrorState error={r.error} retry={() => r.refetch()} />
        : <>{r.data!.rewritten && r.data!.rewritten.toLowerCase() !== q.toLowerCase() ? <p className="muted" style={{ marginBottom: 12 }}>Searched for: <em>{r.data!.rewritten}</em>{r.data!.mode === "keyword" ? " (keyword mode)" : ""}</p> : r.data!.mode === "keyword" ? <p className="muted">Keyword mode.</p> : null}
          {results.length ? <ItemGrid items={results} context={{ from: "search", q }} /> : <State kind="empty" title="Nothing matched">The knowledge base may not cover this. <Link to={`/ask?q=${encodeURIComponent(q)}`}>Ask the question</Link> to get a direct answer, or try different words.</State>}
          {r.data!.results.length ? <p className="muted" style={{ marginTop: 16 }}>Not what you needed? <Link to={`/ask?q=${encodeURIComponent(q)}`}>Ask it as a question</Link>.</p> : null}</>}
    </div>
  );
}
