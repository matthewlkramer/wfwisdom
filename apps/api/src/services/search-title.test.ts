import { describe, expect, it } from "vitest";
import { titleCoverage, typedTerms } from "./search.js";

describe("typedTerms", () => {
  it("keeps short words a reader is likely to search by", () => {
    expect(typedTerms("SSJ")).toEqual(["ssj"]);
    expect(typedTerms("form 990")).toEqual(["form", "990"]);
  });
  it("drops filler and single letters, and does not repeat a word", () => {
    expect(typedTerms("what is the advice process")).toEqual(["is", "advice", "process"]);
    expect(typedTerms("board board meeting")).toEqual(["board", "meeting"]);
  });
});

describe("titleCoverage", () => {
  it("is 1 when the title carries every word typed", () => {
    expect(titleCoverage("roots", "Wildflower's Roots in Research")).toBe(1);
    expect(titleCoverage("nine principles", "The Nine Principles")).toBe(1);
  });
  it("is 0 when the title carries none of them", () => {
    // The document that outranked "Roots in Research": it only mentions the word in its body.
    expect(titleCoverage("roots", "Wildflower Seedlings: Class of 2020-2021")).toBe(0);
  });
  it("matches across a plural, which a substring test alone would miss", () => {
    expect(titleCoverage("board meetings", "Board Meeting Agenda Template")).toBe(1);
  });
  it("counts partial coverage", () => {
    expect(titleCoverage("flexible tuition policy", "Flexible Tuition Model Overview")).toBeCloseTo(2 / 3);
  });
  it("is 0 for a query with nothing to match on", () => {
    expect(titleCoverage("   ", "The Nine Principles")).toBe(0);
  });
});
