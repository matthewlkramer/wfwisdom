import { useRef, useState, type FormEvent, type PointerEvent } from "react";
import { GripHorizontal, X } from "lucide-react";
import type { FeedbackCategory } from "@wfw/shared";
import { api } from "../api";
import { captureVisiblePage } from "../capturePage";
import { State } from "./ui";

const controlSelector = "button, input, select, textarea, a";
export function canStartDrag(button: number, target: { closest: (selector: string) => Element | null } | null) { return button === 0 && !target?.closest(controlSelector); }
export function dialogPosition({ clientX, clientY, offsetX, offsetY, dialogWidth, dialogHeight, viewportWidth, viewportHeight }: { clientX: number; clientY: number; offsetX: number; offsetY: number; dialogWidth: number; dialogHeight: number; viewportWidth: number; viewportHeight: number }) {
  const inset = 12;
  return { left: Math.min(Math.max(inset, clientX - offsetX), Math.max(inset, viewportWidth - dialogWidth - inset)), top: Math.min(Math.max(inset, clientY - offsetY), Math.max(inset, viewportHeight - dialogHeight - inset)) };
}

/** Draggable feedback form. The current page and a screenshot of the viewport go with the message. */
export function FeedbackDialog({ onClose }: { onClose: () => void }) {
  const [category, setCategory] = useState<FeedbackCategory>("suggestion");
  const [message, setMessage] = useState("");
  const [state, setState] = useState<"idle" | "pending" | "success" | "error">("idle");
  const [error, setError] = useState("");
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  const dialog = useRef<HTMLElement>(null);
  const drag = useRef<{ pointerId: number; offsetX: number; offsetY: number } | null>(null);
  const startDrag = (e: PointerEvent<HTMLElement>) => {
    if (!canStartDrag(e.button, e.target instanceof Element ? e.target : null)) return;
    const b = dialog.current?.getBoundingClientRect(); if (!b) return;
    drag.current = { pointerId: e.pointerId, offsetX: e.clientX - b.left, offsetY: e.clientY - b.top };
    e.currentTarget.setPointerCapture(e.pointerId); e.preventDefault();
  };
  const moveDrag = (e: PointerEvent<HTMLElement>) => {
    if (!drag.current || drag.current.pointerId !== e.pointerId) return;
    const b = dialog.current?.getBoundingClientRect(); if (!b) return;
    setPosition(dialogPosition({ clientX: e.clientX, clientY: e.clientY, offsetX: drag.current.offsetX, offsetY: drag.current.offsetY, dialogWidth: b.width, dialogHeight: b.height, viewportWidth: window.innerWidth, viewportHeight: window.innerHeight }));
  };
  const endDrag = (e: PointerEvent<HTMLElement>) => {
    if (!drag.current || drag.current.pointerId !== e.pointerId) return;
    drag.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
  };
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!message.trim()) { setError("Tell us what happened or what would help."); return; }
    setState("pending"); setError("");
    try {
      const screenshotDataUrl = await captureVisiblePage();
      await api.post("/api/feedback", { category, message: message.trim(), pageUrl: window.location.href, pagePath: window.location.pathname, pageTitle: document.title, screenshotDataUrl, context: { viewport: `${window.innerWidth}x${window.innerHeight}`, userAgent: navigator.userAgent, referrer: document.referrer || null, screenshot: screenshotDataUrl ? "captured" : "unavailable" } });
      setState("success"); setMessage("");
    } catch (cause) { setState("error"); setError(cause instanceof Error ? cause.message : "Feedback could not be sent."); }
  };
  return (
    <div className="feedback-dialog-backdrop" onMouseDown={onClose}>
      <section ref={dialog} className="feedback-dialog" style={position ? { left: position.left, top: position.top, transform: "none" } : undefined} onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="feedback-title">
        <header className="feedback-dialog-drag-handle" onPointerDown={startDrag} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag}>
          <span className="feedback-dialog-grip" aria-hidden="true"><GripHorizontal size={22} /></span>
          <div><span className="eyebrow">App feedback</span><h2 id="feedback-title">Help us make this clearer</h2><p className="muted">Send a note to the team. Your current page and a screenshot are included automatically.</p></div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close feedback"><X size={18} /></button>
        </header>
        {state === "success" ? <div className="feedback-success">Thanks. Your note is in the review queue.</div> : (
          <form className="feedback-form" onSubmit={(e) => void submit(e)}>
            <label>Type <select value={category} onChange={(e) => setCategory(e.target.value as FeedbackCategory)}><option value="suggestion">Suggestion</option><option value="bug">Something is broken</option><option value="question">Question</option><option value="other">Other</option></select></label>
            <label>Message <textarea value={message} onChange={(e) => setMessage(e.target.value)} placeholder="What should we know?" aria-describedby="feedback-error" /></label>
            {error ? <div id="feedback-error"><State kind="error" title="Unable to send feedback">{error}</State></div> : null}
            <footer><button type="button" onClick={onClose}>Cancel</button><button type="submit" className="primary-button" disabled={state === "pending"}>{state === "pending" ? "Sending…" : "Send feedback"}</button></footer>
          </form>
        )}
      </section>
    </div>
  );
}
