import { getDb, settings as settingsTable, auditLog } from "@wfw/db";
import { SETTING_DEFAULTS, type Settings } from "@wfw/shared";

let cache: { at: number; value: Settings } | null = null;
const TTL = 5_000;

export async function getSettings(force = false): Promise<Settings> {
  if (!force && cache && Date.now() - cache.at < TTL) return cache.value;
  const rows = await getDb().select().from(settingsTable);
  const merged: Record<string, unknown> = { ...(SETTING_DEFAULTS as unknown as Record<string, unknown>) };
  for (const r of rows) if (r.key in merged) merged[r.key] = r.value;
  cache = { at: Date.now(), value: merged as unknown as Settings };
  return cache.value;
}

export async function setSetting<K extends keyof Settings>(key: K, value: Settings[K], actor: string): Promise<void> {
  const db = getDb();
  await db.insert(settingsTable).values({ key, value: value as unknown as object, updatedBy: actor }).onConflictDoUpdate({ target: settingsTable.key, set: { value: value as unknown as object, updatedBy: actor, updatedAt: new Date() } });
  await db.insert(auditLog).values({ actor, action: "setting.update", target: key, detail: { value } as Record<string, unknown> });
  cache = null;
}

export function validateSetting(key: string, value: unknown): string | null {
  const def = (SETTING_DEFAULTS as unknown as Record<string, unknown>)[key];
  if (def === undefined) return `Unknown setting ${key}`;
  if (typeof def === "boolean" && typeof value !== "boolean") return `${key} must be true or false`;
  if (typeof def === "number" && (typeof value !== "number" || !Number.isFinite(value) || value < 0)) return `${key} must be a non-negative number`;
  if (typeof def === "string" && typeof value !== "string") return `${key} must be text`;
  if (Array.isArray(def) && !Array.isArray(value)) return `${key} must be a list`;
  if (key === "scoreWeights") {
    const v = value as Record<string, number>;
    const sum = (v.curation ?? 0) + (v.usage ?? 0) + (v.freshness ?? 0);
    if (Math.abs(sum - 1) > 0.001) return "scoreWeights must add up to 1";
  }
  return null;
}
