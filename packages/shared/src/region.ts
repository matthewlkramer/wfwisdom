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

/**
 * What a reader picked in the region filter.
 *
 * - "all" — everything, including material written for somebody else's region.
 * - "general" — only what is not written for one region, so it applies wherever you are.
 * - a region key — that region's material *and* the material that applies everywhere: what a teacher
 *   leader there actually needs, without Massachusetts licensing showing up in Minnesota.
 */
export type ResourceRegion = "all" | "general" | (string & {});
export const isResourceRegion = (v: unknown): v is ResourceRegion =>
  v === "all" || v === "general" || (typeof v === "string" && REGIONS.some((r) => r.key === v));

export const REGION_CHOICES: { key: ResourceRegion; label: string }[] = [
  { key: "all", label: "All regions" },
  { key: "general", label: "Not region-specific" },
  ...REGIONS.map((r) => ({ key: r.key as ResourceRegion, label: r.label })),
];

export const regionLabel = (key: string): string => REGIONS.find((r) => r.key === key)?.label ?? key;

/** The regions an item is for, read off the audience taxa Connected already carries. */
export function regionsOfAudiences(audiences: readonly string[] | null | undefined): string[] {
  if (!audiences?.length) return [];
  const names = new Set(audiences.map((a) => a.trim().toLowerCase()));
  return REGIONS.filter((r) => names.has(r.audience.toLowerCase())).map((r) => r.key);
}
