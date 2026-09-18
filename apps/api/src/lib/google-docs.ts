import { createSign } from "node:crypto";
import { env } from "../env.js";
import { normalizeWs } from "./text.js";

let saToken: { token: string; exp: number } | null = null;
async function serviceAccountToken(): Promise<string | null> {
  if (!env.googleServiceAccountJson) return null;
  if (saToken && saToken.exp > Date.now() + 60_000) return saToken.token;
  const sa = JSON.parse(env.googleServiceAccountJson) as { client_email: string; private_key: string; token_uri?: string };
  const now = Math.floor(Date.now() / 1000);
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const unsigned = `${b64({ alg: "RS256", typ: "JWT" })}.${b64({ iss: sa.client_email, scope: "https://www.googleapis.com/auth/drive.readonly", aud: sa.token_uri ?? "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 })}`;
  const sig = createSign("RSA-SHA256").update(unsigned).sign(sa.private_key, "base64url");
  const r = await fetch(sa.token_uri ?? "https://oauth2.googleapis.com/token", { method: "POST", body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${unsigned}.${sig}` }) });
  if (!r.ok) throw new Error(`service account token failed: ${r.status}`);
  const d = await r.json() as { access_token: string; expires_in: number };
  saToken = { token: d.access_token, exp: Date.now() + d.expires_in * 1000 };
  return saToken.token;
}

const EXPORT: Record<string, { pub: string; mime: string }> = {
  document: { pub: "export?format=txt", mime: "text/plain" },
  spreadsheets: { pub: "export?format=csv", mime: "text/csv" },
  presentation: { pub: "export/txt", mime: "text/plain" },
};

export interface LinkedDocResult { url: string; kind: string; status: "ok" | "private" | "error"; text: string }

/** Fetch text for a Google Doc/Sheet/Slides link: public export first, then the service account if configured. */
export async function fetchGoogleDocText(kind: string, id: string, maxChars = 120_000): Promise<LinkedDocResult> {
  const url = `https://docs.google.com/${kind}/d/${id}/edit`;
  const exp = EXPORT[kind]; if (!exp) return { url, kind, status: "error", text: "" };
  try {
    const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 30_000);
    const r = await fetch(`https://docs.google.com/${kind}/d/${id}/${exp.pub}`, { redirect: "follow", signal: ctrl.signal }).finally(() => clearTimeout(t));
    if (r.ok && !(r.headers.get("content-type") ?? "").includes("text/html")) return { url, kind, status: "ok", text: normalizeWs(await r.text()).slice(0, maxChars) };
  } catch { /* fall through */ }
  const token = await serviceAccountToken().catch(() => null);
  if (!token) return { url, kind, status: "private", text: "" };
  try {
    const r = await fetch(`https://www.googleapis.com/drive/v3/files/${id}/export?mimeType=${encodeURIComponent(exp.mime)}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!r.ok) return { url, kind, status: r.status === 403 || r.status === 404 ? "private" : "error", text: "" };
    return { url, kind, status: "ok", text: normalizeWs(await r.text()).slice(0, maxChars) };
  } catch { return { url, kind, status: "error", text: "" }; }
}
