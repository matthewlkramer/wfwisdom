import { eq, getDb, users } from "@wfw/db";
import { isResourceLanguage, isResourceRegion, type ResourceLanguage, type ResourceRegion } from "@wfw/shared";

/** The language filter the reader last chose, stored on their user record so it follows them across devices. */
export async function readerLanguage(userId: string): Promise<ResourceLanguage> {
  const [u] = await getDb().select({ lang: users.resourceLanguage }).from(users).where(eq(users.id, userId));
  return isResourceLanguage(u?.lang) ? (u!.lang as ResourceLanguage) : "all";
}
export async function setReaderLanguage(userId: string, lang: ResourceLanguage): Promise<void> {
  await getDb().update(users).set({ resourceLanguage: lang }).where(eq(users.id, userId));
}

/** The region filter the reader last chose, stored on their user record so it follows them across devices. */
export async function readerRegion(userId: string): Promise<ResourceRegion> {
  const [u] = await getDb().select({ region: users.resourceRegion }).from(users).where(eq(users.id, userId));
  return isResourceRegion(u?.region) ? u!.region : "all";
}
export async function setReaderRegion(userId: string, region: ResourceRegion): Promise<void> {
  await getDb().update(users).set({ resourceRegion: region }).where(eq(users.id, userId));
}
