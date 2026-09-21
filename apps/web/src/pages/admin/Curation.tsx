import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router-dom";
import { Eye, EyeOff, FolderMinus, Pencil, X } from "lucide-react";
import { DOC_TYPES, REGIONS, type ItemSummary, type JobSummary, type StageKey } from "@wfw/shared";
import { api, fmtMonth } from "../../api";
import { ErrorState, Loading, Pill, SearchInput, State } from "../../components/ui";
type Row = ItemSummary & { displayTitle: string | null; hidden: boolean; pinnedStage: string | null; pinnedPosition: number | null; staffNote: string | null; reviewStatus: string | null; hasText: boolean; placements: { key: string; name: string; isPrimary: boolean; position: number | null }[] };
export function AdminCuration() {
  const qc = useQueryClient(); const [q, setQ] = useState(""); const [applied, setApplied] = useState(""); const [filter, setFilter] = useState(""); const [subjob, setSubjob] = useState(""); const [page, setPage] = useState(0); const [open, setOpen] = useState<string | null>(null);
  const map = useQuery({ queryKey: ["map"], queryFn: () => api.get<{ jobs: JobSummary[]; stages: { key: StageKey; name: string }[] }>("/api/map") });
  const key = ["admin-items", applied, filter, subjob, page];
  const items = useQuery({ queryKey: key, queryFn: () => api.get<{ items: Row[] }>(`/api/admin/items?q=${encodeURIComponent(applied)}&filter=${filter}&subjob=${subjob}&page=${page}`) });
  const inv = () => { qc.invalidateQueries({ queryKey: ["admin-items"] }); qc.invalidateQueries({ queryKey: ["home"] }); };
  const meta = useMutation({ mutationFn: ({ id, ...b }: { id: string } & Record<string, unknown>) => api.patch(`/api/admin/items/${id}/meta`, b), onSuccess: inv });
  const place = useMutation({ mutationFn: ({ id, placements }: { id: string; placements: { subjobKey: string; isPrimary: boolean }[] }) => api.put(`/api/admin/items/${id}/placements`, { placements }), onSuccess: inv });
  const retype = useMutation({ mutationFn: ({ id, contentType }: { id: string; contentType: string | null }) => api.patch(`/api/admin/items/${id}/type`, { contentType }), onSuccess: inv });
  const reregion = useMutation({ mutationFn: ({ id, regions }: { id: string; regions: string[] }) => api.patch(`/api/admin/items/${id}/regions`, { regions }), onSuccess: inv });
  if (map.isLoading) return <Loading />;
  const subs = map.data?.jobs.flatMap((j) => j.subjobs.map((s) => ({ ...s, jobName: j.name }))) ?? [];
  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div className="wf-toolbar"><SearchInput value={q} onChange={setQ} placeholder="Find an item by title or text" onSubmit={() => { setApplied(q); setPage(0); }} />
        <select value={subjob} onChange={(e) => { setSubjob(e.target.value); setPage(0); }}><option value="">Any sub-job</option>{subs.map((s) => <option key={s.id} value={s.key}>{s.jobName} › {s.name}</option>)}</select>
        <select value={filter} onChange={(e) => { setFilter(e.target.value); setPage(0); }}><option value="">All items</option><option value="curated">Essential or Staff pick</option><option value="unplaced">Not on the map</option><option value="hidden">Hidden</option><option value="dated">Labeled dated</option><option value="linkonly">Link-only</option></select>
        <div className="wf-toolbar-actions"><button onClick={() => { setApplied(q); setPage(0); }}>Search</button></div></div>
      <State kind="info" title="How curation ranks">Hidden beats everything, then pinned position, then Essential, then Staff pick, then the computed score. Overrides survive re-indexing.</State>
      {items.isLoading ? <Loading /> : items.error ? <ErrorState error={items.error} retry={() => items.refetch()} /> : items.data!.items.length === 0 ? <State kind="empty" title="No items match" /> :
        <div className="table-wrap"><table className="wf-table"><thead><tr><th>Item</th><th>Score</th><th>Views</th><th>Updated</th><th>Curation</th><th>Pinned</th><th>Placements</th><th></th></tr></thead><tbody>
          {items.data!.items.map((r) => <RowView key={r.id} r={r} open={open === r.id} setOpen={() => setOpen(open === r.id ? null : r.id)} subs={subs} stages={map.data!.stages} filterSubjob={subs.find((s) => s.key === subjob) ?? null} onMeta={(b) => meta.mutate({ id: r.id, ...b })} onPlace={(p) => place.mutate({ id: r.id, placements: p })} onRetype={(t) => retype.mutate({ id: r.id, contentType: t })} onRegions={(rs) => reregion.mutate({ id: r.id, regions: rs })} />)}
        </tbody></table></div>}
      <div className="inline-actions"><button className="small" disabled={page === 0} onClick={() => setPage(page - 1)}>Previous</button><span className="muted">Page {page + 1}</span><button className="small" disabled={(items.data?.items.length ?? 0) < 50} onClick={() => setPage(page + 1)}>Next</button></div>
    </div>
  );
}
function RowView({ r, open, setOpen, subs, stages, filterSubjob, onMeta, onPlace, onRetype, onRegions }: { r: Row; open: boolean; setOpen: () => void; subs: { key: string; name: string; jobName: string }[]; stages: { key: StageKey; name: string }[]; filterSubjob: { key: string; name: string } | null; onMeta: (b: Record<string, unknown>) => void; onPlace: (p: { subjobKey: string; isPrimary: boolean }[]) => void; onRetype: (t: string | null) => void; onRegions: (r: string[]) => void }) {
  const [pl, setPl] = useState(r.placements.map((p) => ({ subjobKey: p.key, isPrimary: p.isPrimary }))); const [addKey, setAddKey] = useState(""); const [note, setNote] = useState(r.staffNote ?? ""); const [dated, setDated] = useState(r.dated ?? ""); const [title, setTitle] = useState(r.displayTitle ?? "");
  // Only offered when the filter row has a sub-job chosen and this item is actually in it.
  const removeFrom = filterSubjob && r.placements.some((p) => p.key === filterSubjob.key) ? filterSubjob : null;
  // Whatever is left keeps a primary, so an item never ends up placed with none.
  const withoutSubjob = (key: string) => {
    const kept = r.placements.filter((p) => p.key !== key).map((p) => ({ subjobKey: p.key, isPrimary: p.isPrimary }));
    if (kept.length && !kept.some((p) => p.isPrimary)) kept[0]!.isPrimary = true;
    return kept;
  };
  return <>
    <tr className={r.hidden ? "muted" : ""}><td><Link to={`/item/${r.id}`}>{r.title}</Link> <Pill item={r} />{r.hidden ? <span className="wf-status wf-status-danger">hidden</span> : null}{!r.hasText ? <span className="wf-status" title="No searchable text">thin</span> : null}</td><td>{r.score}</td><td>{r.views}</td><td>{fmtMonth(r.updatedAt)}</td>
      <td><select value={r.curation ?? ""} onChange={(e) => onMeta({ curation: e.target.value || null })}><option value="">—</option><option value="recommended">Staff pick</option><option value="essential">Essential</option></select></td>
      <td><select value={r.pinnedStage ?? ""} onChange={(e) => onMeta({ pinnedStage: e.target.value || null, pinnedPosition: e.target.value ? (r.pinnedPosition ?? 50) : null })}><option value="">—</option>{stages.map((s) => <option key={s.key} value={s.key}>{s.name}</option>)}</select>{r.pinnedStage ? <input type="number" style={{ width: 64, marginLeft: 4 }} value={r.pinnedPosition ?? 50} onChange={(e) => onMeta({ pinnedPosition: Number(e.target.value) })} title="Position within Start here" /> : null}</td>
      <td style={{ fontSize: ".8rem" }}>{r.placements.map((p) => <span key={p.key}>{p.isPrimary ? <strong>{p.name}</strong> : p.name}; </span>)}</td>
      <td><div className="inline-actions icon-row">
        <button className="icon-button" onClick={setOpen} title={open ? "Close" : "Edit"} aria-label={open ? "Close" : "Edit"}>{open ? <X size={16} /> : <Pencil size={16} />}</button>
        <button className={`icon-button${r.hidden ? " active" : ""}`} onClick={() => onMeta({ hidden: !r.hidden })} title={r.hidden ? "Unhide" : "Hide"} aria-label={r.hidden ? "Unhide" : "Hide"}>{r.hidden ? <EyeOff size={16} /> : <Eye size={16} />}</button>
        {/* Takes the item out of the sub-job picked in the filter row, leaving it wherever else it sits. */}
        <button className="icon-button danger" disabled={!removeFrom} onClick={() => removeFrom && confirm(`Remove "${r.title}" from ${removeFrom.name}? It stays in its other placements.`) && onPlace(withoutSubjob(removeFrom.key))}
          title={removeFrom ? `Remove from ${removeFrom.name}` : "Pick a sub-job in the filter row to remove from it"} aria-label={removeFrom ? `Remove from ${removeFrom.name}` : "Remove from sub-job"}><FolderMinus size={16} /></button>
      </div></td></tr>
    {open ? <tr><td colSpan={8} style={{ background: "#f7faf8" }}>
      <div style={{ display: "grid", gap: 10 }}>
        <div><strong>Placements</strong> <span className="muted">(one primary; items can live in several places)</span><div className="inline-actions" style={{ marginTop: 6 }}>{pl.map((p) => <span key={p.subjobKey} className="wf-status wf-status-teal"><label style={{ display: "inline-flex", gap: 4, alignItems: "center" }}><input type="radio" name={`prim-${r.id}`} checked={p.isPrimary} onChange={() => setPl(pl.map((x) => ({ ...x, isPrimary: x.subjobKey === p.subjobKey })))} />{subs.find((s) => s.key === p.subjobKey)?.name ?? p.subjobKey}</label><button className="link-button small" onClick={() => setPl(pl.filter((x) => x.subjobKey !== p.subjobKey))}>×</button></span>)}
          <select value={addKey} onChange={(e) => setAddKey(e.target.value)}><option value="">Add to…</option>{subs.filter((s) => !pl.some((p) => p.subjobKey === s.key)).map((s) => <option key={s.key} value={s.key}>{s.jobName} › {s.name}</option>)}</select><button className="small" disabled={!addKey} onClick={() => { setPl([...pl, { subjobKey: addKey, isPrimary: pl.length === 0 }]); setAddKey(""); }}>Add</button><button className="primary-button small" onClick={() => onPlace(pl)}>Save placements</button></div></div>
        <div><strong>Regions</strong> <span className="muted">(what this is written for; none means it applies wherever the reader is)</span>
          <div className="inline-actions" style={{ marginTop: 6 }}>{REGIONS.map((g) => <label key={g.key} className="wf-status wf-status-region" style={{ gap: 5 }}>
            <input type="checkbox" checked={r.regions.includes(g.key)} onChange={(e) => onRegions(e.target.checked ? [...r.regions, g.key] : r.regions.filter((x) => x !== g.key))} />{g.label}</label>)}</div></div>
        <div className="field-row"><label className="field"><span>Document type <span className="muted">(what readers filter by; a roster of people or programs is a Resource list)</span></span>
          <select value={r.contentType ?? ""} onChange={(e) => onRetype(e.target.value || null)}><option value="">—</option>{DOC_TYPES.filter((t) => t.key !== "series").map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}</select></label></div>
        <div className="field-row"><label className="field"><span>Title shown to readers (leave empty to use the one from Connected)</span><div className="inline-actions"><input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={r.title} /><button className="small" onClick={() => onMeta({ displayTitle: title || null })}>Save</button></div></label></div>
        <div className="field-row"><label className="field"><span>Dated label (leave empty to clear)</span><div className="inline-actions"><input value={dated} onChange={(e) => setDated(e.target.value)} placeholder="e.g. Dated 2021" /><button className="small" onClick={() => onMeta({ datedLabel: dated || null })}>Save</button></div></label><label className="field"><span>Staff note (internal)</span><div className="inline-actions"><input value={note} onChange={(e) => setNote(e.target.value)} /><button className="small" onClick={() => onMeta({ staffNote: note || null })}>Save</button></div></label></div>
      </div></td></tr> : null}
  </>;
}
