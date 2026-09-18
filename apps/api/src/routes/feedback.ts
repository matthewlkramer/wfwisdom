import { Router } from "express";
import { z } from "zod";
import { and, appFeedback, auditLog, count, desc, eq, getDb, inArray, or, sql, users } from "@wfw/db";
import { actor, requireStaff, requireUser } from "../auth.js";

const categorySchema = z.enum(["bug", "question", "suggestion", "other"]);
const statusSchema = z.enum(["open", "in_progress", "resolved", "dismissed"]);
const createSchema = z.object({
  category: categorySchema,
  message: z.string().trim().min(1).max(10_000),
  pageUrl: z.string().trim().url().max(2_000),
  pagePath: z.string().trim().max(500).nullable().optional(),
  pageTitle: z.string().trim().max(500).nullable().optional(),
  screenshotDataUrl: z.string().max(1_000_000).regex(/^data:image\/jpeg;base64,/).nullable().optional(),
  context: z.record(z.unknown()).refine((v) => Object.keys(v).length <= 50 && JSON.stringify(v).length <= 20_000, "Context must contain at most 50 keys and 20KB").default({}),
});
const csv = <T extends z.ZodTypeAny>(item: T) => z.string().max(200).transform((v) => (v ? v.split(",").filter(Boolean) : [])).pipe(z.array(item)).optional();
const listSchema = z.object({
  statuses: csv(statusSchema), categories: csv(categorySchema),
  search: z.string().trim().max(200).optional(),
  page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(100).default(25),
});
const updateSchema = z.object({ status: statusSchema.optional(), adminNotes: z.string().trim().max(10_000).nullable().optional() })
  .refine((v) => v.status !== undefined || v.adminNotes !== undefined, "Status or admin notes is required");

const escapeLike = (v: string) => v.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_");
const withReporter = { feedback: appFeedback, reporterName: users.name, reporterEmail: users.email };
const flatten = (r: { feedback: typeof appFeedback.$inferSelect; reporterName: string; reporterEmail: string }) => ({ ...r.feedback, reporterName: r.reporterName, reporterEmail: r.reporterEmail });

/** Any signed-in user can send feedback. */
export const feedbackRouter = Router();
feedbackRouter.use(requireUser);
feedbackRouter.post("/", async (req, res) => {
  const input = createSchema.parse(req.body);
  const [row] = await getDb().insert(appFeedback).values({ ...input, createdByUserId: req.user!.id }).returning({ id: appFeedback.id });
  res.status(201).json({ id: row!.id });
});

/** Staff triage the queue. */
export const adminFeedbackRouter = Router();
adminFeedbackRouter.use(requireStaff);
adminFeedbackRouter.get("/", async (req, res) => {
  const q = listSchema.parse(req.query);
  const terms = q.search ? `%${escapeLike(q.search)}%` : null;
  const where = and(
    q.statuses?.length ? inArray(appFeedback.status, q.statuses) : undefined,
    q.categories?.length ? inArray(appFeedback.category, q.categories) : undefined,
    terms ? or(sql`${appFeedback.message} ILIKE ${terms} ESCAPE '\\'`, sql`${appFeedback.pageTitle} ILIKE ${terms} ESCAPE '\\'`, sql`${appFeedback.adminNotes} ILIKE ${terms} ESCAPE '\\'`, sql`${users.name} ILIKE ${terms} ESCAPE '\\'`, sql`${users.email} ILIKE ${terms} ESCAPE '\\'`) : undefined,
  );
  const db = getDb();
  const [rows, totals] = await Promise.all([
    db.select(withReporter).from(appFeedback).innerJoin(users, eq(users.id, appFeedback.createdByUserId)).where(where).orderBy(desc(appFeedback.createdAt)).limit(q.limit).offset((q.page - 1) * q.limit),
    db.select({ total: count() }).from(appFeedback).innerJoin(users, eq(users.id, appFeedback.createdByUserId)).where(where),
  ]);
  const total = Number(totals[0]?.total ?? 0);
  res.json({ feedback: rows.map(flatten), pagination: { page: q.page, limit: q.limit, total, pageCount: Math.max(1, Math.ceil(total / q.limit)) } });
});
adminFeedbackRouter.patch("/:id", async (req, res) => {
  const input = updateSchema.parse(req.body);
  const id = String(req.params.id);
  const closing = input.status === "resolved" || input.status === "dismissed";
  const values = {
    ...(input.adminNotes !== undefined ? { adminNotes: input.adminNotes } : {}),
    ...(input.status ? { status: input.status, resolvedByUserId: closing ? req.user!.id : null, resolvedAt: closing ? new Date() : null } : {}),
    updatedAt: new Date(),
  };
  const db = getDb();
  const [updated] = await db.update(appFeedback).set(values).where(eq(appFeedback.id, id)).returning({ id: appFeedback.id });
  if (!updated) { res.status(404).json({ error: "Feedback not found" }); return; }
  await db.insert(auditLog).values({ actor: actor(req), action: "feedback.update", target: id, detail: input as Record<string, unknown> }).catch(() => undefined);
  const [row] = await db.select(withReporter).from(appFeedback).innerJoin(users, eq(users.id, appFeedback.createdByUserId)).where(eq(appFeedback.id, id));
  res.json({ feedback: row ? flatten(row) : null });
});
