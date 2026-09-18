import { and, chatTurns, draftGenerations, eq, getDb, gt, sql, submissions } from "@wfw/db";
import { getSettings } from "../settings.js";

function startOfDayUtc(): Date { const d = new Date(); d.setUTCHours(0, 0, 0, 0); return d; }
export class LimitError extends Error { constructor(msg: string, public code: "kill_switch" | "account_limit" | "global_limit") { super(msg); } }

export async function checkReviewAllowed(userId: string): Promise<void> {
  const s = await getSettings();
  if (s.killSwitch) throw new LimitError("AI reviews are paused right now. Please try again later.", "kill_switch");
  const db = getDb(); const since = startOfDayUtc();
  const [mine] = await db.select({ n: sql<number>`count(*)::int` }).from(submissions).where(and(eq(submissions.userId, userId), gt(submissions.createdAt, since), sql`${submissions.source} <> 'test'`));
  if ((mine?.n ?? 0) >= s.reviewsPerAccountPerDay) throw new LimitError(`You have used today's ${s.reviewsPerAccountPerDay} reviews. The limit resets at midnight UTC.`, "account_limit");
  const [all] = await db.select({ n: sql<number>`count(*)::int` }).from(submissions).where(gt(submissions.createdAt, since));
  if ((all?.n ?? 0) >= s.reviewsPerDayGlobal) throw new LimitError("Today's review capacity for the whole site has been reached. Please try again tomorrow.", "global_limit");
}
export async function checkChatAllowed(userId: string): Promise<void> {
  const s = await getSettings();
  if (s.killSwitch) throw new LimitError("AI features are paused right now.", "kill_switch");
  const db = getDb(); const since = startOfDayUtc();
  const [mine] = await db.select({ n: sql<number>`count(*)::int` }).from(chatTurns).where(and(eq(chatTurns.userId, userId), gt(chatTurns.createdAt, since)));
  if ((mine?.n ?? 0) >= s.chatTurnsPerAccountPerDay) throw new LimitError("You have reached today's chat limit.", "account_limit");
  const [all] = await db.select({ n: sql<number>`count(*)::int` }).from(chatTurns).where(gt(chatTurns.createdAt, since));
  if ((all?.n ?? 0) >= s.chatTurnsPerDayGlobal) throw new LimitError("Today's chat capacity has been reached.", "global_limit");
}
export async function checkDraftAllowed(userId: string): Promise<void> {
  const s = await getSettings();
  if (s.killSwitch) throw new LimitError("AI features are paused right now.", "kill_switch");
  const db = getDb(); const since = startOfDayUtc();
  const [mine] = await db.select({ n: sql<number>`count(*)::int` }).from(draftGenerations).where(and(eq(draftGenerations.userId, userId), gt(draftGenerations.createdAt, since)));
  if ((mine?.n ?? 0) >= s.draftsPerAccountPerDay) throw new LimitError(`You have used today's ${s.draftsPerAccountPerDay} drafts. The limit resets at midnight UTC.`, "account_limit");
  const [all] = await db.select({ n: sql<number>`count(*)::int` }).from(draftGenerations).where(gt(draftGenerations.createdAt, since));
  if ((all?.n ?? 0) >= s.draftsPerDayGlobal) throw new LimitError("Today's drafting capacity for the whole site has been reached.", "global_limit");
}
export async function reviewsLeftToday(userId: string): Promise<{ reviews: number; drafts: number }> {
  const s = await getSettings(); const db = getDb(); const since = startOfDayUtc();
  const [r] = await db.select({ n: sql<number>`count(*)::int` }).from(submissions).where(and(eq(submissions.userId, userId), gt(submissions.createdAt, since), sql`${submissions.source} <> 'test'`));
  const [d] = await db.select({ n: sql<number>`count(*)::int` }).from(draftGenerations).where(and(eq(draftGenerations.userId, userId), gt(draftGenerations.createdAt, since)));
  return { reviews: Math.max(0, s.reviewsPerAccountPerDay - (r?.n ?? 0)), drafts: Math.max(0, s.draftsPerAccountPerDay - (d?.n ?? 0)) };
}
export async function usageToday(): Promise<{ reviews: number; chatTurns: number; reviewCost: number; chatCost: number }> {
  const db = getDb(); const since = startOfDayUtc();
  const [r] = await db.select({ n: sql<number>`count(*)::int`, c: sql<number>`coalesce(sum(cost_usd),0)::float` }).from(submissions).where(gt(submissions.createdAt, since));
  const [c] = await db.select({ n: sql<number>`count(*)::int`, c: sql<number>`coalesce(sum(cost_usd),0)::float` }).from(chatTurns).where(gt(chatTurns.createdAt, since));
  return { reviews: r?.n ?? 0, chatTurns: c?.n ?? 0, reviewCost: r?.c ?? 0, chatCost: c?.c ?? 0 };
}
