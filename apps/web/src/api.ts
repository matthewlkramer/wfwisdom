export class ApiError extends Error { constructor(msg: string, public status: number, public code?: string) { super(msg); } }
async function handle<T>(r: Response): Promise<T> {
  if (r.status === 204) return undefined as T;
  const text = await r.text(); let data: unknown = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = null; }
  if (!r.ok) { const d = data as { error?: string; code?: string } | null; throw new ApiError(d?.error ?? `Request failed (${r.status})`, r.status, d?.code); }
  return data as T;
}
export const api = {
  get: <T>(url: string) => fetch(url, { credentials: "include" }).then((r) => handle<T>(r)),
  post: <T>(url: string, body?: unknown) => fetch(url, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) }).then((r) => handle<T>(r)),
  put: <T>(url: string, body?: unknown) => fetch(url, { method: "PUT", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body ?? {}) }).then((r) => handle<T>(r)),
  patch: <T>(url: string, body?: unknown) => fetch(url, { method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body ?? {}) }).then((r) => handle<T>(r)),
  del: <T>(url: string) => fetch(url, { method: "DELETE", credentials: "include" }).then((r) => handle<T>(r)),
  form: <T>(url: string, fd: FormData) => fetch(url, { method: "POST", credentials: "include", body: fd }).then((r) => handle<T>(r)),
};
export function fmtDate(d: string | null | undefined): string { if (!d) return ""; return new Date(d).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }); }
export function fmtMonth(d: string | null | undefined): string { if (!d) return ""; return new Date(d).toLocaleDateString(undefined, { year: "numeric", month: "short" }); }
export function signalClick(itemId: string, context: Record<string, unknown> = {}, kind: "click" | "search_click" = "click") { void api.post("/api/signals", { itemId, kind, context }).catch(() => {}); }

/** A Connected URL becomes an in-app link (resolved by /c/:kind/:id); anything else is left as is. */
export function internalHref(url: string): string {
  const m = /connected\.wildflowerschools\.org\/(posts|series|questions)\/(\d+)/.exec(url);
  return m ? `/c/${m[1] === "posts" ? "post" : m[1] === "series" ? "series" : "question"}/${m[2]}` : url;
}
