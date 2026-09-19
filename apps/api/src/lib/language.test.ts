import { describe, expect, it } from "vitest";
import { firstWords, isItemLanguage, isResourceLanguage, linkifyParts } from "@wfw/shared";

describe("firstWords", () => {
  it("returns the opening n words", () => {
    expect(firstWords("one two three four five", 3)).toBe("one two three");
  });
  it("keeps text shorter than the limit whole", () => {
    expect(firstWords("one two", 10)).toBe("one two");
  });
  it("collapses newlines and runs of whitespace into single spaces", () => {
    expect(firstWords("one\n\ntwo   three\tfour", 3)).toBe("one two three");
  });
  it("handles empty and missing text", () => {
    expect(firstWords("", 5)).toBe("");
    expect(firstWords(null, 5)).toBe("");
    expect(firstWords(undefined, 5)).toBe("");
    expect(firstWords("   ", 5)).toBe("");
  });
});

describe("language guards", () => {
  it("accepts only the three filter values", () => {
    expect(["all", "en", "es"].every(isResourceLanguage)).toBe(true);
    expect(["unknown", "fr", "", null, undefined, 1].some(isResourceLanguage)).toBe(false);
  });
  it("accepts only the three stored values", () => {
    expect(["en", "es", "unknown"].every(isItemLanguage)).toBe(true);
    expect(["all", "fr", "", null, undefined, 1].some(isItemLanguage)).toBe(false);
  });
});

describe("linkifyParts", () => {
  it("splits a bare URL out of surrounding text", () => {
    expect(linkifyParts("See https://example.org/a for more")).toEqual([
      { kind: "text", text: "See " },
      { kind: "link", text: "https://example.org/a", href: "https://example.org/a" },
      { kind: "text", text: " for more" },
    ]);
  });
  it("leaves trailing sentence punctuation out of the link", () => {
    const parts = linkifyParts("Read https://example.org/policy.");
    expect(parts[1]).toEqual({ kind: "link", text: "https://example.org/policy", href: "https://example.org/policy" });
    expect(parts[2]).toEqual({ kind: "text", text: "." });
  });
  it("gives a www link an https href", () => {
    expect(linkifyParts("www.wildflowerschools.org")).toEqual([{ kind: "link", text: "www.wildflowerschools.org", href: "https://www.wildflowerschools.org" }]);
  });
  it("finds several links in one string", () => {
    const links = linkifyParts("a https://one.example b http://two.example c").filter((p) => p.kind === "link");
    expect(links.map((l) => l.text)).toEqual(["https://one.example", "http://two.example"]);
  });
  it("returns a single text segment when there is no URL", () => {
    expect(linkifyParts("no links here")).toEqual([{ kind: "text", text: "no links here" }]);
  });
  it("returns nothing for empty text", () => {
    expect(linkifyParts("")).toEqual([]);
  });
});
