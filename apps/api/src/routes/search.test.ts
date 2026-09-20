import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";

const answer = vi.fn();
const search = vi.fn();
const listMyQuestions = vi.fn();
const listSharedExamples = vi.fn();
const readerLanguage = vi.fn();
const checkChatAllowed = vi.fn();
const searchLogValues = vi.fn().mockResolvedValue(undefined);

class LimitError extends Error { constructor(message: string, public code: string) { super(message); } }

vi.mock("../services/chat.js", () => ({ answer }));
vi.mock("../services/search.js", () => ({ search }));
vi.mock("../services/questions.js", () => ({ listMyQuestions, listSharedExamples }));
vi.mock("../services/language-pref.js", () => ({ readerLanguage }));
vi.mock("../services/limits.js", () => ({ checkChatAllowed, LimitError }));
vi.mock("@wfw/db", async (importOriginal) => ({ ...(await importOriginal<typeof import("@wfw/db")>()), getDb: () => ({ insert: () => ({ values: searchLogValues }) }) }));

const { searchRouter, chatSchema } = await import("./search.js");
const { testApp, teacher } = await import("./test-app.js");
const app = (user = teacher) => testApp("/api/search", searchRouter, user);
const CONVO = "33333333-3333-4333-8333-333333333333";

beforeEach(() => {
  vi.clearAllMocks();
  searchLogValues.mockResolvedValue(undefined);
  readerLanguage.mockResolvedValue("all");
  checkChatAllowed.mockResolvedValue(undefined);
  answer.mockResolvedValue({ answer: "Yes.", covered: true, citations: [] });
  search.mockResolvedValue({ query: "tuition", rewritten: null, mode: "semantic", results: [] });
  listMyQuestions.mockResolvedValue([]);
  listSharedExamples.mockResolvedValue([]);
});

describe("POST /chat", () => {
  it("defaults both sharing choices to off", async () => {
    await request(app()).post("/api/search/chat").send({ conversationId: CONVO, question: "Do we need a policy?" }).expect(200);
    expect(answer).toHaveBeenCalledWith(teacher.id, CONVO, "Do we need a policy?", [], false, { staffReview: false, share: false, shareAttribution: "anonymous" });
  });
  it("passes the asker's choices through to the turn", async () => {
    await request(app()).post("/api/search/chat").send({ conversationId: CONVO, question: "Do we need a policy?", staffReview: true, share: true, shareAttribution: "name" }).expect(200);
    expect(answer).toHaveBeenCalledWith(teacher.id, CONVO, "Do we need a policy?", [], false, { staffReview: true, share: true, shareAttribution: "name" });
  });
  it("rejects an attribution it does not know", async () => {
    await request(app()).post("/api/search/chat").send({ conversationId: CONVO, question: "Hello there", shareAttribution: "email" }).expect(400);
    expect(answer).not.toHaveBeenCalled();
  });
  it("rejects a question that is too short", async () => {
    await request(app()).post("/api/search/chat").send({ conversationId: CONVO, question: "a" }).expect(400);
  });
  it("turns a daily limit into a 429 with its code", async () => {
    checkChatAllowed.mockRejectedValue(new LimitError("Too many questions today", "chat_account_limit"));
    const r = await request(app()).post("/api/search/chat").send({ conversationId: CONVO, question: "Do we need a policy?" }).expect(429);
    expect(r.body).toEqual({ error: "Too many questions today", code: "chat_account_limit" });
  });
  it("needs a signed-in user", async () => {
    await request(testApp("/api/search", searchRouter, null)).post("/api/search/chat").send({ conversationId: CONVO, question: "Do we need a policy?" }).expect(401);
  });
});

describe("GET /chat/mine", () => {
  it("returns only the signed-in user's questions", async () => {
    listMyQuestions.mockResolvedValue([{ id: "q1", question: "Earlier question" }]);
    const r = await request(app()).get("/api/search/chat/mine").expect(200);
    expect(listMyQuestions).toHaveBeenCalledWith(teacher.id, 25);
    expect(r.body.questions).toHaveLength(1);
  });
  it("needs a signed-in user", async () => {
    await request(testApp("/api/search", searchRouter, null)).get("/api/search/chat/mine").expect(401);
  });
});

describe("GET /chat/examples", () => {
  it("returns the approved shared questions", async () => {
    listSharedExamples.mockResolvedValue([{ id: "q2", question: "Shared one", askerName: null }]);
    const r = await request(app()).get("/api/search/chat/examples").expect(200);
    expect(listSharedExamples).toHaveBeenCalledWith(6);
    expect(r.body.examples[0].askerName).toBeNull();
  });
});

describe("GET / (language filter)", () => {
  it("uses the language in the query string", async () => {
    await request(app()).get("/api/search?q=tuition&lang=es").expect(200);
    expect(search).toHaveBeenCalledWith("tuition", expect.objectContaining({ language: "es" }));
    expect(readerLanguage).not.toHaveBeenCalled();
  });
  it("falls back to what the reader last chose", async () => {
    readerLanguage.mockResolvedValue("en");
    const r = await request(app()).get("/api/search?q=tuition").expect(200);
    expect(search).toHaveBeenCalledWith("tuition", expect.objectContaining({ language: "en" }));
    expect(r.body.language).toBe("en");
  });
  it("ignores a language it does not know", async () => {
    await request(app()).get("/api/search?q=tuition&lang=fr").expect(200);
    expect(search).toHaveBeenCalledWith("tuition", expect.objectContaining({ language: "all" }));
  });
  it("short-circuits a query of one character but still reports the language", async () => {
    const r = await request(app()).get("/api/search?q=a&lang=es").expect(200);
    expect(r.body).toEqual({ query: "a", rewritten: null, mode: "keyword", results: [], language: "es" });
    expect(search).not.toHaveBeenCalled();
  });
});

describe("chatSchema", () => {
  it("fills in the defaults the Ask page relies on", () => {
    expect(chatSchema.parse({ conversationId: CONVO, question: "Hello there" })).toEqual({ conversationId: CONVO, question: "Hello there", history: [], staffReview: false, share: false, shareAttribution: "anonymous" });
  });
});
