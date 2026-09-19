import { beforeEach, describe, expect, it, vi } from "vitest";

const respondJson = vi.fn();
const getSettings = vi.fn();

vi.mock("../lib/openai.js", () => ({ respondJson }));
vi.mock("../settings.js", () => ({ getSettings }));
vi.mock("../logger.js", () => ({ logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() } }));

const { PROMPT_WORDS, promptFor, resolveLanguage } = await import("./language.js");

const ITEM = { title: "Board meeting agenda", body: "This is the agenda for the first board meeting of the school." };

beforeEach(() => {
  vi.clearAllMocks();
  getSettings.mockResolvedValue({ killSwitch: false, assistModel: "gpt-5.6-luna" });
  respondJson.mockResolvedValue({ data: { language: "en" } });
});

describe("resolveLanguage", () => {
  it("asks the model for every item, with no offline guess in front of it", async () => {
    await expect(resolveLanguage(ITEM)).resolves.toBe("en");
    expect(respondJson).toHaveBeenCalledTimes(1);
    expect(respondJson).toHaveBeenCalledWith(expect.objectContaining({ model: "gpt-5.6-luna", effort: "low" }));
  });

  it("takes a Spanish verdict", async () => {
    respondJson.mockResolvedValue({ data: { language: "es" } });
    await expect(resolveLanguage(ITEM)).resolves.toBe("es");
  });

  it("records unknown when the model says it cannot tell", async () => {
    respondJson.mockResolvedValue({ data: { language: "unknown" } });
    await expect(resolveLanguage(ITEM)).resolves.toBe("unknown");
  });

  // null is the signal to callers to leave the stored language alone. Returning "unknown" here
  // would overwrite a good answer with a bad one every time the model was unavailable.
  it("returns null, not unknown, while the kill switch is on", async () => {
    getSettings.mockResolvedValue({ killSwitch: true, assistModel: "gpt-5.6-luna" });
    await expect(resolveLanguage(ITEM)).resolves.toBeNull();
    expect(respondJson).not.toHaveBeenCalled();
  });

  it("returns null when the API fails", async () => {
    respondJson.mockRejectedValue(new Error("OpenAI /responses failed: 429 rate limit"));
    await expect(resolveLanguage(ITEM)).resolves.toBeNull();
  });

  it("returns null rather than trusting a value outside the three", async () => {
    respondJson.mockResolvedValue({ data: { language: "portuguese" } });
    await expect(resolveLanguage(ITEM)).resolves.toBeNull();
  });

  it("reports a failure through the caller's log", async () => {
    respondJson.mockRejectedValue(new Error("boom"));
    const log = vi.fn();
    await resolveLanguage(ITEM, log);
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

  it("sends only the opening 200 words of the body", () => {
    const body = Array.from({ length: 1000 }, (_, i) => `w${i}`).join(" ");
    const p = promptFor({ title: "t", body });
    expect(p).toContain("w0 w1 w2");
    expect(p).toContain(`w${PROMPT_WORDS - 1}`);
    expect(p).not.toContain(`w${PROMPT_WORDS}`);
  });

  it("keeps a short body whole", () => {
    expect(promptFor({ title: "t", body: "one two three" })).toContain("one two three");
  });

  it("leaves out sections the item does not have", () => {
    const p = promptFor({ title: "t", body: "b" });
    expect(p).not.toContain("Categories:");
    expect(p).not.toContain("Description:");
  });
});
