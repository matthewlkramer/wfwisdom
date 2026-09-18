import express, { type ErrorRequestHandler, type Express, type Router } from "express";
import { ZodError } from "zod";
import type { SessionUser } from "@wfw/shared";

/** Mounts one router with a fixed signed-in user, so route tests exercise the real guards and schemas. */
export function testApp(path: string, router: Router, user: SessionUser | null): Express {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.user = user; next(); });
  app.use(path, router);
  const onError: ErrorRequestHandler = (err, _req, res, _next) => {
    if (err instanceof ZodError) { res.status(400).json({ error: "Invalid request", issues: err.issues }); return; }
    res.status(500).json({ error: err instanceof Error ? err.message : "Unexpected error" });
  };
  app.use(onError);
  return app;
}
export const teacher: SessionUser = { id: "11111111-1111-4111-8111-111111111111", email: "tl@example.org", name: "Tara Leader", role: "teacher_leader", resourceLanguage: "all" };
export const staffUser: SessionUser = { id: "22222222-2222-4222-8222-222222222222", email: "staff@wildflowerschools.org", name: "Sam Staff", role: "staff", resourceLanguage: "all" };
