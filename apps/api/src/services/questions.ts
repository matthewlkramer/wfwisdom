import { and, asc, chatTurnNotes, chatTurns, count, desc, eq, getDb, inArray, sql, users } from "@wfw/db";
import type { Citation, MyQuestion, QuestionNote, ShareAttribution, SharedExample, StaffQuestion } from "@wfw/shared";

export type ReviewedFilter = "all" | "reviewed" | "unreviewed";
export type ShareFilter = "all" | "pending" | "approved" | "rejected";

const iso = (d: Date | null) => (d ? d.toISOString() : null);
const cites = (c: unknown): Citation[] => (Array.isArray(c) ? (c as Citation[]) : []);

type TurnRow = typeof chatTurns.$inferSelect;
const toMine = (t: TurnRow): MyQuestion => ({
  id: t.id, question: t.question, answer: t.answer, citations: cites(t.citations), covered: t.covered, createdAt: iso(t.createdAt)!,
  staffReviewRequested: t.staffReviewRequested,
  share: { requested: t.shareRequested, attribution: t.shareAttribution as ShareAttribution, status: t.shareStatus as MyQuestion["share"]["status"] },
});

/** The signed-in user's own questions, newest first, for the list at the bottom of Ask. */
export async function listMyQuestions(userId: string, limit = 25): Promise<MyQuestion[]> {
  const rows = await getDb().select().from(chatTurns).where(eq(chatTurns.userId, userId)).orderBy(desc(chatTurns.createdAt)).limit(limit);
  return rows.map(toMine);
}

/** Approved shared questions, shown publicly on Ask. A name is attached only when the asker chose to. */
export async function listSharedExamples(limit = 6): Promise<SharedExample[]> {
  const rows = await getDb().select({ turn: chatTurns, askerName: users.name }).from(chatTurns).innerJoin(users, eq(users.id, chatTurns.userId))
    .where(eq(chatTurns.shareStatus, "approved")).orderBy(desc(chatTurns.createdAt)).limit(limit);
  return rows.map((r) => ({
    id: r.turn.id, question: r.turn.question, answer: r.turn.answer, citations: cites(r.turn.citations),
    askerName: r.turn.shareAttribution === "name" ? r.askerName : null, createdAt: iso(r.turn.createdAt)!,
  }));
}

async function notesFor(turnIds: string[]): Promise<Map<string, QuestionNote[]>> {
  const out = new Map<string, QuestionNote[]>();
  if (!turnIds.length) return out;
  const rows = await getDb().select().from(chatTurnNotes).where(inArray(chatTurnNotes.turnId, turnIds)).orderBy(asc(chatTurnNotes.createdAt));
  for (const r of rows) {
    const list = out.get(r.turnId) ?? [];
    list.push({ id: r.id, body: r.body, authorName: r.authorName, createdAt: iso(r.createdAt)! });
    out.set(r.turnId, list);
  }
  return out;
}

/**
 * The staff queue: questions whose asker asked for a staff review, plus any question offered for
 * sharing, newest first. Reviewed/unreviewed and the share decision can each be narrowed.
 */
export async function listStaffQuestions(opts: { reviewed: ReviewedFilter; share: ShareFilter; page: number; limit: number }): Promise<{ questions: StaffQuestion[]; total: number }> {
  const db = getDb();
  const where = and(
    opts.share === "all" ? sql`(${chatTurns.staffReviewRequested} = true or ${chatTurns.shareStatus} <> 'none')` : eq(chatTurns.shareStatus, opts.share),
    opts.reviewed === "reviewed" ? sql`${chatTurns.reviewedAt} is not null` : opts.reviewed === "unreviewed" ? sql`${chatTurns.reviewedAt} is null` : undefined,
  );
  const [rows, totals] = await Promise.all([
    db.select({ turn: chatTurns, askerName: users.name, askerEmail: users.email }).from(chatTurns).innerJoin(users, eq(users.id, chatTurns.userId))
      .where(where).orderBy(desc(chatTurns.createdAt)).limit(opts.limit).offset((opts.page - 1) * opts.limit),
    db.select({ total: count() }).from(chatTurns).innerJoin(users, eq(users.id, chatTurns.userId)).where(where),
  ]);
  const notes = await notesFor(rows.map((r) => r.turn.id));
  return {
    total: Number(totals[0]?.total ?? 0),
    questions: rows.map((r) => ({
      ...toMine(r.turn), askerName: r.askerName, askerEmail: r.askerEmail,
      reviewedBy: r.turn.reviewedBy, reviewedAt: iso(r.turn.reviewedAt),
      shareDecidedBy: r.turn.shareDecidedBy, shareDecidedAt: iso(r.turn.shareDecidedAt),
      notes: notes.get(r.turn.id) ?? [],
    })),
  };
}

/** One question with its notes, returned after every staff action so the page shows current state. */
export async function getStaffQuestion(id: string): Promise<StaffQuestion | null> {
  const [r] = await getDb().select({ turn: chatTurns, askerName: users.name, askerEmail: users.email }).from(chatTurns).innerJoin(users, eq(users.id, chatTurns.userId)).where(eq(chatTurns.id, id));
  if (!r) return null;
  const notes = await notesFor([id]);
  return {
    ...toMine(r.turn), askerName: r.askerName, askerEmail: r.askerEmail,
    reviewedBy: r.turn.reviewedBy, reviewedAt: iso(r.turn.reviewedAt),
    shareDecidedBy: r.turn.shareDecidedBy, shareDecidedAt: iso(r.turn.shareDecidedAt),
    notes: notes.get(id) ?? [],
  };
}

export async function addNote(turnId: string, author: { id: string; name: string }, body: string): Promise<boolean> {
  const [turn] = await getDb().select({ id: chatTurns.id }).from(chatTurns).where(eq(chatTurns.id, turnId));
  if (!turn) return false;
  await getDb().insert(chatTurnNotes).values({ turnId, authorUserId: author.id, authorName: author.name, body });
  return true;
}

/** Mark a question reviewed (or put it back in the queue), and approve or reject a sharing request. */
export async function updateQuestion(turnId: string, actorName: string, changes: { reviewed?: boolean; shareStatus?: "pending" | "approved" | "rejected" }): Promise<boolean> {
  const now = new Date();
  const values = {
    ...(changes.reviewed !== undefined ? { reviewedBy: changes.reviewed ? actorName : null, reviewedAt: changes.reviewed ? now : null } : {}),
    ...(changes.shareStatus ? { shareStatus: changes.shareStatus, shareDecidedBy: actorName, shareDecidedAt: now } : {}),
  };
  if (!Object.keys(values).length) return false;
  // A question that was never offered for sharing cannot be approved into the public examples.
  const where = changes.shareStatus ? and(eq(chatTurns.id, turnId), sql`${chatTurns.shareStatus} <> 'none'`) : eq(chatTurns.id, turnId);
  const [row] = await getDb().update(chatTurns).set(values).where(where).returning({ id: chatTurns.id });
  return !!row;
}
