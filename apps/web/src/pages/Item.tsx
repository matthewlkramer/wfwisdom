import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, ExternalLink, Pencil, ThumbsDown, ThumbsUp } from "lucide-react";
import { Link, useNavigate, useParams } from "react-router-dom";
import type { ItemSummary } from "@wfw/shared";
import { api, fmtDate } from "../api";
import { ErrorState, ItemGrid, Linkify, Loading, Pill } from "../components/ui";
import { useMe } from "../me";

type Attachment = { id: number; name: string; type: string; bytes: number; mime: string | null };
type LinkedDoc = { url: string; kind: string; status: string };
type Detail = {
  item: ItemSummary & { authorName: string | null; publishedAt: string | null; categories: string[]; audiences: string[]; bodyHtml: string; primaryVideo: Attachment | null; attachments: Attachment[]; linkedDocs: LinkedDoc[]; contents: ItemSummary[]; seriesNav: { seriesId: string; seriesTitle: string; posts: { id: string; title: string; current: boolean }[] }[]; native: { kind: string | null; googleKind: string | null; googleFileId: string | null; status: string; author: { id: string; name: string } | null } | null };
  placements: { key: string; name: string; jobName: string; jobKey: string; isPrimary: boolean }[];
  votes: { yes: number; no: number; mine: string | null };
};

const mb = (b: number) => (b ? ` · ${(b / 1024 / 1024).toFixed(1)} MB` : "");
const docLabel = (k: string) => (k === "spreadsheets" ? "Google Sheet" : k === "presentation" ? "Google Slides" : "Google Doc");
const embedUrl = (d: LinkedDoc) => { const m = d.url.match(/\/d\/([A-Za-z0-9_-]+)/); const id = m?.[1] ?? ""; return d.kind === "presentation" ? `https://docs.google.com/presentation/d/${id}/embed?start=false&loop=false` : `https://docs.google.com/${d.kind}/d/${id}/preview`; };

function Media({ a }: { a: Attachment }) {
  const src = `/api/files/${a.id}`;
  const isPdfLike = a.type === "PreviewableDocument" || a.type === "Document";
  return (
    <figure className="wf-media">
      {a.type === "Image" ? <img src={src} alt={a.name} loading="lazy" />
        : a.type === "Video" ? <video src={src} controls preload="metadata" />
        : a.type === "Audio" ? <audio src={src} controls preload="metadata" style={{ width: "100%" }} />
        : isPdfLike ? <iframe src={src} title={a.name} loading="lazy" />
        : null}
      <figcaption className="caption"><strong>{a.name}</strong><span className="muted">{a.type === "PreviewableDocument" ? "document" : a.type.toLowerCase()}{mb(a.bytes)}</span><a href={`${src}?download=1`}><Download size={14} /> Download</a></figcaption>
    </figure>
  );
}

