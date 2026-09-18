import { Router } from "express";
import { beginGoogleLogin, devLogin, finishGoogleLogin, logout } from "../auth.js";
import { env } from "../env.js";
export const authRouter = Router();
authRouter.get("/google", beginGoogleLogin);
authRouter.get("/google/callback", (req, res, next) => finishGoogleLogin(req, res).catch(next));
authRouter.post("/logout", (req, res, next) => logout(req, res).catch(next));
// Development-only sign-in for local testing. Never active in production; requires DEV_LOGIN_ENABLED=1.
authRouter.get("/dev", (req, res, next) => devLogin(req, res).catch(next));
authRouter.get("/config", (_req, res) => res.json({ googleConfigured: Boolean(env.googleClientId && env.googleClientSecret) }));
