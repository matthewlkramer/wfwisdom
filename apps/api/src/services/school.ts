import { desc, eq, getDb, userMaterials } from "@wfw/db";

/** What the writer has told us about their school, sized for a prompt. */
export async function schoolContext(userId: string, maxChars = 14_000): Promise<{ count: number; titles: string[]; text: string }> {
  const rows = await getDb().select({ title: userMaterials.title, kind: userMaterials.kind, text: userMaterials.text }).from(userMaterials).where(eq(userMaterials.userId, userId)).orderBy(desc(userMaterials.createdAt)).limit(12);
  const usable = rows.filter((r) => r.text.trim().length > 0);
  if (!usable.length) return { count: 0, titles: [], text: "" };
  const per = Math.max(1500, Math.floor(maxChars / usable.length));
  const text = usable.map((r) => `--- ${r.title} (${r.kind})\n${r.text.slice(0, per)}`).join("\n\n");
  return { count: usable.length, titles: usable.map((r) => r.title), text };
}
