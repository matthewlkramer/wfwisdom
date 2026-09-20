import { createSign } from "node:crypto";
import { env } from "../env.js";
import { normalizeWs } from "./text.js";

const tokens = new Map<string, { token: string; exp: number }>();
// Domain-wide delegation is authorized for the full Drive scope only, so reads request the same scope.
const DRIVE_RO = "https://www.googleapis.com/auth/drive";
const DRIVE_RW = "https://www.googleapis.com/auth/drive";

async function mintToken(scope: string, sub: string | null): Promise<string> {
  const sa = JSON.parse(env.googleServiceAccountJson) as { client_email: string; private_key: string; token_uri?: string };
  const now = Math.floor(Date.now() / 1000);
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const claims: Record<string, unknown> = { iss: sa.client_email, scope, aud: sa.token_uri ?? "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 };
  if (sub) claims.sub = sub;
  const unsigned = `${b64({ alg: "RS256", typ: "JWT" })}.${b64(claims)}`;
  const sig = createSign("RSA-SHA256").update(unsigned).sign(sa.private_key, "base64url");
  const r = await fetch(sa.token_uri ?? "https://oauth2.googleapis.com/token", { method: "POST", body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${unsigned}.${sig}` }) });
  if (!r.ok) throw new Error(`service account token failed (${sub ? "as " + sub : "direct"}): ${r.status} ${(await r.text()).slice(0, 200)}`);
  const d = await r.json() as { access_token: string; expires_in: number };
  tokens.set(`${scope}|${sub ?? ""}`, { token: d.access_token, exp: Date.now() + d.expires_in * 1000 });
  return d.access_token;
}

/**
 * Access token for Google Drive. With GOOGLE_IMPERSONATE_EMAIL set (domain-wide delegation) the token acts as that
 * user, which reaches private files in the domain; if delegation is not (yet) authorized it falls back to acting as
 * the service account itself, which still reaches shared drives the account is a member of.
 */
export async function driveToken(write = false): Promise<string | null> {
  if (!env.googleServiceAccountJson) return null;
  const scope = write ? DRIVE_RW : DRIVE_RO;
  const sub = env.googleImpersonateEmail || null;
  const cached = tokens.get(`${scope}|${sub ?? ""}`) ?? (sub ? tokens.get(`${scope}|`) : undefined);
  if (cached && cached.exp > Date.now() + 60_000) return cached.token;
  if (sub) { try { return await mintToken(scope, sub); } catch (e) { console.warn(`[google] impersonation unavailable, using the service account directly: ${(e as Error).message}`); } }
  return mintToken(scope, null);
}

async function serviceAccountToken(): Promise<string | null> { return driveToken(false).catch(() => null); }

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
