import { eq, getDb, users } from "@wfw/db";
import { isResourceLanguage, parseRegionFilter, type ResourceLanguage } from "@wfw/shared";

/** The language filter the reader last chose, stored on their user record so it follows them across devices. */
export async function readerLanguage(userId: string): Promise<ResourceLanguage> {
  const [u] = await getDb().select({ lang: users.resourceLanguage }).from(users).where(eq(users.id, userId));
  return isResourceLanguage(u?.lang) ? (u!.lang as ResourceLanguage) : "all";
}
export async function setReaderLanguage(userId: string, lang: ResourceLanguage): Promise<void> {
  await getDb().update(users).set({ resourceLanguage: lang }).where(eq(users.id, userId));
}

/** The region options the reader last ticked, stored on their user record so they follow them across devices. */
export async function readerRegions(userId: string): Promise<string[]> {
  const [u] = await getDb().select({ regions: users.resourceRegions }).from(users).where(eq(users.id, userId));
  return parseRegionFilter(u?.regions ?? []);
}
export async function setReaderRegions(userId: string, regions: string[]): Promise<void> {
  await getDb().update(users).set({ resourceRegions: regions }).where(eq(users.id, userId));
}
