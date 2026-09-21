import { describe, expect, it } from "vitest";
import { stripSeriesPrefix } from "./titles.js";

describe("stripSeriesPrefix", () => {
  it("removes the prefix in the casings Connected actually stores", () => {
    expect(stripSeriesPrefix("SERIES: Equity Consultants")).toBe("Equity Consultants");
    expect(stripSeriesPrefix("Series: School Marketing")).toBe("School Marketing");
    expect(stripSeriesPrefix("SERIES:Self-Management")).toBe("Self-Management");
    expect(stripSeriesPrefix("SERIES:  Licensing By State")).toBe("Licensing By State");
  });
  it("removes the Spanish spelling too", () => {
    expect(stripSeriesPrefix("SERIE: Viaje de Inicio de una Escuela Wildflower")).toBe("Viaje de Inicio de una Escuela Wildflower");
    expect(stripSeriesPrefix("Serie: Plantillas y Herramientas")).toBe("Plantillas y Herramientas");
  });
  it("only strips a real prefix, never the word inside a title", () => {
    expect(stripSeriesPrefix("Self-Management Learning Series Module 4: Conflict Resolution")).toBe("Self-Management Learning Series Module 4: Conflict Resolution");
    expect(stripSeriesPrefix("SERIES: Liberatory Leadership Series")).toBe("Liberatory Leadership Series");
    expect(stripSeriesPrefix("The Wildflower Collection")).toBe("The Wildflower Collection");
  });
  it("leaves a title that is nothing but the prefix alone rather than emptying it", () => {
    expect(stripSeriesPrefix("SERIES:")).toBe("SERIES:");
    expect(stripSeriesPrefix("Series: ")).toBe("Series: ");
  });
  it("is safe to run twice", () => {
    expect(stripSeriesPrefix(stripSeriesPrefix("SERIES: Equity Consultants"))).toBe("Equity Consultants");
  });
});
