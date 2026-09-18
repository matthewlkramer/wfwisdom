import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import type { Citation, MyQuestion, ShareAttribution, SharedExample } from "@wfw/shared";
import { ApiError, api, fmtDate, signalClick } from "../api";
import { State } from "../components/ui";

type Msg = { role: "user" | "assistant"; content: string; citations?: Citation[]; covered?: boolean };

function Cites({ citations, from }: { citations: Citation[]; from: string }) {
  if (!citations.length) return null;
  return <ul className="chat-cites">{citations.map((c, j) => <li key={c.itemId}>[{j + 1}] <Link to={`/item/${c.itemId}`} onClick={() => signalClick(c.itemId, { from })}>{c.title}</Link> · <a href={c.url} target="_blank" rel="noopener noreferrer">Connected ↗</a></li>)}</ul>;
}

/** The share status the asker sees for one of their own questions. */
function shareLabel(q: MyQuestion): string | null {
  if (!q.share.requested) return null;
  if (q.share.status === "approved") return "Shared as an example";
  if (q.share.status === "rejected") return "Not shared";
  return "Offered to share · waiting on staff";
}

export function Ask() {
  const [sp] = useSearchParams(); const qc = useQueryClient();
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [q, setQ] = useState(sp.get("q") ?? "");
  const [staffReview, setStaffReview] = useState(false);
  const [share, setShare] = useState(false);
  const [shareAttribution, setShareAttribution] = useState<ShareAttribution>("anonymous");
  const [convo] = useState(() => crypto.randomUUID());
  const endRef = useRef<HTMLDivElement>(null);
  const boxRef = useRef<HTMLInputElement>(null);

  const examples = useQuery({ queryKey: ["ask-examples"], queryFn: () => api.get<{ examples: SharedExample[] }>("/api/search/chat/examples") });
  const mine = useQuery({ queryKey: ["ask-mine"], queryFn: () => api.get<{ questions: MyQuestion[] }>("/api/search/chat/mine") });

  const ask = useMutation({
    mutationFn: (question: string) => api.post<{ answer: string; covered: boolean; citations: Citation[] }>("/api/search/chat", { conversationId: convo, question, history: msgs.map((m) => ({ role: m.role, content: m.content })), staffReview, share, shareAttribution }),
    onSuccess: (r) => { setMsgs((m) => [...m, { role: "assistant", content: r.answer, citations: r.citations, covered: r.covered }]); qc.invalidateQueries({ queryKey: ["ask-mine"] }); },
  });
  const send = () => { const question = q.trim(); if (!question || ask.isPending) return; setMsgs((m) => [...m, { role: "user", content: question }]); setQ(""); ask.mutate(question); };
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs.length, ask.isPending]);
  /** "Use this question" drops an earlier question back into the box so it can be edited and re-asked. */
  const reuse = (question: string) => { setQ(question); boxRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }); boxRef.current?.focus(); };
  const err = ask.error instanceof ApiError ? ask.error : null;

  return (
    <div className="wf-page narrow">
      <div className="wf-page-header"><div><h1>Ask Connected</h1><p>Answers come only from Connected content and always cite the items they drew on. When Connected does not cover something, it says so.</p></div></div>
      <div className="chat">
        {msgs.length === 0 ? <State kind="empty" title="Ask anything an emerging team asks">For example: “What are the requirements for a lease guaranty?”, “How do the first four board meetings go?”, “Do we need a nepotism policy?”</State> : null}
        {msgs.map((m, i) => <div key={i} className={`chat-msg ${m.role}${m.role === "assistant" && m.covered === false ? " uncovered" : ""}`}>
          <div style={{ whiteSpace: "pre-wrap" }}>{m.content}</div>
          <Cites citations={m.citations ?? []} from="chat" />
        </div>)}
        {ask.isPending ? <div className="chat-msg assistant muted">Reading Connected…</div> : null}
        {err ? <State kind={err.status === 429 ? "info" : "error"} title={err.status === 429 ? "Paused" : "Could not answer"}>{err.message}</State> : null}
        <div ref={endRef} />
      </div>

      <form style={{ display: "flex", gap: 8, marginTop: 16 }} onSubmit={(e) => { e.preventDefault(); send(); }}>
        <input ref={boxRef} style={{ flex: 1 }} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ask a question" aria-label="Your question" />
        <button className="primary-button" type="submit" disabled={ask.isPending || !q.trim()}>Ask</button>
      </form>
      <div className="ask-options">
        <label className="ask-check"><input type="checkbox" checked={staffReview} onChange={(e) => setStaffReview(e.target.checked)} /> Let Wildflower Foundation staff review this question and answer to improve the tool</label>
        <label className="ask-check"><input type="checkbox" checked={share} onChange={(e) => setShare(e.target.checked)} /> Share this question on this page as an example of what people are asking</label>
        {share ? (
          <label className="ask-check indent">How should it appear?
            <select value={shareAttribution} onChange={(e) => setShareAttribution(e.target.value as ShareAttribution)} aria-label="How your shared question appears">
              <option value="anonymous">Share anonymously</option>
              <option value="name">Share with my name</option>
            </select>
            <span className="muted"> Staff approve shared questions before anyone else sees them.</span>
          </label>
        ) : null}
      </div>
      <p className="muted" style={{ fontSize: ".8rem", marginTop: 8 }}>Answers are generated from Connected passages by an AI model. Check anything legal or financial with your Operations Guide.</p>

      {examples.data?.examples.length ? (
        <section style={{ marginTop: 28 }}>
          <div className="wf-section-header"><div><h2>What others are asking</h2><p>Questions teacher leaders offered as examples, approved by staff.</p></div></div>
          <div className="wf-list">
            {examples.data.examples.map((ex) => (
              <details key={ex.id} className="wf-card wf-card-section question-row">
                <summary>{ex.question}<span className="muted"> · {ex.askerName ?? "Anonymous"} · {fmtDate(ex.createdAt)}</span></summary>
                <div className="question-answer">
                  <div style={{ whiteSpace: "pre-wrap" }}>{ex.answer}</div>
                  <Cites citations={ex.citations} from="ask_example" />
                  <div className="inline-actions"><button type="button" onClick={() => reuse(ex.question)}>Use this question</button></div>
                </div>
              </details>
            ))}
          </div>
        </section>
      ) : null}

      <section style={{ marginTop: 28 }}>
        <div className="wf-section-header"><div><h2>Your questions</h2><p>Everything you have asked here, newest first.</p></div></div>
        {mine.isLoading ? <p className="muted">Loading…</p>
          : mine.data?.questions.length ? (
            <div className="wf-list">
              {mine.data.questions.map((m) => (
                <details key={m.id} className="wf-card wf-card-section question-row">
                  <summary>{m.question}<span className="muted"> · {fmtDate(m.createdAt)}</span>{m.staffReviewRequested ? <span className="wf-status wf-status-stage">Sent for staff review</span> : null}{shareLabel(m) ? <span className="wf-status wf-status-stage">{shareLabel(m)}</span> : null}</summary>
                  <div className="question-answer">
                    <div style={{ whiteSpace: "pre-wrap" }}>{m.answer ?? "No answer was recorded for this question."}</div>
                    <Cites citations={m.citations} from="ask_mine" />
                    <div className="inline-actions"><button type="button" onClick={() => reuse(m.question)}>Use this question</button></div>
                  </div>
                </details>
              ))}
            </div>
          ) : <State kind="empty" title="Nothing yet">Questions you ask here will be listed so you can come back to the answers.</State>}
      </section>
    </div>
  );
}
