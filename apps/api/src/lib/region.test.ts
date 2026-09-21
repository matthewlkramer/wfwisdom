import { describe, expect, it } from "vitest";
import { GENERAL_REGION, REGIONS, REGION_FILTER_OPTIONS, isRegionFilterKey, parseRegionFilter, regionLabel, regionsOfAudiences } from "@wfw/shared";

describe("regionsOfAudiences", () => {
  it("reads the region off the audience taxa Connected already carries", () => {
    expect(regionsOfAudiences(["Minnesota"])).toEqual(["mn"]);
    expect(regionsOfAudiences(["Northern California"])).toEqual(["nca"]);
    expect(regionsOfAudiences(["Washington DC"])).toEqual(["dc"]);
  });
  it("ignores the audiences that are not places", () => {
    expect(regionsOfAudiences(["Emerging Teacher Leaders", "Charter", "Toddler", "Español / Spanish"])).toEqual([]);
  });
  it("keeps every region on material written for more than one", () => {
    expect(regionsOfAudiences(["Massachusetts", "Minnesota", "New York"]).sort()).toEqual(["ma", "mn", "ny"]);
  });
  it("picks the places out of a mixed list", () => {
    expect(regionsOfAudiences(["Emerging Teacher Leaders", "Minnesota"])).toEqual(["mn"]);
  });
  it("is not thrown by casing or stray whitespace", () => {
    expect(regionsOfAudiences([" minnesota ", "MASSACHUSETTS"]).sort()).toEqual(["ma", "mn"]);
  });
  it("treats nothing, null and an empty list as applying everywhere", () => {
    expect(regionsOfAudiences([])).toEqual([]);
    expect(regionsOfAudiences(null)).toEqual([]);
    expect(regionsOfAudiences(undefined)).toEqual([]);
  });
});

describe("isRegionFilterKey", () => {
  it("accepts every region key and the not-region-specific option", () => {
    expect(isRegionFilterKey(GENERAL_REGION)).toBe(true);
    for (const r of REGIONS) expect(isRegionFilterKey(r.key)).toBe(true);
  });
  it("rejects anything else, including the old 'all' sentinel", () => {
    expect(isRegionFilterKey("all")).toBe(false);
    expect(isRegionFilterKey("mars")).toBe(false);
    expect(isRegionFilterKey("")).toBe(false);
    expect(isRegionFilterKey(null)).toBe(false);
    expect(isRegionFilterKey(7)).toBe(false);
  });
});

describe("parseRegionFilter", () => {
  it("reads the ticked options from a comma-separated list", () => {
    expect(parseRegionFilter("mn,ma")).toEqual(["mn", "ma"]);
    expect(parseRegionFilter(" mn , general ")).toEqual(["mn", "general"]);
  });
  it("reads them from an array too, which is how they come back off a user record", () => {
    expect(parseRegionFilter(["mn", "general"])).toEqual(["mn", "general"]);
  });
  it("treats nothing ticked as no narrowing at all", () => {
    expect(parseRegionFilter("")).toEqual([]);
    expect(parseRegionFilter([])).toEqual([]);
    expect(parseRegionFilter(undefined)).toEqual([]);
    expect(parseRegionFilter(null)).toEqual([]);
  });
  it("drops keys it does not know rather than failing the request", () => {
    expect(parseRegionFilter("mn,mars,ma")).toEqual(["mn", "ma"]);
    expect(parseRegionFilter("all")).toEqual([]);
  });
  it("drops duplicates and cannot grow past the options on offer", () => {
    expect(parseRegionFilter("mn,mn,ma")).toEqual(["mn", "ma"]);
    expect(parseRegionFilter(REGION_FILTER_OPTIONS.map((o) => o.key)).length).toBe(REGION_FILTER_OPTIONS.length);
  });
});

describe("regionLabel", () => {
  it("names a region and the not-region-specific option, and falls back to a key it does not know", () => {
    expect(regionLabel("mn")).toBe("Minnesota");
    expect(regionLabel("nca")).toBe("Northern California");
    expect(regionLabel(GENERAL_REGION)).toBe("Not region-specific");
    expect(regionLabel("zz")).toBe("zz");
  });
  it("gives every region a distinct key and label", () => {
    expect(new Set(REGIONS.map((r) => r.key)).size).toBe(REGIONS.length);
    expect(new Set(REGIONS.map((r) => r.label)).size).toBe(REGIONS.length);
  });
});
