import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, ThumbsDown, ThumbsUp } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import type { ItemSummary } from "@wfw/shared";
import { api, fmtDate, signalClick } from "../api";
import { ErrorState, Loading, Pill } from "../components/ui";

type Detail = { item: ItemSummary & { authorName: string | null; publishedAt: string | null; categories: string[]; audiences: string[]; attachments: { name: string; type: string; bytes: number }[]; linkedDocs: { url: string; kind: string }[] }; placements: { key: string; name: string; jobName: string; jobKey: string; isPrimary: boolean }[]; votes: { yes: number; no: number; mine: string | null } };
export function ItemPage() {
  const { id } = useParams(); const qc = useQueryClient();
  const q = useQuery({ queryKey: ["item", id], queryFn: () => api.get<Detail>(`/api/map/item/${id}`) });
  const vote = useMutation({ mutationFn: (kind: "helpful_yes" | "helpful_no") => api.post("/api/signals", { itemId: id, kind }), onSuccess: () => qc.invalidateQueries({ queryKey: ["item", id] }) });
  if (q.isLoading) return <div className="wf-page"><Loading /></div>;
  if (q.error) return <div className="wf-page"><ErrorState error={q.error} retry={() => q.refetch()} /></div>;
  const { item, placements, votes } = q.data!;
  const primary = placements.find((p) => p.isPrimary) ?? placements[0];
  return (
    <div className="wf-page narrow">
      {primary ? <Link to={`/map/${primary.key}`} className="wf-page-back">← {primary.jobName} · {primary.name}</Link> : <Link to="/map" className="wf-page-back">← Map</Link>}
      <div className="wf-page-header"><div><div className="wf-record-tags" style={{ marginBottom: 8 }}><Pill item={item} /><span className="wf-status wf-status-stage">{item.kind === "series" ? "Series" : item.kind === "question" ? "Q&A" : item.contentType ?? "Post"}</span></div><h1>{item.title}</h1>{item.summary ? <p>{item.summary}</p> : item.description ? <p>{item.description}</p> : null}</div>
        <div className="wf-record-actions"><a className="primary-button" href={item.url} target="_blank" rel="noreferrer" onClick={() => signalClick(item.id, { from: "item", external: true })}><ExternalLink size={16} /> Open in Connected</a></div></div>
      <div className="two-col">
        <div className="wf-card wf-card-section">
          <dl className="wf-record-facts">
            {item.authorName ? <div><dt>Author</dt><dd>{item.authorName}</dd></div> : null}
            {item.publishedAt ? <div><dt>Published</dt><dd>{fmtDate(item.publishedAt)}</dd></div> : null}
            {item.updatedAt ? <div><dt>Last updated</dt><dd>{fmtDate(item.updatedAt)}</dd></div> : null}
            <div><dt>Views in Connected</dt><dd>{item.views.toLocaleString()}</dd></div>
            {item.seriesTitles.length ? <div><dt>In series</dt><dd>{item.seriesTitles.join("; ")}</dd></div> : null}
            {item.categories.length ? <div><dt>Connected categories</dt><dd>{item.categories.join("; ")}</dd></div> : null}
            {item.audiences.length ? <div><dt>Audience tags</dt><dd>{item.audiences.join("; ")}</dd></div> : null}
          </dl>
          {item.attachments.length ? <><h3 style={{ marginTop: 16 }}>Attachments (open in Connected)</h3><ul className="wf-list tight" style={{ fontSize: ".875rem" }}>{item.attachments.map((a, i) => <li key={i}>{a.name} <span className="muted">· {a.type}{a.bytes ? ` · ${(a.bytes / 1024 / 1024).toFixed(1)} MB` : ""}</span></li>)}</ul></> : null}
          {item.linkedDocs.length ? <><h3 style={{ marginTop: 16 }}>Linked documents</h3><ul className="wf-list tight" style={{ fontSize: ".875rem" }}>{item.linkedDocs.map((d, i) => <li key={i}><a href={d.url} target="_blank" rel="noreferrer">{d.kind === "spreadsheets" ? "Google Sheet" : d.kind === "presentation" ? "Google Slides" : "Google Doc"} ↗</a></li>)}</ul></> : null}
          <p className="muted" style={{ marginTop: 16, fontSize: ".85rem" }}>Wildflower Wisdom shows the summary only. The full post and its files are in Connected.</p>
        </div>
        <aside className="wf-card wf-card-section">
          <h3>Was this helpful?</h3>
          <div className="inline-actions"><button className={votes.mine === "helpful_yes" ? "primary-button" : ""} onClick={() => vote.mutate("helpful_yes")}><ThumbsUp size={16} /> Yes{votes.yes ? ` (${votes.yes})` : ""}</button><button className={votes.mine === "helpful_no" ? "primary-button" : ""} onClick={() => vote.mutate("helpful_no")}><ThumbsDown size={16} /> Not really{votes.no ? ` (${votes.no})` : ""}</button></div>
          <p className="muted" style={{ fontSize: ".8rem" }}>Votes feed the ranking so the best resources rise.</p>
          <h3 style={{ marginTop: 16 }}>Where it lives on the map</h3>
          <ul className="wf-list tight" style={{ fontSize: ".875rem" }}>{placements.map((p) => <li key={p.key}><Link to={`/map/${p.key}`}>{p.jobName} › {p.name}</Link>{p.isPrimary ? <span className="muted"> (primary)</span> : null}</li>)}</ul>
        </aside>
      </div>
    </div>
  );
}
