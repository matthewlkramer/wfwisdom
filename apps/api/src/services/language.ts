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
 */
export async function resolveLanguage(input: LanguageInput, log: (m: string) => void = () => {}): Promise<ItemLanguage | null> {
  const prompt = promptFor(input);
  if (`${input.title ?? ""}${input.body ?? ""}`.trim().length < 8) return "unknown"; // nothing to read
  try {
    const s = await getSettings();
    if (s.killSwitch) return null;
    const r = await respondJson<{ language: string }>({ model: s.assistModel, system: SYSTEM, user: prompt, schema: SCHEMA, effort: "low", maxOutput: 50, timeoutMs: 20_000 });
    if (!isItemLanguage(r.data.language)) { log(`language check returned ${JSON.stringify(r.data.language)}, leaving it unchanged`); return null; }
    return r.data.language;
  } catch (e) {
    const msg = (e as Error).message;
    logger.warn({ err: msg }, "language check unavailable");
    log(`language check failed, leaving it unchanged: ${msg}`);
    return null;
  }
}
