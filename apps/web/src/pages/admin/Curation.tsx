import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router-dom";
import type { ItemSummary, JobSummary, StageKey } from "@wfw/shared";
import { api, fmtMonth } from "../../api";
import { ErrorState, Loading, Pill, SearchInput, State } from "../../components/ui";
type Row = ItemSummary & { hidden: boolean; pinnedStage: string | null; pinnedPosition: number | null; staffNote: string | null; reviewStatus: string | null; hasText: boolean; placements: { key: string; name: string; isPrimary: boolean; position: number | null }[] };
export function AdminCuration() {
  const qc = useQueryClient(); const [q, setQ] = useState(""); const [applied, setApplied] = useState(""); const [filter, setFilter] = useState(""); const [subjob, setSubjob] = useState(""); const [page, setPage] = useState(0); const [open, setOpen] = useState<string | null>(null);
  const map = useQuery({ queryKey: ["map"], queryFn: () => api.get<{ jobs: JobSummary[]; stages: { key: StageKey; name: string }[] }>("/api/map") });
  const key = ["admin-items", applied, filter, subjob, page];
  const items = useQuery({ queryKey: key, queryFn: () => api.get<{ items: Row[] }>(`/api/admin/items?q=${encodeURIComponent(applied)}&filter=${filter}&subjob=${subjob}&page=${page}`) });
  const inv = () => { qc.invalidateQueries({ queryKey: ["admin-items"] }); qc.invalidateQueries({ queryKey: ["home"] }); };
  const meta = useMutation({ mutationFn: ({ id, ...b }: { id: string } & Record<string, unknown>) => api.patch(`/api/admin/items/${id}/meta`, b), onSuccess: inv });
  const place = useMutation({ mutationFn: ({ id, placements }: { id: string; placements: { subjobKey: string; isPrimary: boolean }[] }) => api.put(`/api/admin/items/${id}/placements`, { placements }), onSuccess: inv });
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
          {items.data!.items.map((r) => <RowView key={r.id} r={r} open={open === r.id} setOpen={() => setOpen(open === r.id ? null : r.id)} subs={subs} stages={map.data!.stages} onMeta={(b) => meta.mutate({ id: r.id, ...b })} onPlace={(p) => place.mutate({ id: r.id, placements: p })} />)}
        </tbody></table></div>}
      <div className="inline-actions"><button className="small" disabled={page === 0} onClick={() => setPage(page - 1)}>Previous</button><span className="muted">Page {page + 1}</span><button className="small" disabled={(items.data?.items.length ?? 0) < 50} onClick={() => setPage(page + 1)}>Next</button></div>
    </div>
  );
}
function RowView({ r, open, setOpen, subs, stages, onMeta, onPlace }: { r: Row; open: boolean; setOpen: () => void; subs: { key: string; name: string; jobName: string }[]; stages: { key: StageKey; name: string }[]; onMeta: (b: Record<string, unknown>) => void; onPlace: (p: { subjobKey: string; isPrimary: boolean }[]) => void }) {
  const [pl, setPl] = useState(r.placements.map((p) => ({ subjobKey: p.key, isPrimary: p.isPrimary }))); const [addKey, setAddKey] = useState(""); const [note, setNote] = useState(r.staffNote ?? ""); const [dated, setDated] = useState(r.dated ?? "");
  return <>
    <tr className={r.hidden ? "muted" : ""}><td><Link to={`/item/${r.id}`}>{r.title}</Link> <Pill item={r} />{r.hidden ? <span className="wf-status wf-status-danger">hidden</span> : null}{!r.hasText ? <span className="wf-status" title="No searchable text">thin</span> : null}</td><td>{r.score}</td><td>{r.views}</td><td>{fmtMonth(r.updatedAt)}</td>
      <td><select value={r.curation ?? ""} onChange={(e) => onMeta({ curation: e.target.value || null })}><option value="">—</option><option value="recommended">Staff pick</option><option value="essential">Essential</option></select></td>
      <td><select value={r.pinnedStage ?? ""} onChange={(e) => onMeta({ pinnedStage: e.target.value || null, pinnedPosition: e.target.value ? (r.pinnedPosition ?? 50) : null })}><option value="">—</option>{stages.map((s) => <option key={s.key} value={s.key}>{s.name}</option>)}</select>{r.pinnedStage ? <input type="number" style={{ width: 64, marginLeft: 4 }} value={r.pinnedPosition ?? 50} onChange={(e) => onMeta({ pinnedPosition: Number(e.target.value) })} title="Position within Start here" /> : null}</td>
      <td style={{ fontSize: ".8rem" }}>{r.placements.map((p) => <span key={p.key}>{p.isPrimary ? <strong>{p.name}</strong> : p.name}; </span>)}</td>
      <td><div className="inline-actions"><button className="small" onClick={setOpen}>{open ? "Close" : "Edit"}</button><button className={`small${r.hidden ? " primary-button" : ""}`} onClick={() => onMeta({ hidden: !r.hidden })}>{r.hidden ? "Unhide" : "Hide"}</button></div></td></tr>
    {open ? <tr><td colSpan={8} style={{ background: "#f7faf8" }}>
      <div style={{ display: "grid", gap: 10 }}>
        <div><strong>Placements</strong> <span className="muted">(one primary; items can live in several places)</span><div className="inline-actions" style={{ marginTop: 6 }}>{pl.map((p) => <span key={p.subjobKey} className="wf-status wf-status-teal"><label style={{ display: "inline-flex", gap: 4, alignItems: "center" }}><input type="radio" name={`prim-${r.id}`} checked={p.isPrimary} onChange={() => setPl(pl.map((x) => ({ ...x, isPrimary: x.subjobKey === p.subjobKey })))} />{subs.find((s) => s.key === p.subjobKey)?.name ?? p.subjobKey}</label><button className="link-button small" onClick={() => setPl(pl.filter((x) => x.subjobKey !== p.subjobKey))}>×</button></span>)}
          <select value={addKey} onChange={(e) => setAddKey(e.target.value)}><option value="">Add to…</option>{subs.filter((s) => !pl.some((p) => p.subjobKey === s.key)).map((s) => <option key={s.key} value={s.key}>{s.jobName} › {s.name}</option>)}</select><button className="small" disabled={!addKey} onClick={() => { setPl([...pl, { subjobKey: addKey, isPrimary: pl.length === 0 }]); setAddKey(""); }}>Add</button><button className="primary-button small" onClick={() => onPlace(pl)}>Save placements</button></div></div>
        <div className="field-row"><label className="field"><span>Dated label (leave empty to clear)</span><div className="inline-actions"><input value={dated} onChange={(e) => setDated(e.target.value)} placeholder="e.g. Dated 2021" /><button className="small" onClick={() => onMeta({ datedLabel: dated || null })}>Save</button></div></label><label className="field"><span>Staff note (internal)</span><div className="inline-actions"><input value={note} onChange={(e) => setNote(e.target.value)} /><button className="small" onClick={() => onMeta({ staffNote: note || null })}>Save</button></div></label></div>
      </div></td></tr> : null}
  </>;
}
