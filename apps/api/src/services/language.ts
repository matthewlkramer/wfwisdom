import { detectLanguage, isItemLanguage, type ItemLanguage, type LanguageInput } from "@wfw/shared";
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
 * Decide an item's language, deterministically where possible.
 *
 * The offline detector settles the great majority for free. It returns "unknown" for the items it
 * has too little signal on — a series whose text is just a list of its posts' titles, a form that is
 * mostly field labels and names — and those are the ones worth a model call, so only that tail costs
 * anything. Any failure (kill switch, missing key, timeout, a nonsense answer) leaves it "unknown"
 * rather than guessing; the caller carries on either way.
 */
export async function resolveLanguage(input: LanguageInput, log: (m: string) => void = () => {}): Promise<ItemLanguage> {
  const offline = detectLanguage(input);
  if (offline !== "unknown") return offline;
  const text = `${input.title ?? ""}${input.body ?? ""}`.trim();
  if (text.length < 8) return "unknown"; // nothing to send; the model would only be guessing too
  try {
    const s = await getSettings();
    if (s.killSwitch) return "unknown";
    const r = await respondJson<{ language: string }>({ model: s.assistModel, system: SYSTEM, user: promptFor(input), schema: SCHEMA, effort: "low", maxOutput: 50, timeoutMs: 20_000 });
    if (!isItemLanguage(r.data.language)) { log(`language check returned ${JSON.stringify(r.data.language)}, leaving unknown`); return "unknown"; }
    return r.data.language;
  } catch (e) {
    const msg = (e as Error).message;
    logger.warn({ err: msg }, "language check unavailable");
    log(`language check failed: ${msg}`);
    return "unknown";
  }
}
