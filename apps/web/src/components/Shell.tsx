import { LogOut } from "lucide-react";
import { useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import type { SessionUser } from "@wfw/shared";
import { api } from "../api";
import { SearchInput } from "./ui";

export function Shell({ user, onSignOut }: { user: SessionUser; onSignOut: () => void }) {
  const nav = useNavigate(); const [q, setQ] = useState("");
  return (
    <div className="app-shell">
      <header className="app-header"><div className="app-header-inner">
        <NavLink to="/" className="brand"><span className="brand-mark" aria-hidden /><span>Wildflower Wisdom<small>Find and use the knowledge base</small></span></NavLink>
        <nav className="app-nav" aria-label="Main">
          <NavLink to="/" end>Start here</NavLink><NavLink to="/map">Map</NavLink><NavLink to="/ask">Ask</NavLink><NavLink to="/materials">Get feedback</NavLink><NavLink to="/my">My drafts</NavLink>
          {user.role === "staff" ? <NavLink to="/admin" className={({ isActive }) => `staff${isActive ? " active" : ""}`}>Staff</NavLink> : null}
        </nav>
        <div className="header-search"><SearchInput value={q} onChange={setQ} onSubmit={() => { if (q.trim()) { nav(`/search?q=${encodeURIComponent(q.trim())}`); } }} /></div>
        <div className="header-user"><span>{user.name}</span><button className="link-button" onClick={async () => { await api.post("/api/auth/logout"); onSignOut(); }} title="Sign out"><LogOut size={16} /></button></div>
      </div></header>
      <main className="app-main"><Outlet /></main>
      <footer className="app-footer">Wildflower Wisdom shows titles, summaries, and search results. Full content lives in Connected, where your Bloomfire login applies.</footer>
    </div>
  );
}
