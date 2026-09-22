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

/** The widest a pasted image is kept at. Screenshots come in at whatever the screen was; this is plenty to read. */
const PASTED_MAX_WIDTH = 1600;

/**
 * A pasted or chosen image as a JPEG data URL, small enough to store. Null when it cannot be read.
 *
 * Same 1 MB ceiling as a captured page, because the column holds both. A screenshot off a large display
 * arrives far bigger than that, so it is scaled down first and only then squeezed on quality — dropping
 * quality alone turns text illegible long before a 6 MB PNG gets under the limit.
 */
export async function imageToDataUrl(file: Blob): Promise<string | null> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, PASTED_MAX_WIDTH / bitmap.width);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close?.();
    let quality = 0.8;
    let out = canvas.toDataURL("image/jpeg", quality);
    while (out.length > 950_000 && quality > 0.2) { quality -= 0.12; out = canvas.toDataURL("image/jpeg", quality); }
    return out.length > 1_000_000 ? null : out;
  } catch { return null; }
}

/** The first image on a clipboard, or null when what was pasted is not one. */
export function imageFromClipboard(data: DataTransfer | null): File | null {
  for (const item of Array.from(data?.items ?? [])) {
    if (item.kind === "file" && item.type.startsWith("image/")) { const f = item.getAsFile(); if (f) return f; }
  }
  return null;
}
