import { useState } from "react";
import { Activity, BookOpenCheck, Compass, FileText, Flower2, Gauge, ListTree, LogOut, Map as MapIcon, MessageSquarePlus, MessageSquareText, MessagesSquare, PenLine, Settings, Sparkles, Archive, Star, type LucideIcon } from "lucide-react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import type { SessionUser } from "@wfw/shared";
import { api } from "../api";
import { FeedbackDialog } from "./FeedbackDialog";
import { SearchInput } from "./ui";

interface NavItem { to: string; label: string; icon: LucideIcon; end?: boolean }
const workspace: NavItem[] = [
  { to: "/", label: "Start here", icon: Compass, end: true },
  { to: "/map", label: "Map", icon: MapIcon },
  { to: "/ask", label: "Ask", icon: MessagesSquare },
  { to: "/materials", label: "Draft documents", icon: Sparkles },
  { to: "/my", label: "My drafts", icon: PenLine },
];
const staff: NavItem[] = [
  { to: "/admin", label: "Overview", icon: Gauge, end: true },
  { to: "/admin/taxonomy", label: "Taxonomy", icon: ListTree },
  { to: "/admin/curation", label: "Curation", icon: Star },
  { to: "/admin/retirement", label: "Retirement queue", icon: Archive },
  { to: "/admin/types", label: "Material types", icon: BookOpenCheck },
  { to: "/admin/base-prompt", label: "Base prompt", icon: FileText },
  { to: "/admin/submissions", label: "Submission log", icon: FileText },
  { to: "/admin/feedback", label: "Feedback queue", icon: MessageSquareText },
  { to: "/admin/settings", label: "Settings", icon: Settings },
  { to: "/admin/activity", label: "Activity", icon: Activity },
];

function NavButton({ item }: { item: NavItem }) {
  const Icon = item.icon;
  return <NavLink to={item.to} end={item.end} className={({ isActive }) => (isActive ? "nav-button active" : "nav-button")} title={item.label}><Icon size={18} aria-hidden="true" />{item.label}</NavLink>;
}

export function Shell({ user, onSignOut }: { user: SessionUser; onSignOut: () => void }) {
  const nav = useNavigate(); const [q, setQ] = useState(""); const [feedbackOpen, setFeedbackOpen] = useState(false);
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <NavLink to="/" className="brand-lockup compact"><Flower2 aria-hidden="true" /><div><strong>Wildflower Wisdom</strong></div></NavLink>
        <nav aria-label="Primary navigation">
          <span className="nav-section-label">Workspace</span>
          {workspace.map((i) => <NavButton key={i.to} item={i} />)}
          {user.role === "staff" ? <><span className="nav-section-label">Staff</span>{staff.map((i) => <NavButton key={i.to} item={i} />)}</> : null}
        </nav>
        <div className="sidebar-foot"><div><span>{user.name}</span><small>{user.role === "staff" ? "Foundation staff" : "Teacher leader"}</small></div>
          <button className="sidebar-settings-button" aria-label="Sign out" title="Sign out" onClick={async () => { await api.post("/api/auth/logout"); onSignOut(); }}><LogOut size={18} /></button></div>
      </aside>
      <main className="main-content">
        <header className="authenticated-header">
          <div className="global-search"><SearchInput value={q} onChange={setQ} placeholder="Search Connected…" onSubmit={() => { if (q.trim()) nav(`/search?q=${encodeURIComponent(q.trim())}`); }} /></div>
          <div className="authenticated-actions"><button type="button" className="feedback-trigger" onClick={() => setFeedbackOpen(true)}><MessageSquarePlus size={17} aria-hidden="true" /> Feedback</button></div>
        </header>
        <Outlet />
        <footer className="app-footer">Wildflower Wisdom · resources from the Wildflower community, organized by the work of starting and running a school.</footer>
      </main>
      {feedbackOpen ? <FeedbackDialog onClose={() => setFeedbackOpen(false)} /> : null}
    </div>
  );
}
