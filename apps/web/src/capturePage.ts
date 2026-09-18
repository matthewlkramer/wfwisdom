import html2canvas from "html2canvas";

/** JPEG data URL of the visible viewport, excluding the feedback dialog itself. Null when capture fails. */
export async function captureVisiblePage(): Promise<string | null> {
  try {
    const canvas = await html2canvas(document.body, {
      backgroundColor: "#f4f6f2",
      width: window.innerWidth, height: window.innerHeight, windowWidth: window.innerWidth, windowHeight: window.innerHeight,
      scrollX: -window.scrollX, scrollY: -window.scrollY,
      scale: Math.min(window.devicePixelRatio || 1, 1.25),
      useCORS: true, logging: false,
      ignoreElements: (element) => element.classList.contains("feedback-dialog-backdrop"),
    });
    let quality = 0.62;
    let out = canvas.toDataURL("image/jpeg", quality);
    while (out.length > 950_000 && quality > 0.2) { quality -= 0.12; out = canvas.toDataURL("image/jpeg", quality); }
    return out.length > 1_000_000 ? null : out;
  } catch { return null; }
}
