// Types shared by the API and the web app. Keep this file dependency-free.
export type Role = "teacher_leader" | "staff";
export interface SessionUser { id: string; email: string; name: string; role: Role; }
export type StageKey = "discovery" | "visioning" | "planning" | "startup" | "open";
export const STAGES: { key: StageKey; name: string; description: string }[] = [
  { key: "discovery", name: "Discovery", description: "Exploring whether to open a Wildflower school" },
  { key: "visioning", name: "Visioning", description: "Committed; shaping vision, name, partners, and region" },
  { key: "planning", name: "Planning", description: "Forming the nonprofit and board, budgeting, space search, licensing, marketing launch" },
  { key: "startup", name: "Startup", description: "The months before opening: enrolling, hiring, fit-out, systems" },
  { key: "open", name: "Open", description: "Running the school, year 1 and beyond" },
];
export type Curation = "essential" | "recommended" | null;
export interface ItemSummary {
  id: string; title: string; url: string; kind: "post" | "series" | "question";
  description: string | null; summary: string | null; contentType: string | null;
  updatedAt: string | null; views: number; score: number; curation: Curation; dated: string | null;
  linkOnly: boolean; attachmentCount: number; seriesTitles: string[]; why?: string | null;
}
export interface SubjobSummary { id: string; key: string; name: string; description: string | null; stages: StageKey[]; itemCount: number; }
export interface JobSummary { id: string; key: string; name: string; description: string | null; staffOnly: boolean; hidden: boolean; subjobs: SubjobSummary[]; }
export interface Verdict { verdict: "Ready to use" | "Nearly ready" | "Needs significant work"; }
export interface ReviewResult {
  verdict: Verdict["verdict"]; one_thing: string; summary: string;
  rubric: { criterion: string; score: number; note: string }[];
  strengths: string[];
  priority_changes: { what: string; why: string; how: string }[];
  line_notes: { quote: string; note: string }[];
  example_rewrites: { original: string; rewrite: string; why: string }[];
  questions_for_writer: string[];
  verify_with_humans: string[];
  recommended_resources: { title: string; url: string; why: string }[];
  nits: string[];
}
export interface Settings {
  killSwitch: boolean; reviewModel: string; reviewEffort: string; assistModel: string; chatModel: string; embeddingModel: string;
  reviewsPerAccountPerDay: number; reviewsPerDayGlobal: number; chatTurnsPerAccountPerDay: number; chatTurnsPerDayGlobal: number;
  maxUploadBytes: number; maxDraftChars: number; maxReviewOutputTokens: number;
  scoreWeights: { curation: number; usage: number; freshness: number }; freshnessLadder: number[]; evergreenContentTypes: string[];
  startHereCap: number; signalBlendCeiling: number; signalHalfLifeDays: number; staffDomain: string;
}
export const SETTING_DEFAULTS: Settings = {
  killSwitch: false, reviewModel: "gpt-5.6-sol", reviewEffort: "medium", assistModel: "gpt-5.6-luna", chatModel: "gpt-5.6-luna", embeddingModel: "text-embedding-3-small",
  reviewsPerAccountPerDay: 8, reviewsPerDayGlobal: 120, chatTurnsPerAccountPerDay: 300, chatTurnsPerDayGlobal: 3000,
  maxUploadBytes: 5 * 1024 * 1024, maxDraftChars: 30000, maxReviewOutputTokens: 4000,
  scoreWeights: { curation: 0.4, usage: 0.35, freshness: 0.25 }, freshnessLadder: [1, 0.8, 0.6, 0.4, 0.25], evergreenContentTypes: ["template", "policy", "definition"],
  startHereCap: 7, signalBlendCeiling: 0.6, signalHalfLifeDays: 90, staffDomain: "wildflowerschools.org",
};

export type FeedbackCategory = "bug" | "question" | "suggestion" | "other";
export type FeedbackStatus = "open" | "in_progress" | "resolved" | "dismissed";
export interface FeedbackResult {
  id: string; category: FeedbackCategory; status: FeedbackStatus; message: string;
  pageUrl: string | null; pagePath: string | null; pageTitle: string | null; screenshotDataUrl: string | null;
  context: Record<string, unknown>; adminNotes: string | null; createdByUserId: string; resolvedByUserId: string | null;
  resolvedAt: string | null; createdAt: string; updatedAt: string; reporterName: string; reporterEmail: string;
}
export interface FeedbackListResult { feedback: FeedbackResult[]; pagination: { page: number; limit: number; total: number; pageCount: number } }
