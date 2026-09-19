import { beforeEach, describe, expect, it, vi } from "vitest";

const respondJson = vi.fn();
const getSettings = vi.fn();

vi.mock("../lib/openai.js", () => ({ respondJson }));
vi.mock("../settings.js", () => ({ getSettings }));
vi.mock("../logger.js", () => ({ logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() } }));

const { promptFor, resolveLanguage } = await import("./language.js");
const { detectLanguage, detectLanguageDetailed } = await import("@wfw/shared");

const ENGLISH = { title: "Board meeting agenda", body: "This is the agenda for the first board meeting of the school. The board will review the budget and approve the lease that the teachers have prepared for their families." };
const SPANISH = { title: "Agenda de la reunion", body: "Esta es la agenda de la primera reunion del consejo de la escuela. Los maestros y las familias van a revisar el presupuesto, y tambien el contrato que preparamos para las escuelas." };
// Just over the line for a verdict, well under the line for certainty: enough words to be counted,
// but only 8 stop-word hits at a 3:1 margin, so it names English without earning "high".
const THIN = { title: "Meeting notes", body: "Meeting notes agenda draft version copy final para los teachers with the school and families" };
// The real shape of a miss: a series whose whole body is a list of its posts' titles.
const SERIES = { title: "SERIES: [MN] Licensing FAQ", body: "Includes: Licensing FAQ\nIncludes: Fire inspection\nIncludes: Square footage" };

beforeEach(() => {
  vi.clearAllMocks();
  getSettings.mockResolvedValue({ killSwitch: false, assistModel: "gpt-5.6-luna" });
  respondJson.mockResolvedValue({ data: { language: "en" } });
});

describe("resolveLanguage", () => {
  it("settles clear English offline and never calls the model", async () => {
    await expect(resolveLanguage(ENGLISH)).resolves.toBe("en");
    expect(respondJson).not.toHaveBeenCalled();
  });

  it("settles clear Spanish offline and never calls the model", async () => {
    await expect(resolveLanguage(SPANISH)).resolves.toBe("es");
    expect(respondJson).not.toHaveBeenCalled();
  });

  it("trusts a hand-written Espanol label without paying for a call", async () => {
    await expect(resolveLanguage({ title: "Gu\u00eda de inicio (Espa\u00f1ol)", body: "" })).resolves.toBe("es");
    expect(respondJson).not.toHaveBeenCalled();
  });

  it("checks a verdict the detector only reached on thin evidence", async () => {
    // Enough hits to name a winner, not enough to be sure of it: exactly what used to go unchecked.
    respondJson.mockResolvedValue({ data: { language: "es" } });
    await expect(resolveLanguage(THIN)).resolves.toBe("es");
    expect(respondJson).toHaveBeenCalledTimes(1);
  });

  it("asks the model for what the detector could not settle", async () => {
    await expect(resolveLanguage(SERIES)).resolves.toBe("en");
    expect(respondJson).toHaveBeenCalledTimes(1);
    expect(respondJson).toHaveBeenCalledWith(expect.objectContaining({ model: "gpt-5.6-luna", effort: "low" }));
  });

  it("takes the model's Spanish verdict", async () => {
    respondJson.mockResolvedValue({ data: { language: "es" } });
    await expect(resolveLanguage(SERIES)).resolves.toBe("es");
  });

  it("keeps unknown when the model itself says unknown", async () => {
    respondJson.mockResolvedValue({ data: { language: "unknown" } });
    await expect(resolveLanguage(SERIES)).resolves.toBe("unknown");
  });

  it("keeps the offline verdict rather than trusting a value outside the three", async () => {
    respondJson.mockResolvedValue({ data: { language: "portuguese" } });
    await expect(resolveLanguage(SERIES)).resolves.toBe("unknown");
    await expect(resolveLanguage(THIN)).resolves.toBe(detectLanguage(THIN));
  });

  it("respects the kill switch and spends nothing while AI is paused", async () => {
    getSettings.mockResolvedValue({ killSwitch: true, assistModel: "gpt-5.6-luna" });
    await expect(resolveLanguage(SERIES)).resolves.toBe("unknown");
    expect(respondJson).not.toHaveBeenCalled();
  });

  it("survives an API failure instead of breaking the caller", async () => {
    respondJson.mockRejectedValue(new Error("OpenAI /responses failed: 429 rate limit"));
    await expect(resolveLanguage(SERIES)).resolves.toBe("unknown");
  });

  it("keeps a low-confidence offline verdict when the model cannot be reached", async () => {
    respondJson.mockRejectedValue(new Error("timeout"));
    await expect(resolveLanguage(THIN)).resolves.toBe(detectLanguage(THIN));
  });

  it("keeps a low-confidence offline verdict while the kill switch is on", async () => {
    getSettings.mockResolvedValue({ killSwitch: true, assistModel: "gpt-5.6-luna" });
    await expect(resolveLanguage(THIN)).resolves.toBe(detectLanguage(THIN));
    expect(respondJson).not.toHaveBeenCalled();
  });

  it("reports a failure through the caller's log", async () => {
    respondJson.mockRejectedValue(new Error("boom"));
    const log = vi.fn();
    await resolveLanguage(SERIES, log);
    expect(log).toHaveBeenCalledWith(expect.stringContaining("boom"));
  });

  it("does not spend a call on an item with essentially no text", async () => {
    await expect(resolveLanguage({ title: "x", body: "" })).resolves.toBe("unknown");
    expect(respondJson).not.toHaveBeenCalled();
  });
});

describe("promptFor", () => {
  it("includes the title, categories and body", () => {
    const p = promptFor({ title: "Staffing Schedule", body: "Monday Tuesday", categories: ["Operations"], seriesTitles: [] });
    expect(p).toContain("Staffing Schedule");
    expect(p).toContain("Operations");
    expect(p).toContain("Monday Tuesday");
  });

  it("caps a long body so the call stays cheap", () => {
    const p = promptFor({ title: "t", body: "x".repeat(50_000) });
    expect(p.length).toBeLessThan(2_600);
  });

  it("leaves out sections the item does not have", () => {
    const p = promptFor({ title: "t", body: "b" });
    expect(p).not.toContain("Categories:");
    expect(p).not.toContain("Description:");
  });
});

describe("confidence", () => {
  it("calls a long one-sided document certain", () => {
    expect(detectLanguageDetailed(ENGLISH)).toEqual({ language: "en", confidence: "high" });
    expect(detectLanguageDetailed(SPANISH)).toEqual({ language: "es", confidence: "high" });
  });
  it("treats a hand-written label as certain", () => {
    expect(detectLanguageDetailed({ title: "Handbook (Espa\u00f1ol)", body: "" }).confidence).toBe("high");
  });
  it("never calls an undetermined item certain", () => {
    expect(detectLanguageDetailed(SERIES).confidence).toBe("low");
    expect(detectLanguageDetailed({ title: "x", body: "" })).toEqual({ language: "unknown", confidence: "low" });
  });
  it("names a winner on thin evidence but does not claim certainty", () => {
    const v = detectLanguageDetailed(THIN);
    expect(v.language).not.toBe("unknown");
    expect(v.confidence).toBe("low");
  });
});
