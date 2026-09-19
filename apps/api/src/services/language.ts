import { detectLanguageDetailed, isItemLanguage, type ItemLanguage, type LanguageInput } from "@wfw/shared";
import { respondJson } from "../lib/openai.js";
import { logger } from "../logger.js";
import { getSettings } from "../settings.js";

const SYSTEM = `You identify the language a Wildflower Schools resource is written in, for a library that is mostly English with some Spanish material.
Rules: judge the language of the writing itself, not the names of people or schools that appear in it — a roster of Spanish surnames inside an English form is English. Titles, headings and lists of document names count as writing. Answer "unknown" only when there is genuinely too little text to tell, or it is neither English nor Spanish.
Return JSON {"language": "en" | "es" | "unknown"}.`;
const SCHEMA = { name: "language", schema: { type: "object", additionalProperties: false, required: ["language"], properties: { language: { type: "string", enum: ["en", "es", "unknown"] } } } };

/** What the model is shown: enough to judge, capped so the call stays cheap. */
export function promptFor(input: LanguageInput): string {
  const labels = [...(input.categories ?? []), ...(input.seriesTitles ?? [])].filter(Boolean).join("; ");
  return [
    `Title: ${(input.title ?? "").slice(0, 300)}`,
    input.description ? `Description: ${input.description.slice(0, 500)}` : "",
    labels ? `Categories: ${labels.slice(0, 300)}` : "",
    `Text:\n${(input.body ?? "").slice(0, 1500)}`,
  ].filter(Boolean).join("\n");
}

/**
 * Decide an item's language, using the model for anything the offline detector is not certain of.
 *
 * The offline pass is free, so it still runs first — but only two things let it stand on its own: an
 * explicit "Español"/"Spanish" label, which a person wrote deliberately, and a decisive stop-word
 * margin over a decent amount of text. Everything else goes to the model, including verdicts the
 * detector reached on thin evidence, because those are exactly the ones it gets wrong. At roughly
 * $0.00005 a call that tail is worth paying for.
 *
 * The model is never allowed to make things worse: if it is paused, unreachable, slow, or answers
 * with something outside the three values, the offline verdict stands.
 */
export async function resolveLanguage(input: LanguageInput, log: (m: string) => void = () => {}): Promise<ItemLanguage> {
  const offline = detectLanguageDetailed(input);
  if (offline.confidence === "high") return offline.language;
  const text = `${input.title ?? ""}${input.body ?? ""}`.trim();
  if (text.length < 8) return offline.language; // nothing to send; the model would only be guessing too
  try {
    const s = await getSettings();
    if (s.killSwitch) return offline.language;
    const r = await respondJson<{ language: string }>({ model: s.assistModel, system: SYSTEM, user: promptFor(input), schema: SCHEMA, effort: "low", maxOutput: 50, timeoutMs: 20_000 });
    if (!isItemLanguage(r.data.language)) { log(`language check returned ${JSON.stringify(r.data.language)}, keeping ${offline.language}`); return offline.language; }
    return r.data.language;
  } catch (e) {
    const msg = (e as Error).message;
    logger.warn({ err: msg }, "language check unavailable");
    log(`language check failed, keeping ${offline.language}: ${msg}`);
    return offline.language;
  }
}
