import { firstWords, isItemLanguage, type ItemLanguage, type LanguageInput } from "@wfw/shared";
import { respondJson } from "../lib/openai.js";
import { logger } from "../logger.js";
import { getSettings } from "../settings.js";

const SYSTEM = `You identify the language a Wildflower Schools resource is written in, for a library that is mostly English with some Spanish material.
Rules: judge the language of the writing itself, not the names of people or schools that appear in it — a roster of Spanish surnames inside an English form is English. A title or category saying "Español" or "Spanish" means it is Spanish. Titles, headings and lists of document names count as writing. Answer "unknown" only when there is genuinely too little text to tell, or it is neither English nor Spanish.
Return JSON {"language": "en" | "es" | "unknown"}.`;
const SCHEMA = { name: "language", schema: { type: "object", additionalProperties: false, required: ["language"], properties: { language: { type: "string", enum: ["en", "es", "unknown"] } } } };

/** How much of an item the model is shown. The opening is plenty to tell a language from. */
export const PROMPT_WORDS = 200;
/** One retry: the failures seen in practice are rare and transient, not repeatable. */
export const ATTEMPTS = 2;

/** What the model is shown: the labels, and the opening of the text. */
export function promptFor(input: LanguageInput): string {
  const labels = [...(input.categories ?? []), ...(input.seriesTitles ?? [])].filter(Boolean).join("; ");
  return [
    `Title: ${firstWords(input.title, 40)}`,
    input.description ? `Description: ${firstWords(input.description, 60)}` : "",
    labels ? `Categories: ${firstWords(labels, 40)}` : "",
    `Text:\n${firstWords(input.body, PROMPT_WORDS)}`,
  ].filter(Boolean).join("\n");
}

/**
 * Decide an item's language by asking the model, from the opening of its text.
 *
 * There is no offline guess behind this any more. A deterministic word-frequency pass was cheaper
 * but wrong in ways that mattered — it read an English staffing roster carrying Spanish surnames as
 * Spanish — and at roughly $0.00005 a call there is nothing to buy by keeping it.
 *
 * Returns null when no verdict could be reached: the model is paused by the kill switch, it is
 * unreachable, or it answered with something outside the three values. Callers must leave whatever
 * they already have alone in that case, rather than recording "unknown" over a good answer.
 *
 * A give-up always names the item it gave up on. Silence here is the worst outcome: a check that
 * fails quietly leaves an item carrying a stale verdict with nothing to trace it by, and the next
 * run fails on it identically and just as invisibly.
 */
export async function resolveLanguage(input: LanguageInput, log: (m: string) => void = () => {}): Promise<ItemLanguage | null> {
  if (`${input.title ?? ""}${input.body ?? ""}`.trim().length < 8) return "unknown"; // nothing to read
  const prompt = promptFor(input);
  const item = firstWords(input.title, 12) || "(untitled)";
  let reason = "no attempt was made";
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    try {
      const s = await getSettings();
      if (s.killSwitch) return null; // paused on purpose; not a failure, and not worth retrying
      const r = await respondJson<{ language: string }>({ model: s.assistModel, system: SYSTEM, user: prompt, schema: SCHEMA, effort: "low", maxOutput: 50, timeoutMs: 20_000 });
      if (isItemLanguage(r.data.language)) return r.data.language;
      reason = `answered ${JSON.stringify(r.data.language)}`;
    } catch (e) {
      reason = (e as Error).message;
    }
  }
  logger.warn({ err: reason, item, attempts: ATTEMPTS }, "language check unavailable");
  log(`language check failed for "${item}" after ${ATTEMPTS} attempts, leaving it unchanged: ${reason}`);
  return null;
}
