import { describe, expect, it } from "vitest";
import { REGIONS, isResourceRegion, regionLabel, regionsOfAudiences } from "@wfw/shared";

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

describe("isResourceRegion", () => {
  it("accepts the two modes and every region key", () => {
    expect(isResourceRegion("all")).toBe(true);
    expect(isResourceRegion("general")).toBe(true);
    for (const r of REGIONS) expect(isResourceRegion(r.key)).toBe(true);
  });
  it("rejects anything else", () => {
    expect(isResourceRegion("mars")).toBe(false);
    expect(isResourceRegion("")).toBe(false);
    expect(isResourceRegion(null)).toBe(false);
    expect(isResourceRegion(7)).toBe(false);
  });
});

describe("regionLabel", () => {
  it("names a region, and falls back to the key it does not know", () => {
    expect(regionLabel("mn")).toBe("Minnesota");
    expect(regionLabel("nca")).toBe("Northern California");
    expect(regionLabel("zz")).toBe("zz");
  });
  it("gives every region a distinct key and label", () => {
    expect(new Set(REGIONS.map((r) => r.key)).size).toBe(REGIONS.length);
    expect(new Set(REGIONS.map((r) => r.label)).size).toBe(REGIONS.length);
  });
});