export function ItemPage() {
  const { id } = useParams(); const qc = useQueryClient(); const me = useMe();
  const q = useQuery({ queryKey: ["item", id], queryFn: () => api.get<Detail>(`/api/map/item/${id}`) });
  const vote = useMutation({ mutationFn: (kind: "helpful_yes" | "helpful_no") => api.post("/api/signals", { itemId: id, kind }), onSuccess: () => qc.invalidateQueries({ queryKey: ["item", id] }) });
  useEffect(() => { window.scrollTo(0, 0); }, [id]);
  if (q.isLoading) return <div className="wf-page"><Loading /></div>;
  if (q.error) return <div className="wf-page"><ErrorState error={q.error} retry={() => q.refetch()} /></div>;
  const { item, placements, votes } = q.data!;
  const primary = placements.find((p) => p.isPrimary) ?? placements[0];
  const inlined = new Set([...item.bodyHtml.matchAll(/data-content-id="(\d+)"/g)].map((m) => Number(m[1])));
  // The primary video is rendered at the top of the page, so it is not repeated in the body or Files.
  const rest = item.attachments.filter((a) => !inlined.has(a.id) && a.id !== item.primaryVideo?.id);
  const images = rest.filter((a) => a.type === "Image");
  const files = rest.filter((a) => a.type !== "Image");
  const kindLabel = item.kind === "series" ? "Series" : item.kind === "question" ? "Q&A" : item.contentType ?? "Post";
  return (
    <div className="wf-page">
      {primary ? <Link to={`/map/${primary.key}`} className="wf-page-back">← {primary.jobName} · {primary.name}</Link> : <Link to="/map" className="wf-page-back">← Map</Link>}
      <div className="wf-page-header">
        <div>
          <div className="wf-record-tags" style={{ marginBottom: 8 }}><Pill item={item} /><span className="wf-status wf-status-stage">{kindLabel}</span></div>
          <h1>{item.title}</h1>
          <p className="muted" style={{ marginTop: 6 }}>
            {item.native?.author ? <>{item.native.author.name}</> : item.authorName ? <>{item.authorName}</> : null}
            {item.authorName && item.publishedAt ? " · " : ""}
            {item.publishedAt ? <>Published {fmtDate(item.publishedAt)}</> : null}
            {item.updatedAt && item.updatedAt !== item.publishedAt ? <> · updated {fmtDate(item.updatedAt)}</> : null}
          </p>
        </div>
        <div className="wf-record-actions native-actions">
          {item.native && (item.native.kind === "google" || item.native.kind === "file") ? <a className="secondary-button" href={item.url} target="_blank" rel="noreferrer"><ExternalLink size={16} /> Open in Google</a> : null}
          {item.native && me?.role === "staff" ? <Link className="secondary-button" to={`/admin/resources/${item.id}`}><Pencil size={16} /> Edit</Link> : null}
        </div>
      </div>
      {item.native?.status && item.native.status !== "published" ? <div className="wf-state wf-state-info" style={{ marginBottom: 16 }}><strong>{item.native.status === "pending" ? "Waiting for staff review" : "Not published"}</strong></div> : null}
      <div className="two-col">
        <div>
          <article className="wf-card wf-card-section">
            {item.primaryVideo ? <Media a={item.primaryVideo} /> : null}
            {item.description && item.description !== item.title ? <p className="lede" style={{ marginTop: 0 }}>{item.description}</p> : null}
            {item.bodyHtml ? <div className="wf-doc" dangerouslySetInnerHTML={{ __html: item.bodyHtml }} /> : null}
            {images.map((a) => <Media key={a.id} a={a} />)}
            {(item.kind === "series" || item.native?.kind === "series") && item.contents.length ? <><h2 style={{ marginTop: 8 }}>In this series</h2><ItemGrid items={item.contents} context={{ from: "series" }} /></> : null}
            {!item.bodyHtml && !item.attachments.length && !item.linkedDocs.length && !item.contents.length ? <p className="muted">This item has no readable content beyond its title.</p> : null}
          </article>
          {files.length ? <section className="wf-card wf-card-section" style={{ marginTop: 16 }}><h2 style={{ marginTop: 0 }}>Files</h2>{files.map((a) => <Media key={a.id} a={a} />)}</section> : null}
          {item.linkedDocs.length ? <section className="wf-card wf-card-section" style={{ marginTop: 16 }}><h2 style={{ marginTop: 0 }}>Linked Google files</h2>
            {item.linkedDocs.map((d, i) => <figure className="wf-embed" key={i}><iframe src={embedUrl(d)} title={docLabel(d.kind)} loading="lazy" allowFullScreen /><figcaption><a href={d.url} target="_blank" rel="noreferrer">{docLabel(d.kind)} ↗</a>{d.status === "private" ? <span className="muted"> · shared privately; you may need to request access</span> : null}</figcaption></figure>)}
          </section> : null}
        </div>
        <aside>
          <div className="wf-card wf-card-section sticky">
            {item.summary ? <><h3 style={{ marginTop: 0 }}>At a glance</h3><p style={{ fontSize: ".92rem" }}><Linkify text={item.summary} /></p></> : null}
            <h3>Was this helpful?</h3>
            <div className="inline-actions"><button className={votes.mine === "helpful_yes" ? "primary-button" : ""} onClick={() => vote.mutate("helpful_yes")}><ThumbsUp size={16} /> Yes{votes.yes ? ` (${votes.yes})` : ""}</button><button className={votes.mine === "helpful_no" ? "primary-button" : ""} onClick={() => vote.mutate("helpful_no")}><ThumbsDown size={16} /> Not really{votes.no ? ` (${votes.no})` : ""}</button></div>
            <p className="muted" style={{ fontSize: ".8rem" }}>Votes feed the ranking so the best resources rise.</p>
            {item.seriesNav?.map((sn) => <div key={sn.seriesId} className="series-nav"><h3 style={{ marginTop: 16 }}>In this series: <Link to={`/item/${sn.seriesId}`}>{sn.seriesTitle}</Link></h3><ol>{sn.posts.map((p) => <li key={p.id} className={p.current ? "current" : ""} aria-current={p.current ? "page" : undefined}>{p.current ? <span>{p.title}</span> : <Link to={`/item/${p.id}`}>{p.title}</Link>}</li>)}</ol></div>)}
            <h3 style={{ marginTop: 16 }}>Where it lives on the map</h3>
            <ul className="wf-list tight" style={{ fontSize: ".875rem" }}>{placements.map((p) => <li key={p.key}><Link to={`/map/${p.key}`}>{p.jobName} › {p.name}</Link>{p.isPrimary ? <span className="muted"> (primary)</span> : null}</li>)}</ul>
            <h3 style={{ marginTop: 16 }}>Details</h3>
            <dl className="wf-record-facts">
              <div><dt>Views</dt><dd>{item.views.toLocaleString()}</dd></div>
              {item.categories.length ? <div><dt>Categories</dt><dd>{item.categories.join("; ")}</dd></div> : null}
              {item.audiences.length ? <div><dt>Audience tags</dt><dd>{item.audiences.join("; ")}</dd></div> : null}
            </dl>
          </div>
        </aside>
      </div>
    </div>
  );
}

/** Links inside imported content point at Connected ids; look the item up and go there. */
export function ConnectedRedirect() {
  const { kind, sourceId } = useParams(); const nav = useNavigate();
  const q = useQuery({ queryKey: ["by-source", kind, sourceId], queryFn: () => api.get<{ id: string; url: string }>(`/api/map/by-source/${kind}/${sourceId}`), retry: false });
  useEffect(() => { if (q.data) nav(`/item/${q.data.id}`, { replace: true }); }, [q.data, nav]);
  if (q.error) return <div className="wf-page narrow"><ErrorState error={q.error} /><p>That resource is not in Wildflower Wisdom. It may be unpublished or restricted in Connected.</p></div>;
  return <div className="wf-page"><Loading /></div>;
}
