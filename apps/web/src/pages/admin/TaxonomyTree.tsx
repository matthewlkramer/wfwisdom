import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, FolderMinus, GripVertical } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import type { ItemSummary, JobSummary } from "@wfw/shared";
import { api } from "../../api";
import { ErrorState, Loading, Pill, State } from "../../components/ui";

type Row = ItemSummary & { hidden: boolean; placements: { key: string; name: string; isPrimary: boolean }[] };
const DRAG_TYPE = "application/x-wfw-item";
/** Every sub-job holds well under this, so the list is the whole sub-job rather than a first page of it. */
const PAGE = 200;

/**
 * Moving resources around the taxonomy: the tree of jobs and sub-jobs on the left, the resources in the
 * selected sub-job on the right, and a drag from right to left to move one.
 *
 * Only the placement moves. A resource that also sits in other sub-jobs keeps those, and a resource that
 * was the primary of where it came from stays primary where it lands. Each row also carries a button to
 * take the resource out of the sub-job on screen without putting it anywhere else.
 */
export function TaxonomyTree() {
  const qc = useQueryClient();
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [selected, setSelected] = useState<string>("");
  const [copy, setCopy] = useState(false);
  const [over, setOver] = useState<string>("");
  const [dragging, setDragging] = useState<Row | null>(null);
  const [note, setNote] = useState<string>("");

  const map = useQuery({ queryKey: ["map"], queryFn: () => api.get<{ jobs: JobSummary[] }>("/api/map") });
  // Placements, not cards: the map's own count nests a series' posts inside the series, and every one of
  // those posts is a row here that can be dragged or removed. See the note on subjobPlacementCounts.
  const counts = useQuery({ queryKey: ["subjob-counts"], queryFn: () => api.get<{ counts: Record<string, number> }>("/api/admin/subjob-counts") });
  const items = useQuery({
    queryKey: ["admin-items", "", "", selected, 0],
    queryFn: () => api.get<{ items: Row[] }>(`/api/admin/items?q=&filter=&subjob=${encodeURIComponent(selected)}&page=0&size=${PAGE}`),
    enabled: !!selected,
  });
  const inv = () => { qc.invalidateQueries({ queryKey: ["admin-items"] }); qc.invalidateQueries({ queryKey: ["map"] }); qc.invalidateQueries({ queryKey: ["subjob-counts"] }); };
  const move = useMutation({
    mutationFn: (b: { id: string; from: string; to: string; copy: boolean }) => api.post(`/api/admin/items/${b.id}/move`, { from: b.from, to: b.to, copy: b.copy }),
    onSuccess: inv,
  });
  const place = useMutation({
    mutationFn: (b: { id: string; placements: { subjobKey: string; isPrimary: boolean }[] }) => api.put(`/api/admin/items/${b.id}/placements`, { placements: b.placements }),
    onSuccess: inv,
  });

  if (map.isLoading) return <Loading />;
  if (map.error) return <ErrorState error={map.error} retry={() => map.refetch()} />;
  const jobs = map.data!.jobs;
  const subName = (key: string) => jobs.flatMap((j) => j.subjobs).find((s) => s.key === key)?.name ?? key;
  const count = (id: string) => counts.data?.counts[id] ?? 0;

  /**
   * Take a resource out of the sub-job on screen and leave its other placements alone. Whatever is left
   * keeps a primary, so an item is never placed somewhere and primary nowhere — that is what the map
   * ranks on and what "most used" reads.
   */
  const remove = (r: Row) => {
    const others = r.placements.filter((p) => p.key !== selected);
    const where = others.length ? `It stays in ${others.map((p) => p.name).join(", ")}.` : "This is its only placement, so it will not appear anywhere on the map until it is placed again.";
    if (!confirm(`Remove “${r.title}” from ${subName(selected)}?\n\n${where}`)) return;
    const kept = others.map((p) => ({ subjobKey: p.key, isPrimary: p.isPrimary }));
    if (kept.length && !kept.some((p) => p.isPrimary)) kept[0]!.isPrimary = true;
    place.mutate({ id: r.id, placements: kept });
    setNote(`Removed “${r.title}” from ${subName(selected)}.${others.length ? "" : " It is no longer on the map."}`);
  };

  const drop = (targetKey: string) => {
    setOver("");
    const r = dragging;
    setDragging(null);
    if (!r || !selected || targetKey === selected) return;
    move.mutate({ id: r.id, from: selected, to: targetKey, copy });
    setNote(`${copy ? "Copied" : "Moved"} “${r.title}” to ${subName(targetKey)}.`);
  };

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div className="wf-toolbar">
        <span className="muted">Drag a resource from the right onto a sub-job on the left.</span>
        <label className="inline-actions" style={{ marginLeft: "auto" }}>
          <input type="checkbox" checked={copy} onChange={(e) => setCopy(e.target.checked)} />
          Copy instead of moving <span className="muted">(a resource can sit in several sub-jobs)</span>
        </label>
      </div>
      {move.error || place.error ? <ErrorState error={move.error ?? place.error} /> : note ? <State kind="success" title={note} /> : null}
      <div className="taxonomy-mover">
        <nav className="taxonomy-tree" aria-label="Jobs and sub-jobs">
          {jobs.map((j) => {
            const isOpen = open[j.id] ?? true;
            return (
              <div key={j.id} className="taxonomy-tree-job">
                <button type="button" className="taxonomy-tree-toggle" onClick={() => setOpen({ ...open, [j.id]: !isOpen })} aria-expanded={isOpen}>
                  {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  <span>{j.name}</span>
                  <span className="count">{j.subjobs.reduce((a, s) => a + count(s.id), 0)}</span>
                </button>
                {isOpen ? j.subjobs.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    className={`taxonomy-tree-sub${s.key === selected ? " active" : ""}${s.key === over ? " drop-target" : ""}`}
                    onClick={() => { setSelected(s.key); setNote(""); }}
                    // A drop is only allowed once a resource is in hand and it would actually land somewhere new.
                    onDragOver={(e) => { if (dragging && s.key !== selected) { e.preventDefault(); e.dataTransfer.dropEffect = copy ? "copy" : "move"; setOver(s.key); } }}
                    onDragLeave={() => setOver((k) => (k === s.key ? "" : k))}
                    onDrop={(e) => { e.preventDefault(); drop(s.key); }}
                  >
                    <span>{s.name}</span>
                    <span className="count">{count(s.id)}</span>
                  </button>
                )) : null}
              </div>
            );
          })}
        </nav>
        <div className="taxonomy-items">
          {!selected ? <State kind="empty" title="Pick a sub-job">Its resources are listed here, ready to drag onto another sub-job.</State>
            : items.isLoading ? <Loading />
            : items.error ? <ErrorState error={items.error} retry={() => items.refetch()} />
            : !items.data!.items.length ? <State kind="empty" title={`Nothing in ${subName(selected)}`}>Drag resources here from another sub-job, or place them from Curation.</State>
            : <>
                <p className="muted" style={{ margin: "0 0 8px" }}>{items.data!.items.length} in <strong>{subName(selected)}</strong>{items.data!.items.length === PAGE ? ` (first ${PAGE})` : ""}</p>
                <div className="sort-list">
                  {items.data!.items.map((r) => (
                    <div
                      key={r.id}
                      className={`sort-row taxonomy-item${dragging?.id === r.id ? " dragging" : ""}`}
                      draggable
                      onDragStart={(e) => { setDragging(r); e.dataTransfer.effectAllowed = "copyMove"; e.dataTransfer.setData(DRAG_TYPE, r.id); e.dataTransfer.setData("text/plain", r.title); }}
                      onDragEnd={() => { setDragging(null); setOver(""); }}
                    >
                      <GripVertical size={14} className="muted" aria-hidden />
                      <div className="grow"><Link to={`/item/${r.id}`}>{r.title}</Link> <Pill item={r} />{r.hidden ? <span className="wf-status wf-status-danger">hidden</span> : null}
                        {r.placements.length > 1 ? <div className="muted" style={{ fontSize: ".78rem" }}>also in {r.placements.filter((p) => p.key !== selected).map((p) => p.name).join(", ")}</div> : null}</div>
                      {/* Not a drag handle: grabbing the button must not pick the row up. */}
                      <button type="button" className="icon-button danger" draggable={false} onDragStart={(e) => { e.preventDefault(); e.stopPropagation(); }}
                        title={`Remove from ${subName(selected)}`} aria-label={`Remove ${r.title} from ${subName(selected)}`}
                        onClick={() => remove(r)}><FolderMinus size={15} /></button>
                    </div>
                  ))}
                </div>
              </>}
        </div>
      </div>
    </div>
  );
}
