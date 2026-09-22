import { useRef, useState, type ClipboardEvent, type FormEvent, type PointerEvent, type ReactNode } from "react";
import { GripHorizontal, X } from "lucide-react";
import type { FeedbackCategory } from "@wfw/shared";
import { api } from "../api";
import { captureVisiblePage, imageFromClipboard, imageToDataUrl } from "../capturePage";
import { State } from "./ui";

const controlSelector = "button, input, select, textarea, a";
export function canStartDrag(button: number, target: { closest: (selector: string) => Element | null } | null) { return button === 0 && !target?.closest(controlSelector); }
export function dialogPosition({ clientX, clientY, offsetX, offsetY, dialogWidth, dialogHeight, viewportWidth, viewportHeight }: { clientX: number; clientY: number; offsetX: number; offsetY: number; dialogWidth: number; dialogHeight: number; viewportWidth: number; viewportHeight: number }) {
  const inset = 12;
  return { left: Math.min(Math.max(inset, clientX - offsetX), Math.max(inset, viewportWidth - dialogWidth - inset)), top: Math.min(Math.max(inset, clientY - offsetY), Math.max(inset, viewportHeight - dialogHeight - inset)) };
}

/**
 * Draggable feedback form. The current page and a screenshot of the viewport go with the message.
 *
 * The search results page opens the same dialog with its own wording and the search attached, so a note
 * about a search lands in the one queue alongside everything else rather than in a form of its own.
 */
export function FeedbackDialog({ onClose, heading, intro, prompt, defaultCategory = "suggestion", extraContext, preview }: {
  onClose: () => void;
  heading?: string;
  intro?: string;
  /** Placeholder in the message box, so the question asked matches what the dialog was opened for. */
  prompt?: string;
  defaultCategory?: FeedbackCategory;
  /** Merged into the stored context. Whatever it holds is also shown in `preview`, so nothing is sent unseen. */
  extraContext?: Record<string, unknown>;
  preview?: ReactNode;
}) {
  const [category, setCategory] = useState<FeedbackCategory>(defaultCategory);
  const [message, setMessage] = useState("");
  const [state, setState] = useState<"idle" | "pending" | "success" | "error">("idle");
  const [error, setError] = useState("");
  // A screenshot the sender pasted, used instead of capturing the page they happen to be on. The page with
  // the problem is not always one you can send from — the sign-in page carries no feedback button at all.
  const [pasted, setPasted] = useState<string | null>(null);
  const [pasting, setPasting] = useState(false);
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
  const paste = async (e: ClipboardEvent) => {
    const file = imageFromClipboard(e.clipboardData);
    if (!file) return; // Text pasted into the message box behaves as it always did.
    e.preventDefault();
    setPasting(true); setError("");
    const url = await imageToDataUrl(file);
    setPasting(false);
    if (url) setPasted(url);
    else setError("That image could not be read, or it is too large even after shrinking. A JPEG or PNG screenshot should work.");
  };
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!message.trim()) { setError("Tell us what happened or what would help."); return; }
    setState("pending"); setError("");
    try {
      // A pasted image wins: it is the one the sender chose, rather than whatever page they sent it from.
      const screenshotDataUrl = pasted ?? await captureVisiblePage();
      await api.post("/api/feedback", { category, message: message.trim(), pageUrl: window.location.href, pagePath: window.location.pathname, pageTitle: document.title, screenshotDataUrl, context: { viewport: `${window.innerWidth}x${window.innerHeight}`, userAgent: navigator.userAgent, referrer: document.referrer || null, screenshot: screenshotDataUrl ? (pasted ? "pasted" : "captured") : "unavailable", ...extraContext } });
      setState("success"); setMessage(""); setPasted(null);
    } catch (cause) { setState("error"); setError(cause instanceof Error ? cause.message : "Feedback could not be sent."); }
  };
  return (
    <div className="feedback-dialog-backdrop" onMouseDown={onClose}>
      <section ref={dialog} className="feedback-dialog" style={position ? { left: position.left, top: position.top, transform: "none" } : undefined} onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="feedback-title">
        <header className="feedback-dialog-drag-handle" onPointerDown={startDrag} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag}>
          <span className="feedback-dialog-grip" aria-hidden="true"><GripHorizontal size={22} /></span>
          <div><span className="eyebrow">App feedback</span><h2 id="feedback-title">{heading ?? "Help us make this clearer"}</h2><p className="muted">{intro ?? "Send a note to the team. Your current page and a screenshot are included automatically."}</p></div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close feedback"><X size={18} /></button>
        </header>
        {state === "success" ? <div className="feedback-success">Thanks. Your note is in the review queue.</div> : (
          <form className="feedback-form" onSubmit={(e) => void submit(e)} onPaste={(e) => void paste(e)}>
            <label>Type <select value={category} onChange={(e) => setCategory(e.target.value as FeedbackCategory)}><option value="suggestion">Suggestion</option><option value="bug">Something is broken</option><option value="question">Question</option><option value="other">Other</option></select></label>
            {preview}
            <label>Message <textarea value={message} onChange={(e) => setMessage(e.target.value)} placeholder={prompt ?? "What should we know?"} aria-describedby="feedback-error" /></label>
            <div className="feedback-paste">
              {pasted
                ? <><img src={pasted} alt="The screenshot you pasted" className="feedback-paste-preview" />
                    <button type="button" className="small" onClick={() => setPasted(null)}>Remove this screenshot</button>
                    <span className="muted">Sent instead of a picture of this page.</span></>
                : <span className="muted">{pasting ? "Reading the image…" : "Paste a screenshot here (⌘V) to send one instead of a picture of this page — useful when the problem is somewhere you cannot send from."}</span>}
            </div>
            {error ? <div id="feedback-error"><State kind="error" title="Unable to send feedback">{error}</State></div> : null}
            <footer><button type="button" onClick={onClose}>Cancel</button><button type="submit" className="primary-button" disabled={state === "pending"}>{state === "pending" ? "Sending…" : "Send feedback"}</button></footer>
          </form>
        )}
      </section>
    </div>
  );
}
