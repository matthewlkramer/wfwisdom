// Deterministic, dependency-free helpers shared by the API, the indexer and the backfill script.

export type ItemLanguage = "en" | "es" | "unknown";
/** What a reader picked in the language filter. "all" also shows items whose language could not be detected. */
export type ResourceLanguage = "all" | "en" | "es";

export const RESOURCE_LANGUAGES: { key: ResourceLanguage; label: string }[] = [
  { key: "all", label: "All resources" },
  { key: "en", label: "English" },
  { key: "es", label: "Spanish" },
];
export const isResourceLanguage = (v: unknown): v is ResourceLanguage => v === "all" || v === "en" || v === "es";
export const isItemLanguage = (v: unknown): v is ItemLanguage => v === "en" || v === "es" || v === "unknown";

/** Connected labels its Spanish material in the title, the series or the category; that beats counting words. */
const SPANISH_LABEL = /(^|[^a-z])(espa(ñ|n)ol|spanish|en espa(ñ|n)ol|spanish[ -]language|versi(ó|o)n en espa(ñ|n)ol)([^a-z]|$)/i;
const ENGLISH_LABEL = /(^|[^a-z])(english|english[ -]language|en ingl(é|e)s)([^a-z]|$)/i;

// Short, unambiguous function words. Words that mean something in both languages (no, a, son, van, ...) are left out.
const ES_WORDS = ["que", "los", "las", "una", "unos", "unas", "del", "por", "para", "como", "pero", "más", "mas", "este", "esta", "estos", "estas", "con", "sus", "les", "nos", "muy", "también", "tambien", "cuando", "porque", "escuela", "escuelas", "maestro", "maestra", "maestros", "niños", "ninos", "familia", "familias", "aprendizaje", "ustedes", "nuestro", "nuestra", "puede", "hacer", "sobre", "desde", "entre", "cada", "todos", "todas", "ser", "está", "esta", "están", "estan", "hay"];
const EN_WORDS = ["the", "and", "of", "to", "for", "with", "you", "your", "that", "this", "these", "those", "from", "have", "has", "will", "are", "was", "were", "school", "schools", "teacher", "teachers", "children", "family", "families", "learning", "about", "what", "when", "they", "their", "there", "would", "should", "which", "into", "than", "them"];
const ES_SET = new Set(ES_WORDS);
const EN_SET = new Set(EN_WORDS);
/** Characters that only appear in Spanish text here; each occurrence is worth a few stop words. */
const ES_CHARS = /[ñáéíóúü¿¡]/i;
const ES_CHARS_ALL = /[ñáéíóúü¿¡]/gi;

export interface LanguageInput { title?: string | null; body?: string | null; categories?: string[] | null; seriesTitles?: string[] | null; description?: string | null }

function tokens(s: string): string[] {
  return s.toLowerCase().normalize("NFC").split(/[^a-záéíóúñü]+/i).filter((t) => t.length > 1);
}

/**
 * Decide whether an item is English or Spanish from its title, labels and body.
 * Deterministic and offline: an explicit "Español"/"Spanish" label wins, otherwise stop words decide.
 * Returns "unknown" when there is too little text or the two languages are too close to call.
 */
export function detectLanguage(input: LanguageInput): ItemLanguage {
  const labels = [input.title ?? "", ...(input.categories ?? []), ...(input.seriesTitles ?? [])].join(" · ");
  if (SPANISH_LABEL.test(labels)) return "es";
  const text = `${input.title ?? ""}\n${input.description ?? ""}\n${(input.body ?? "").slice(0, 20_000)}`;
  const words = tokens(text);
  if (words.length < 12) {
    // Too little text to count: fall back to the labels alone.
    if (ES_CHARS.test(input.title ?? "")) return "es";
    if (ENGLISH_LABEL.test(labels)) return "en";
    return "unknown";
  }
  let es = 0, en = 0;
  for (const w of words) { if (ES_SET.has(w)) es++; else if (EN_SET.has(w)) en++; }
  // Accents corroborate Spanish; they never establish it on their own. An English roster or release
  // form carrying Spanish surnames (Peña, Núñez) is full of accents and has no Spanish function
  // words at all, and weighting those accents would file it as Spanish outright.
  if (es > 0) es += (text.match(ES_CHARS_ALL)?.length ?? 0) * 3;
  const total = es + en;
  if (total < 4) return "unknown";
  if (es > en * 1.5) return "es";
  if (en > es * 1.5) return "en";
  return "unknown";
}
