#!/usr/bin/env node
// Verifies every secret wfwisdom needs against its real service. Prints one line per secret.
// Never prints secret values. Run: node scripts/check-secrets.mjs
import net from "node:net";
const results = [];
const ok = (name, msg) => results.push(`OK    ${name}: ${msg}`);
const bad = (name, msg) => results.push(`FAIL  ${name}: ${msg}`);
const missing = (name) => results.push(`MISSING ${name}`);
const env = (k) => process.env[k]?.trim();
const withTimeout = (p, ms = 20000) => Promise.race([p, new Promise((_, r) => setTimeout(() => r(new Error("timeout")), ms))]);

async function checkOpenAI() {
  const key = env("OPENAI_API_KEY"); if (!key) return missing("OPENAI_API_KEY");
  const r = await withTimeout(fetch("https://api.openai.com/v1/models", { headers: { Authorization: `Bearer ${key}` } }));
  if (!r.ok) return bad("OPENAI_API_KEY", `HTTP ${r.status}`);
  const ids = (await r.json()).data.map((m) => m.id);
  const need = ["gpt-5.6-sol", "gpt-5.6-luna", "text-embedding-3-small"].filter((m) => !ids.includes(m));
  return need.length ? bad("OPENAI_API_KEY", `valid but missing models: ${need.join(", ")}`) : ok("OPENAI_API_KEY", `valid; sol, luna, embeddings available (${ids.length} models)`);
}
async function checkBloomfire() {
  const key = env("BLOOMFIRE_API_KEY"), email = env("BLOOMFIRE_LOGIN_EMAIL");
  if (!key) return missing("BLOOMFIRE_API_KEY"); if (!email) return missing("BLOOMFIRE_LOGIN_EMAIL");
  const r = await withTimeout(fetch("https://connected.wildflowerschools.org/api/v2/login", { method: "POST", headers: { "content-type": "application/json", "bloomfire-requested-fields": "session_token" }, body: JSON.stringify({ email, api_key: key }) }));
  if (!r.ok) return bad("BLOOMFIRE_API_KEY + BLOOMFIRE_LOGIN_EMAIL", `login HTTP ${r.status}: ${(await r.text()).slice(0, 120)}`);
  const { session_token } = await r.json();
  const me = await withTimeout(fetch("https://connected.wildflowerschools.org/api/v2/users/me", { headers: { Authorization: `Bloomfire-Session-Token ${session_token}` } }));
  const u = await me.json();
  return u?.id ? ok("BLOOMFIRE_API_KEY + BLOOMFIRE_LOGIN_EMAIL", `session token issued for ${u.first_name} ${u.last_name} (role ${u.role ?? "n/a"})`) : bad("BLOOMFIRE_API_KEY", "token issued but users/me returned no id");
}
async function checkGoogle() {
  const id = env("GOOGLE_CLIENT_ID"), secret = env("GOOGLE_CLIENT_SECRET");
  if (!id) return missing("GOOGLE_CLIENT_ID"); if (!secret) return missing("GOOGLE_CLIENT_SECRET");
  if (!id.endsWith(".apps.googleusercontent.com")) return bad("GOOGLE_CLIENT_ID", "does not look like an OAuth client id");
  // A bogus code exchange distinguishes bad credentials (invalid_client) from good ones (invalid_grant).
  const body = new URLSearchParams({ code: "bogus", client_id: id, client_secret: secret, redirect_uri: "https://wfwisdom.replit.app/api/auth/google/callback", grant_type: "authorization_code" });
  const r = await withTimeout(fetch("https://oauth2.googleapis.com/token", { method: "POST", body }));
  const j = await r.json().catch(() => ({}));
  if (j.error === "invalid_grant") return ok("GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET", "client id and secret accepted by Google (bogus code rejected as expected)");
  if (j.error === "invalid_client") return bad("GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET", `Google rejected the client: ${j.error_description ?? ""}`);
  if (j.error === "redirect_uri_mismatch") return bad("GOOGLE_CLIENT_ID", "credentials fine but the production redirect URI is not registered on the client");
  return bad("GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET", `unexpected response ${r.status} ${j.error ?? ""} ${j.error_description ?? ""}`);
}
async function checkSendGrid() {
  const key = env("SENDGRID_API_KEY"); if (!key) return missing("SENDGRID_API_KEY");
  const r = await withTimeout(fetch("https://api.sendgrid.com/v3/scopes", { headers: { Authorization: `Bearer ${key}` } }));
  if (!r.ok) return bad("SENDGRID_API_KEY", `HTTP ${r.status}`);
  const scopes = (await r.json()).scopes ?? [];
  const canSend = scopes.includes("mail.send");
  const v = await withTimeout(fetch("https://api.sendgrid.com/v3/verified_senders", { headers: { Authorization: `Bearer ${key}` } }));
  const senders = v.ok ? ((await v.json()).results ?? []).map((s) => s.from_email) : [];
  const d = await withTimeout(fetch("https://api.sendgrid.com/v3/whitelabel/domains", { headers: { Authorization: `Bearer ${key}` } }));
  const domains = d.ok ? (await d.json()).filter((x) => x.valid).map((x) => x.domain) : [];
  return (canSend ? ok : bad)("SENDGRID_API_KEY", `${canSend ? "has" : "LACKS"} mail.send; verified senders: ${senders.join(", ") || "none"}; authenticated domains: ${domains.join(", ") || "none"}`);
}
async function checkDatabase() {
  const url = env("DATABASE_URL"); if (!url) return missing("DATABASE_URL");
  let u; try { u = new URL(url); } catch { return bad("DATABASE_URL", "not a valid URL"); }
  const port = Number(u.port || 5432);
  const reach = await new Promise((res) => { const s = net.connect({ host: u.hostname, port, timeout: 8000 }); s.on("connect", () => { s.destroy(); res(true); }); s.on("error", () => res(false)); s.on("timeout", () => { s.destroy(); res(false); }); });
  if (!reach) return bad("DATABASE_URL", `cannot reach ${u.hostname}:${port}`);
  try { const { default: pg } = await import("pg"); const c = new pg.Client({ connectionString: url, ssl: u.hostname.includes("localhost") ? undefined : { rejectUnauthorized: false } }); await c.connect(); const r = await c.query("select version()"); await c.end(); return ok("DATABASE_URL", `connected; ${r.rows[0].version.split(",")[0]}`); }
  catch (e) { return e?.code === "ERR_MODULE_NOT_FOUND" ? ok("DATABASE_URL", `host ${u.hostname}:${port} reachable (pg driver not installed yet, login untested)`) : bad("DATABASE_URL", `connect failed: ${e.message}`); }
}
function checkSession() {
  const s = env("SESSION_SECRET"); if (!s) return missing("SESSION_SECRET");
  return s.length >= 32 ? ok("SESSION_SECRET", `${s.length} chars`) : bad("SESSION_SECRET", `only ${s.length} chars; use 64`);
}
function checkOptional() {
  for (const k of ["APP_BASE_URL", "STAFF_DOMAIN", "GOOGLE_SERVICE_ACCOUNT_JSON"]) env(k) ? ok(k, "set") : results.push(`INFO  ${k}: not set (optional; defaults apply)`);
}
await Promise.allSettled([checkOpenAI(), checkBloomfire(), checkGoogle(), checkSendGrid(), checkDatabase()]).then((rs) => rs.forEach((r) => r.status === "rejected" && bad("check", r.reason?.message ?? String(r.reason))));
checkSession(); checkOptional();
console.log(results.sort().join("\n"));
process.exit(results.some((l) => l.startsWith("FAIL") || l.startsWith("MISSING")) ? 1 : 0);
