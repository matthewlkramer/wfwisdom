import { useQuery } from "@tanstack/react-query";
import { api } from "../api";
import { State } from "../components/ui";
export function Landing({ next }: { next: string }) {
  const cfg = useQuery({ queryKey: ["auth-config"], queryFn: () => api.get<{ googleConfigured: boolean }>("/api/auth/config") });
  const err = new URLSearchParams(window.location.search).get("auth_error");
  return (
    <div className="app-shell no-sidebar"><main className="app-main"><div className="wf-page narrow">
      <div className="hero"><div className="hero-copy">
        <p className="eyebrow">Wildflower Schools</p>
        <h1>Wildflower Wisdom</h1>
        <p className="lede">The Wildflower knowledge base: a map organized by what you are doing right now, search that understands the question, and feedback on the materials you are writing.</p>
        {err ? <State kind="error" title="Sign-in did not complete">{err}</State> : null}
        {cfg.data && !cfg.data.googleConfigured ? <State kind="info" title="Sign-in is not configured yet">Google sign-in secrets have not been set on this deployment.</State> : null}
        <p><a className="primary-button" href={`/api/auth/google?next=${encodeURIComponent(next === "/" ? "/" : next)}`}>Sign in with Google</a></p>
        <p className="muted" style={{ fontSize: ".85rem" }}>Any Google account can sign in. Wildflower Foundation accounts also get the foundation partner workspace. We store your name and email so you can see your own drafts and feedback; nothing else.</p>
      </div>
      <aside className="wf-card wf-card-section"><h3>What you can do here</h3><ul className="wf-list tight" style={{ fontSize: ".9rem" }}><li><strong>Start here</strong> shows the handful of resources that matter for your stage.</li><li><strong>Map</strong> organizes Connected by the job in front of you: find a space, form a board, recruit families.</li><li><strong>Ask</strong> answers questions using only Connected content, with citations.</li><li><strong>Get feedback</strong> reviews a draft letter, handbook, budget, or posting against what a strong Ops Guide would expect.</li></ul></aside></div>
    </div></main></div>
  );
}
