import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { OAuth2Client } from "google-auth-library";
import { and, eq, getDb, gt, sessions, users } from "@wfw/db";
import { isResourceLanguage, type SessionUser } from "@wfw/shared";
import { env } from "./env.js";
import { getSettings } from "./settings.js";

const COOKIE = "wfw_session";
const STATE_COOKIE = "wfw_oauth_state";
const SESSION_DAYS = 30;


function sign(value: string): string { return `${value}.${createHmac("sha256", env.sessionSecret).update(value).digest("base64url")}`; }
function unsign(signed: string | undefined): string | null {
  if (!signed) return null;
  const i = signed.lastIndexOf("."); if (i < 0) return null;
  const value = signed.slice(0, i), mac = signed.slice(i + 1);
  const expected = createHmac("sha256", env.sessionSecret).update(value).digest("base64url");
  if (mac.length !== expected.length || !timingSafeEqual(Buffer.from(mac), Buffer.from(expected))) return null;
  return value;
}
export function parseCookies(req: Request): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of (req.headers.cookie ?? "").split(";")) { const i = part.indexOf("="); if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim()); }
  return out;
}
function cookieOptions(maxAgeSeconds: number) {
  return { httpOnly: true, sameSite: "lax" as const, secure: env.isProd || env.appBaseUrl.startsWith("https"), path: "/", maxAge: maxAgeSeconds * 1000 };
}

export function callbackUrl(): string { return `${env.appBaseUrl}/api/auth/google/callback`; }
function client(): OAuth2Client { return new OAuth2Client({ clientId: env.googleClientId, clientSecret: env.googleClientSecret, redirectUri: callbackUrl() }); }

export function beginGoogleLogin(req: Request, res: Response): void {
  if (!env.googleClientId) { res.status(500).send("Google sign-in is not configured"); return; }
  const state = randomBytes(16).toString("base64url");
  const next = typeof req.query.next === "string" && req.query.next.startsWith("/") ? req.query.next : "/";
  res.cookie(STATE_COOKIE, sign(`${state}|${next}`), cookieOptions(600));
  const url = client().generateAuthUrl({ scope: ["openid", "email", "profile"], state, prompt: "select_account", access_type: "online" });
  res.redirect(url);
}

export async function finishGoogleLogin(req: Request, res: Response): Promise<void> {
  const cookies = parseCookies(req);
  const stateValue = unsign(cookies[STATE_COOKIE]);
  res.clearCookie(STATE_COOKIE, { path: "/" });
  const [expectedState, next = "/"] = (stateValue ?? "").split("|");
  const { code, state, error } = req.query as Record<string, string | undefined>;
  if (error) { res.redirect(`/?auth_error=${encodeURIComponent(error)}`); return; }
  if (!code || !state || !expectedState || state !== expectedState) { res.status(400).send("Sign-in state did not match. Please try again."); return; }
  const c = client();
  const { tokens } = await c.getToken(code);
  if (!tokens.id_token) { res.status(400).send("Google did not return an identity token"); return; }
  const ticket = await c.verifyIdToken({ idToken: tokens.id_token, audience: env.googleClientId });
  const p = ticket.getPayload();
  if (!p || !p.sub || !p.email || !p.email_verified) { res.status(400).send("Google account could not be verified"); return; }
  const settings = await getSettings();
  const staffDomain = (settings.staffDomain || "wildflowerschools.org").toLowerCase();
  // The hd claim is verified server-side from the signed ID token; never trusted from the client.
  const role = p.hd && p.hd.toLowerCase() === staffDomain ? "staff" : "teacher_leader";
  const db = getDb();
  const name = p.name ?? p.email;
  const [user] = await db.insert(users).values({ googleSub: p.sub, email: p.email.toLowerCase(), name, role, hostedDomain: p.hd ?? null, lastLoginAt: new Date() })
    .onConflictDoUpdate({ target: users.googleSub, set: { email: p.email.toLowerCase(), name, role, hostedDomain: p.hd ?? null, lastLoginAt: new Date() } }).returning();
  if (!user) { res.status(500).send("Could not create user"); return; }
  const id = randomBytes(32).toString("base64url");
  await db.insert(sessions).values({ id, userId: user.id, expiresAt: new Date(Date.now() + SESSION_DAYS * 86400_000) });
  res.cookie(COOKIE, sign(id), cookieOptions(SESSION_DAYS * 86400));
  res.redirect(next.startsWith("/") ? next : "/");
}

export async function logout(req: Request, res: Response): Promise<void> {
  const id = unsign(parseCookies(req)[COOKIE]);
  if (id) await getDb().delete(sessions).where(eq(sessions.id, id));
  res.clearCookie(COOKIE, { path: "/" });
  res.json({ ok: true });
}

export async function resolveUser(req: Request, _res: Response, next: NextFunction): Promise<void> {
  req.user = null;
  try {
    const id = unsign(parseCookies(req)[COOKIE]);
    if (id) {
      const rows = await getDb().select({ id: users.id, email: users.email, name: users.name, role: users.role, resourceLanguage: users.resourceLanguage }).from(sessions).innerJoin(users, eq(sessions.userId, users.id)).where(and(eq(sessions.id, id), gt(sessions.expiresAt, new Date()))).limit(1);
      const u = rows[0];
      if (u) req.user = { id: u.id, email: u.email, name: u.name, role: u.role === "staff" ? "staff" : "teacher_leader", resourceLanguage: isResourceLanguage(u.resourceLanguage) ? u.resourceLanguage : "all" };
    }
  } catch (e) { (req as { log?: { warn: (o: unknown, m: string) => void } }).log?.warn({ err: e }, "session lookup failed"); }
  next();
}
export function requireUser(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) { res.status(401).json({ error: "Sign in required" }); return; }
  next();
}
export function requireStaff(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) { res.status(401).json({ error: "Sign in required" }); return; }
  if (req.user.role !== "staff") { res.status(403).json({ error: "Staff only" }); return; }
  next();
}
export function actor(req: Request): string { return req.user ? `${req.user.name} <${req.user.email}>` : "anonymous"; }

export async function devLogin(req: Request, res: Response): Promise<void> {
  if (env.isProd || process.env.DEV_LOGIN_ENABLED !== "1") { res.status(404).send("Not found"); return; }
  const email = String(req.query.email ?? "dev@example.com").toLowerCase(); const role = req.query.role === "staff" ? "staff" : "teacher_leader";
  const db = getDb();
  const [user] = await db.insert(users).values({ googleSub: `dev:${email}`, email, name: String(req.query.name ?? email.split("@")[0]), role, lastLoginAt: new Date() }).onConflictDoUpdate({ target: users.googleSub, set: { role, lastLoginAt: new Date() } }).returning();
  const id = randomBytes(32).toString("base64url");
  await db.insert(sessions).values({ id, userId: user!.id, expiresAt: new Date(Date.now() + 86400_000) });
  res.cookie(COOKIE, sign(id), cookieOptions(86400));
  res.redirect(typeof req.query.next === "string" ? req.query.next : "/");
}
