// Language types shared by the API, the indexer and the backfill script. Dependency-free.

export type ItemLanguage = "en" | "es" | "unknown";
/** What a reader picked in the language filter. "all" also shows items whose language is unknown. */
export type ResourceLanguage = "all" | "en" | "es";

export const RESOURCE_LANGUAGES: { key: ResourceLanguage; label: string }[] = [
  { key: "all", label: "All resources" },
  { key: "en", label: "English" },
  { key: "es", label: "Spanish" },
];
export const isResourceLanguage = (v: unknown): v is ResourceLanguage => v === "all" || v === "en" || v === "es";
export const isItemLanguage = (v: unknown): v is ItemLanguage => v === "en" || v === "es" || v === "unknown";

export interface LanguageInput { title?: string | null; body?: string | null; categories?: string[] | null; seriesTitles?: string[] | null; description?: string | null }

/**
 * The opening `n` words of a piece of text, which is all the language check needs to see.
 * Whitespace-delimited, so it is stable regardless of punctuation or line breaks.
 */
export function firstWords(text: string | null | undefined, n: number): string {
  if (!text) return "";
  const words = text.trim().split(/\s+/);
  return words.length <= n ? words.join(" ") : words.slice(0, n).join(" ");
}
