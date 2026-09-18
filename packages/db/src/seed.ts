import "dotenv/config";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { eq, sql } from "drizzle-orm";
import { closeDb, getDb } from "./index.js";
import { basePromptVersions, jobs, materialTypeVersions, materialTypes, placementSeeds, settings, subjobs, typeResourceSeeds } from "./schema.js";
import { SETTING_DEFAULTS } from "@wfw/shared";

const here = dirname(fileURLToPath(import.meta.url));
const read = (f: string) => readFileSync(resolve(here, "..", f), "utf8");

/** Idempotent seed: inserts what is missing, never overwrites staff edits. */
export async function seed(): Promise<Record<string, number>> {
  const db = getDb();
  const out: Record<string, number> = {};

  // Settings: insert defaults only where the key does not exist.
  let n = 0;
  for (const [key, value] of Object.entries(SETTING_DEFAULTS)) {
    const r = await db.insert(settings).values({ key, value: value as unknown as object }).onConflictDoNothing();
    n += r.rowCount ?? 0;
  }
  out.settings = n;

  // Taxonomy
  const tax = JSON.parse(read("seed-taxonomy.json")) as { jobs: { key: string; name: string; desc?: string; subs: { key: string; name: string }[] }[] };
  const subStages = new Map<string, string[]>();
  const seeds = JSON.parse(read("seed-placements.json")) as { source_kind: string; source_id: number; primary: string; secondary: string[]; stages: string[]; content_type: string; outdated: boolean; outdated_reason: string; why: string }[];
  for (const s of seeds) { const cur = subStages.get(s.primary) ?? []; for (const st of s.stages) if (!cur.includes(st)) cur.push(st); subStages.set(s.primary, cur); }
  const order = ["discovery", "visioning", "planning", "startup", "open"];
  let nj = 0, ns = 0;
  for (const [ji, j] of tax.jobs.entries()) {
    const staffOnly = j.key === "foundation";
    const inserted = await db.insert(jobs).values({ key: j.key, name: j.name, description: j.desc ?? null, sort: ji * 10, staffOnly }).onConflictDoNothing().returning({ id: jobs.id });
    nj += inserted.length;
    const jobRow = inserted[0] ?? (await db.select({ id: jobs.id }).from(jobs).where(eq(jobs.key, j.key)))[0];
    if (!jobRow) continue;
    for (const [si, s] of j.subs.entries()) {
      const stages = (subStages.get(s.key) ?? []).sort((a, b) => order.indexOf(a) - order.indexOf(b));
      const r = await db.insert(subjobs).values({ jobId: jobRow.id, key: s.key, name: s.name, sort: si * 10, stages }).onConflictDoNothing();
      ns += r.rowCount ?? 0;
    }
  }
  out.jobs = nj; out.subjobs = ns;

  // Placement seeds (applied by the indexer when items exist)
  let np = 0;
  for (const s of seeds) {
    const r = await db.insert(placementSeeds).values({ sourceKind: s.source_kind, sourceId: s.source_id, primarySubjob: s.primary, secondarySubjobs: s.secondary, stages: s.stages, contentType: s.content_type, outdated: s.outdated, outdatedReason: s.outdated_reason || null, why: s.why || null }).onConflictDoNothing();
    np += r.rowCount ?? 0;
  }
  out.placementSeeds = np;

  // Base prompt: first version only if none exists
  const existingBase = await db.select({ v: basePromptVersions.version }).from(basePromptVersions).limit(1);
  if (existingBase.length === 0) { await db.insert(basePromptVersions).values({ text: read("seed-base-prompt.md").trim(), note: "Stage 1 draft", createdBy: "seed" }); out.basePrompt = 1; }

  // Material types
  const types = JSON.parse(read("seed-material-types.json")) as { key: string; name: string; short: string; job: string; guide: string; rubric: [string, string][]; prompt_notes: string; links: number[] }[];
  let nt = 0, nr = 0;
  for (const [ti, t] of types.entries()) {
    const rubric = t.rubric.map(([criterion, description]) => ({ criterion, description }));
    const inserted = await db.insert(materialTypes).values({ key: t.key, name: t.name, shortDescription: t.short, jobKey: t.job, sort: ti * 10, guideMd: t.guide, rubric, reviewerNotes: t.prompt_notes, updatedBy: "seed" }).onConflictDoNothing().returning({ id: materialTypes.id });
    if (inserted[0]) {
      nt++;
      await db.insert(materialTypeVersions).values({ typeId: inserted[0].id, version: 1, name: t.name, shortDescription: t.short, guideMd: t.guide, rubric, reviewerNotes: t.prompt_notes, note: "Stage 1 draft", createdBy: "seed" }).onConflictDoNothing();
    }
    for (const [li, id] of t.links.entries()) {
      const r = await db.insert(typeResourceSeeds).values({ typeKey: t.key, sourceId: id, sort: li }).onConflictDoNothing();
      nr += r.rowCount ?? 0;
    }
  }
  out.materialTypes = nt; out.typeResourceSeeds = nr;
  await db.execute(sql`select 1`);
  return out;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try { console.log("Seed result", await seed()); } finally { await closeDb(); }
}
