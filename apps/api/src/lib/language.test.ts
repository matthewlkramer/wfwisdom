import { describe, expect, it } from "vitest";
import { detectLanguage, isResourceLanguage, linkifyParts } from "@wfw/shared";

describe("detectLanguage", () => {
  it("treats an Español label in the title as a strong signal", () => {
    expect(detectLanguage({ title: "Guía de inicio (Español)", body: "" })).toBe("es");
    expect(detectLanguage({ title: "Enrollment guide - Spanish", body: "" })).toBe("es");
  });
  it("treats a Spanish category as a strong signal even when the body is short", () => {
    expect(detectLanguage({ title: "Guia", categories: ["Resources > Español"], body: "" })).toBe("es");
  });
  it("reads plain English prose", () => {
    expect(detectLanguage({ title: "Board meeting agenda", body: "This is the agenda for the first board meeting of the school. The board will review the budget and approve the lease that the teachers have prepared for their families." })).toBe("en");
  });
  it("reads plain Spanish prose with no label at all", () => {
    expect(detectLanguage({ title: "Agenda de la reunion", body: "Esta es la agenda de la primera reunion del consejo de la escuela. Los maestros y las familias van a revisar el presupuesto, y tambien el contrato que preparamos para las escuelas." })).toBe("es");
  });
  it("uses accented characters as evidence for Spanish", () => {
    expect(detectLanguage({ title: "Comunicación", body: "La comunicación con las familias es fundamental para el año escolar. Cada niño y su familia reciben información sobre el día." })).toBe("es");
  });
  it("returns unknown for an item with almost no text", () => {
    expect(detectLanguage({ title: "Form", body: "" })).toBe("unknown");
    expect(detectLanguage({ title: "", body: "" })).toBe("unknown");
  });
  it("returns unknown rather than guessing when the two are too close", () => {
    expect(detectLanguage({ title: "Untitled upload", body: "Wildflower Montessori 2024 2025 budget v3 xlsx download pdf" })).toBe("unknown");
  });
  it("does not read an English document as Spanish because of Spanish surnames", () => {
    // A staffing roster or a release form carries accented names but no Spanish function words.
    // Weighting those accents used to file it as Spanish outright.
    expect(detectLanguage({ title: "22-23 Staffing Schedule", body: "Room Lead Assistant Hours for the year. Primary A Maria Gonzalez and Ana Pe\u00f1a work with the children from 8:00 to 3:00, and Jose Ramirez and Sofia N\u00fa\u00f1ez are with the other families." })).not.toBe("es");
    expect(detectLanguage({ title: "School Photo & Media Release Form", body: "I grant permission for photographs of my child Ana Pe\u00f1a to be used by the school, and I have read the terms that are set out for families in this form." })).toBe("en");
  });

  it("still reads real Spanish, where accents back up the function words", () => {
    expect(detectLanguage({ title: "Gu\u00eda para las familias", body: "Informaci\u00f3n para las familias de la escuela sobre el a\u00f1o escolar y sobre los maestros." })).toBe("es");
  });

  it("is deterministic across repeated calls", () => {
    const input = { title: "Guía para familias", body: "Información para las familias de la escuela." };
    expect([detectLanguage(input), detectLanguage(input), detectLanguage(input)]).toEqual(["es", "es", "es"]);
  });
});

describe("isResourceLanguage", () => {
  it("accepts only the three filter values", () => {
    expect(["all", "en", "es"].every(isResourceLanguage)).toBe(true);
    expect(["unknown", "fr", "", null, undefined, 1].some(isResourceLanguage)).toBe(false);
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
