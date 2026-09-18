import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";

const addNote = vi.fn();
const getStaffQuestion = vi.fn();
const listStaffQuestions = vi.fn();
const updateQuestion = vi.fn();
const insertValues = vi.fn().mockResolvedValue(undefined);

vi.mock("../services/questions.js", () => ({ addNote, getStaffQuestion, listStaffQuestions, updateQuestion }));
vi.mock("@wfw/db", () => ({ auditLog: {}, getDb: () => ({ insert: () => ({ values: insertValues }) }) }));

const { adminQuestionsRouter, listSchema, updateSchema } = await import("./questions.js");
const { testApp, staffUser, teacher } = await import("./test-app.js");

const app = (user = staffUser) => testApp("/api/admin/questions", adminQuestionsRouter, user);
const question = { id: "q1", question: "Do we need a nepotism policy?", notes: [] };

beforeEach(() => {
  vi.clearAllMocks();
  insertValues.mockResolvedValue(undefined);
  listStaffQuestions.mockResolvedValue({ questions: [question], total: 1 });
  getStaffQuestion.mockResolvedValue(question);
  addNote.mockResolvedValue(true);
  updateQuestion.mockResolvedValue(true);
});

describe("guards", () => {
  it("rejects a signed-out visitor with 401", async () => {
    await request(testApp("/api/admin/questions", adminQuestionsRouter, null)).get("/api/admin/questions").expect(401);
  });
  it("rejects a teacher leader with 403", async () => {
    await request(app(teacher)).get("/api/admin/questions").expect(403);
    expect(listStaffQuestions).not.toHaveBeenCalled();
  });
});

describe("GET /", () => {
  it("defaults to every question and the first page", async () => {
    const r = await request(app()).get("/api/admin/questions").expect(200);
    expect(listStaffQuestions).toHaveBeenCalledWith({ reviewed: "all", share: "all", page: 1, limit: 25 });
    expect(r.body.questions).toHaveLength(1);
    expect(r.body.pagination).toEqual({ page: 1, limit: 25, total: 1, pageCount: 1 });
  });
  it("passes the reviewed and share filters through", async () => {
    await request(app()).get("/api/admin/questions?reviewed=unreviewed&share=pending&page=2&limit=10").expect(200);
    expect(listStaffQuestions).toHaveBeenCalledWith({ reviewed: "unreviewed", share: "pending", page: 2, limit: 10 });
  });
  it("rejects an unknown filter value", async () => {
    await request(app()).get("/api/admin/questions?reviewed=maybe").expect(400);
  });
  it("rejects a limit over the cap", async () => {
    await request(app()).get("/api/admin/questions?limit=500").expect(400);
  });
  it("reports the page count for a longer queue", async () => {
    listStaffQuestions.mockResolvedValue({ questions: [], total: 51 });
    const r = await request(app()).get("/api/admin/questions?limit=25").expect(200);
    expect(r.body.pagination.pageCount).toBe(3);
  });
});

describe("POST /:id/notes", () => {
  it("records the note against the signed-in staff member and returns the question", async () => {
    const r = await request(app()).post("/api/admin/questions/q1/notes").send({ body: "  Answered well  " }).expect(201);
    expect(addNote).toHaveBeenCalledWith("q1", { id: staffUser.id, name: staffUser.name }, "Answered well");
    expect(r.body.question).toEqual(question);
  });
  it("writes the action to the audit log", async () => {
    await request(app()).post("/api/admin/questions/q1/notes").send({ body: "note" }).expect(201);
    expect(insertValues).toHaveBeenCalledWith(expect.objectContaining({ action: "question.note", target: "q1", actor: `${staffUser.name} <${staffUser.email}>` }));
  });
  it("rejects an empty note", async () => {
    await request(app()).post("/api/admin/questions/q1/notes").send({ body: "   " }).expect(400);
    expect(addNote).not.toHaveBeenCalled();
  });
  it("returns 404 when the question is gone", async () => {
    addNote.mockResolvedValue(false);
    await request(app()).post("/api/admin/questions/nope/notes").send({ body: "note" }).expect(404);
  });
});

describe("PATCH /:id", () => {
  it("marks a question reviewed", async () => {
    await request(app()).patch("/api/admin/questions/q1").send({ reviewed: true }).expect(200);
    expect(updateQuestion).toHaveBeenCalledWith("q1", `${staffUser.name} <${staffUser.email}>`, { reviewed: true });
    expect(insertValues).toHaveBeenCalledWith(expect.objectContaining({ action: "question.review" }));
  });
  it("approves a shared question and names the action in the audit log", async () => {
    await request(app()).patch("/api/admin/questions/q1").send({ shareStatus: "approved" }).expect(200);
    expect(insertValues).toHaveBeenCalledWith(expect.objectContaining({ action: "question.share.approved", target: "q1" }));
  });
  it("rejects a change with nothing in it", async () => {
    await request(app()).patch("/api/admin/questions/q1").send({}).expect(400);
    expect(updateQuestion).not.toHaveBeenCalled();
  });
  it("rejects an unknown share status", async () => {
    await request(app()).patch("/api/admin/questions/q1").send({ shareStatus: "published" }).expect(400);
  });
  it("returns 404 when the question was never offered for sharing", async () => {
    updateQuestion.mockResolvedValue(false);
    await request(app()).patch("/api/admin/questions/q1").send({ shareStatus: "approved" }).expect(404);
  });
});

describe("schemas", () => {
  it("coerces the numeric query parameters", () => {
    expect(listSchema.parse({ page: "3", limit: "10" })).toEqual({ reviewed: "all", share: "all", page: 3, limit: 10 });
  });
  it("accepts a reviewed-only and a share-only change", () => {
    expect(updateSchema.parse({ reviewed: false })).toEqual({ reviewed: false });
    expect(updateSchema.parse({ shareStatus: "rejected" })).toEqual({ shareStatus: "rejected" });
  });
});
