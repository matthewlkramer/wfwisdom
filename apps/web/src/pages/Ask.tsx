import { useMutation } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ApiError, api, signalClick } from "../api";
import { State } from "../components/ui";
type Msg = { role: "user" | "assistant"; content: string; citations?: { itemId: string; title: string; url: string }[]; covered?: boolean };
export function Ask() {
  const [sp] = useSearchParams(); const [msgs, setMsgs] = useState<Msg[]>([]); const [q, setQ] = useState(sp.get("q") ?? ""); const [convo] = useState(() => crypto.randomUUID()); const endRef = useRef<HTMLDivElement>(null);
  const ask = useMutation({ mutationFn: (question: string) => api.post<{ answer: string; covered: boolean; citations: Msg["citations"] }>("/api/search/chat", { conversationId: convo, question, history: msgs.map((m) => ({ role: m.role, content: m.content })) }), onSuccess: (r) => setMsgs((m) => [...m, { role: "assistant", content: r.answer, citations: r.citations, covered: r.covered }]) });
  const send = () => { const question = q.trim(); if (!question || ask.isPending) return; setMsgs((m) => [...m, { role: "user", content: question }]); setQ(""); ask.mutate(question); };
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs.length, ask.isPending]);
  const err = ask.error instanceof ApiError ? ask.error : null;
  return (
    <div className="wf-page narrow">
      <div className="wf-page-header"><div><h1>Ask Connected</h1><p>Answers come only from Connected content and always cite the items they drew on. When Connected does not cover something, it says so.</p></div></div>
      <div className="chat">
        {msgs.length === 0 ? <State kind="empty" title="Ask anything an emerging team asks">For example: “What are the requirements for a lease guaranty?”, “How do the first four board meetings go?”, “Do we need a nepotism policy?”</State> : null}
        {msgs.map((m, i) => <div key={i} className={`chat-msg ${m.role}${m.role === "assistant" && m.covered === false ? " uncovered" : ""}`}>
          <div style={{ whiteSpace: "pre-wrap" }}>{m.content}</div>
          {m.citations?.length ? <ul className="chat-cites">{m.citations.map((c, j) => <li key={c.itemId}>[{j + 1}] <Link to={`/item/${c.itemId}`} onClick={() => signalClick(c.itemId, { from: "chat" })}>{c.title}</Link> · <a href={c.url} target="_blank" rel="noreferrer">Connected ↗</a></li>)}</ul> : null}
        </div>)}
        {ask.isPending ? <div className="chat-msg assistant muted">Reading Connected…</div> : null}
        {err ? <State kind={err.status === 429 ? "info" : "error"} title={err.status === 429 ? "Paused" : "Could not answer"}>{err.message}</State> : null}
        <div ref={endRef} />
      </div>
      <form style={{ display: "flex", gap: 8, marginTop: 16 }} onSubmit={(e) => { e.preventDefault(); send(); }}><input style={{ flex: 1 }} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ask a question" aria-label="Your question" /><button className="primary-button" type="submit" disabled={ask.isPending || !q.trim()}>Ask</button></form>
      <p className="muted" style={{ fontSize: ".8rem", marginTop: 8 }}>Answers are generated from Connected passages by an AI model. Check anything legal or financial with your Operations Guide.</p>
    </div>
  );
}
