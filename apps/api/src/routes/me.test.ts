import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";

const setReaderLanguage = vi.fn();
vi.mock("../services/language-pref.js", () => ({ setReaderLanguage, readerLanguage: vi.fn() }));

const { meRouter, languageSchema } = await import("./me.js");
const { testApp, teacher } = await import("./test-app.js");
const app = (user = teacher) => testApp("/api/me", meRouter, user);

beforeEach(() => { vi.clearAllMocks(); setReaderLanguage.mockResolvedValue(undefined); });

describe("PUT /language", () => {
  it("stores the choice on the signed-in user's record", async () => {
    const r = await request(app()).put("/api/me/language").send({ language: "es" }).expect(200);
    expect(setReaderLanguage).toHaveBeenCalledWith(teacher.id, "es");
    expect(r.body).toEqual({ language: "es" });
  });
  it("accepts each of the three choices", async () => {
    for (const language of ["all", "en", "es"]) await request(app()).put("/api/me/language").send({ language }).expect(200);
    expect(setReaderLanguage).toHaveBeenCalledTimes(3);
  });
  it("rejects a language it does not know", async () => {
    await request(app()).put("/api/me/language").send({ language: "fr" }).expect(400);
    expect(setReaderLanguage).not.toHaveBeenCalled();
  });
  it("needs a signed-in user", async () => {
    await request(testApp("/api/me", meRouter, null)).put("/api/me/language").send({ language: "es" }).expect(401);
  });
});

describe("languageSchema", () => {
  it("rejects a missing language", () => {
    expect(languageSchema.safeParse({}).success).toBe(false);
  });
});
