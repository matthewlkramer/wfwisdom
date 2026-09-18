import { eq, getDb, users } from "@wfw/db";
import { isResourceLanguage, type ResourceLanguage } from "@wfw/shared";

/** The language filter the reader last chose, stored on their user record so it follows them across devices. */
export async function readerLanguage(userId: string): Promise<ResourceLanguage> {
  const [u] = await getDb().select({ lang: users.resourceLanguage }).from(users).where(eq(users.id, userId));
  return isResourceLanguage(u?.lang) ? (u!.lang as ResourceLanguage) : "all";
}
export async function setReaderLanguage(userId: string, lang: ResourceLanguage): Promise<void> {
  await getDb().update(users).set({ resourceLanguage: lang }).where(eq(users.id, userId));
}
