import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { MessageSquareText } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { SEARCH_FEEDBACK_RESULTS, SEARCH_FEEDBACK_TITLE, type ItemSummary, type SearchFeedbackContext } from "@wfw/shared";
import { api } from "../api";
import { ErrorState, ItemGrid, Loading, SearchInput, State } from "../components/ui";
import { FeedbackDialog } from "../components/FeedbackDialog";
import { LanguageFilter, langParam, useLanguage } from "../language";
import { RegionFilter, regionsParam, useRegions } from "../region";
import { TypeFilter, typesParam, useDocTypes } from "../filters";
export function SearchPage() {
  const [sp, setSp] = useSearchParams(); const q = sp.get("q") ?? ""; const [draft, setDraft] = useState(q); const { language } = useLanguage(); const { regions } = useRegions(); const { types } = useDocTypes();
  useEffect(() => setDraft(q), [q]);
  const r = useQuery({ queryKey: ["search", q, language, regions, types], placeholderData: keepPreviousData, queryFn: () => api.get<{ query: string; rewritten: string | null; mode: string; results: ItemSummary[] }>(`/api/search?q=${encodeURIComponent(q)}&${langParam(language)}&${regionsParam(regions)}&${typesParam(types)}`), enabled: q.length >= 2 });
  const results = r.data?.results ?? [];
  const [feedback, setFeedback] = useState(false);
  // What the search was and what it gave back, so a note about it does not depend on staff reproducing it:
  // the same words can rank differently once the library is re-indexed or the filters differ.
  const searchContext = (): SearchFeedbackContext => ({
    query: q,
    rewritten: r.data?.rewritten ?? null,
    mode: r.data?.mode ?? "",
    filters: { language, regions, types },
    resultCount: results.length,
    results: results.slice(0, SEARCH_FEEDBACK_RESULTS).map((it, i) => ({ position: i + 1, id: it.id, title: it.title.slice(0, SEARCH_FEEDBACK_TITLE) })),
  });
  return (
    <div className="wf-page">
      <div className="wf-page-header"><div><h1>Search</h1><p>Semantic search over everything in Wildflower Wisdom, including attachment text, ranked with helpfulness in mind.</p></div></div>
      <div className="filter-row"><div className="grow"><SearchInput large autoFocus value={draft} onChange={setDraft} onSubmit={() => setSp({ q: draft.trim() })} /></div><div className="filter-group"><TypeFilter /><RegionFilter /><LanguageFilter /></div></div>
      <div style={{ height: 16 }} />
      {q.length < 2 ? <State kind="empty" title="Type a question or a few words">Try “how do we set tuition levels” or “sample board resolution to open a bank account”.</State>
        : r.isLoading ? <Loading what="Searching" /> : r.error ? <ErrorState error={r.error} retry={() => r.refetch()} />
        : <>{r.data!.rewritten && r.data!.rewritten.toLowerCase() !== q.toLowerCase() ? <p className="muted" style={{ marginBottom: 12 }}>Your words, and also: <em>{r.data!.rewritten}</em>{r.data!.mode === "keyword" ? " (keyword mode)" : ""}</p> : r.data!.mode === "keyword" ? <p className="muted">Keyword mode.</p> : null}
          {results.length ? <ItemGrid items={results} context={{ from: "search", q }} /> : <State kind="empty" title="Nothing matched">The knowledge base may not cover this. <Link to={`/ask?q=${encodeURIComponent(q)}`}>Ask the question</Link> to get a direct answer, or try different words.</State>}
          <div className="inline-actions" style={{ marginTop: 16, flexWrap: "wrap" }}>
            {results.length ? <span className="muted">Not what you needed? <Link to={`/ask?q=${encodeURIComponent(q)}`}>Ask it as a question</Link>.</span> : null}
            <button type="button" className="small" style={{ marginLeft: "auto" }} onClick={() => setFeedback(true)}>
              <MessageSquareText size={14} /> Tell us about these results
            </button>
          </div></>}
      {feedback ? <FeedbackDialog onClose={() => setFeedback(false)}
        heading="How were these results?"
        intro={`Your search and the ${results.length} result${results.length === 1 ? "" : "s"} it returned are sent with your note, so we can see exactly what you saw.`}
        prompt="What were you looking for, and what did or didn't work about what came back?"
        extraContext={{ search: searchContext() }}
        preview={<SearchPreview ctx={searchContext()} />} /> : null}
    </div>
  );
}

/** What is about to be sent, spelled out, so nobody has to take it on trust. */
function SearchPreview({ ctx }: { ctx: SearchFeedbackContext }) {
  const filters = [ctx.filters.language !== "all" ? `language: ${ctx.filters.language}` : null,
    ctx.filters.regions.length ? `regions: ${ctx.filters.regions.join(", ")}` : null,
    ctx.filters.types.length ? `types: ${ctx.filters.types.join(", ")}` : null].filter(Boolean);
  return (
    <div className="wf-card wf-card-section" style={{ padding: 12 }}>
      <p style={{ margin: 0 }}><strong>Searched for:</strong> {ctx.query}</p>
      {ctx.rewritten && ctx.rewritten.toLowerCase() !== ctx.query.toLowerCase() ? <p className="muted" style={{ margin: "4px 0 0", fontSize: ".82rem" }}>and also: {ctx.rewritten}</p> : null}
      {filters.length ? <p className="muted" style={{ margin: "4px 0 0", fontSize: ".82rem" }}>{filters.join(" · ")}</p> : null}
      {ctx.results.length ? <ol style={{ margin: "8px 0 0", paddingLeft: 20, fontSize: ".85rem" }}>
        {ctx.results.map((x) => <li key={x.id}>{x.title}</li>)}
      </ol> : <p className="muted" style={{ margin: "8px 0 0", fontSize: ".85rem" }}>Nothing came back.</p>}
    </div>
  );
}
