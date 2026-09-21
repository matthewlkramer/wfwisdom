// Region types shared by the API, the indexer and the web app. Dependency-free.

/**
 * The regions Wildflower material is written for.
 *
 * These are not invented here: Connected already tags a post with the region it is for, in its
 * "Audience" taxonomy, and the library's own titles agree with it — every `[MN]`, `[MA]`, `[CA]`,
 * `[NJ]` and `[PA]` title also carries the matching audience. So `audience` below is the name to
 * match on the way in, and no model has to guess at it.
 */
export const REGIONS: { key: string; label: string; audience: string }[] = [
  { key: "co", label: "Colorado", audience: "Colorado" },
  { key: "dc", label: "Washington DC", audience: "Washington DC" },
  { key: "ma", label: "Massachusetts", audience: "Massachusetts" },
  { key: "mn", label: "Minnesota", audience: "Minnesota" },
  { key: "nj", label: "New Jersey", audience: "New Jersey" },
  { key: "nca", label: "Northern California", audience: "Northern California" },
  { key: "ny", label: "New York", audience: "New York" },
  { key: "pa", label: "Pennsylvania", audience: "Pennsylvania" },
  { key: "pr", label: "Puerto Rico", audience: "Puerto Rico" },
];

/** The filter option for material that is not written for any one region. */
export const GENERAL_REGION = "general";

/**
 * What a reader can tick in the region filter: the material that belongs to nowhere in particular,
 * then each region. Ticking nothing means no narrowing at all.
 */
export const REGION_FILTER_OPTIONS: { key: string; label: string }[] = [
  { key: GENERAL_REGION, label: "Not region-specific" },
  ...REGIONS.map((r) => ({ key: r.key, label: r.label })),
];

export const isRegionFilterKey = (v: unknown): v is string =>
  v === GENERAL_REGION || (typeof v === "string" && REGIONS.some((r) => r.key === v));

/**
 * The reader's region filter, as a list of the options they ticked.
 *
 * Each tick stands on its own: ticking Minnesota shows Minnesota's material and nothing else, and
 * ticking "Not region-specific" shows only what is written for nowhere in particular. Ticking several
 * shows the union, so a Minnesota teacher leader who also wants the universal material ticks both.
 * An empty list means everything.
 */
export function parseRegionFilter(v: unknown): string[] {
  const raw = Array.isArray(v) ? v : typeof v === "string" && v ? v.split(",") : [];
  return [...new Set(raw.map((x) => String(x).trim()).filter(isRegionFilterKey))].slice(0, REGION_FILTER_OPTIONS.length);
}

export const regionLabel = (key: string): string =>
  key === GENERAL_REGION ? "Not region-specific" : REGIONS.find((r) => r.key === key)?.label ?? key;

/** The regions an item is for, read off the audience taxa Connected already carries. */
export function regionsOfAudiences(audiences: readonly string[] | null | undefined): string[] {
  if (!audiences?.length) return [];
  const names = new Set(audiences.map((a) => a.trim().toLowerCase()));
  return REGIONS.filter((r) => names.has(r.audience.toLowerCase())).map((r) => r.key);
}
