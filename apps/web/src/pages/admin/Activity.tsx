import { useQuery } from "@tanstack/react-query";
import { api, fmtDate } from "../../api";
import { ErrorState, Loading } from "../../components/ui";
export function AdminActivity() {
  const q = useQuery({ queryKey: ["admin-activity"], queryFn: () => api.get<{ searches: { query: string; mode: string | null; resultCount: number | null; createdAt: string }[]; chats: { question: string; covered: boolean | null; createdAt: string; cost: string | null }[]; audits: { actor: string | null; action: string; target: string | null; createdAt: string }[] }>("/api/admin/activity") });
  const users = useQuery({ queryKey: ["admin-users"], queryFn: () => api.get<{ users: { id: string; email: string; name: string; role: string; lastLoginAt: string | null; stage: string | null }[] }>("/api/admin/users") });
  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorState error={q.error} retry={() => q.refetch()} />;
  const d = q.data!;
  return <div className="wf-card-grid wide">
    <section className="wf-card wf-card-section"><h3>Recent searches</h3><ul className="wf-list tight" style={{ fontSize: ".85rem" }}>{d.searches.map((s, i) => <li key={i}>{s.query} <span className="muted">· {s.mode} · {s.resultCount} results · {fmtDate(s.createdAt)}</span></li>)}</ul></section>
    <section className="wf-card wf-card-section"><h3>Recent questions</h3><ul className="wf-list tight" style={{ fontSize: ".85rem" }}>{d.chats.map((c, i) => <li key={i}>{c.question} <span className={c.covered === false ? "wf-status wf-status-attention" : "wf-status wf-status-teal"}>{c.covered === false ? "not covered" : "answered"}</span> <span className="muted">· {fmtDate(c.createdAt)}</span></li>)}</ul><p className="muted" style={{ fontSize: ".8rem" }}>Questions marked "not covered" are the best signal for what Connected is missing.</p></section>
    <section className="wf-card wf-card-section"><h3>Staff changes</h3><ul className="wf-list tight" style={{ fontSize: ".85rem" }}>{d.audits.map((a, i) => <li key={i}>{a.action} <span className="muted">{a.target} · {a.actor} · {fmtDate(a.createdAt)}</span></li>)}</ul></section>
    <section className="wf-card wf-card-section"><h3>Users ({users.data?.users.length ?? 0})</h3><div className="table-wrap"><table className="wf-table"><thead><tr><th>Name</th><th>Role</th><th>Stage</th><th>Last sign-in</th></tr></thead><tbody>{users.data?.users.map((u) => <tr key={u.id}><td>{u.name}<div className="muted" style={{ fontSize: ".75rem" }}>{u.email}</div></td><td>{u.role}</td><td>{u.stage ?? ""}</td><td>{fmtDate(u.lastLoginAt)}</td></tr>)}</tbody></table></div></section>
  </div>;
}
