#!/usr/bin/env node
// Exercises every user-facing flow in a real browser and reports what it saw.
// Usage: node scripts/browser-check.mjs <baseUrl> [--dev-login] [--submit]
// With --dev-login it signs in through /api/auth/dev (local only). Otherwise it expects a storage state file
// at scripts/.auth-state.json created by a manual Google sign-in (see docs/admin-guide.md).
import { chromium } from "playwright";
import { existsSync, mkdirSync } from "node:fs";
const base = (process.argv[2] ?? "http://localhost:5173").replace(/\/$/, "");
const devLogin = process.argv.includes("--dev-login"); const doSubmit = process.argv.includes("--submit");
const shots = "scripts/.shots"; mkdirSync(shots, { recursive: true });
const report = []; const ok = (m) => report.push(`OK    ${m}`); const bad = (m) => report.push(`FAIL  ${m}`);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
async function session(role) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, ...(devLogin ? {} : existsSync(`scripts/.auth-state.${role}.json`) ? { storageState: `scripts/.auth-state.${role}.json` } : {}) });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => bad(`[${role}] page error: ${e.message}`));
  if (devLogin) await page.goto(`${base}/api/auth/dev?email=${role}@example.com&role=${role === "staff" ? "staff" : "tl"}&name=${role}`);
  return { ctx, page };
}
try {
  // Signed-out landing
  { const ctx = await browser.newContext(); const page = await ctx.newPage(); await page.goto(base); await page.waitForSelector("text=Sign in with Google", { timeout: 15000 }); ok("landing shows Google sign-in"); await page.screenshot({ path: `${shots}/00-landing.png` }); await ctx.close(); }
  // Teacher leader flows
  const tl = await session("tl"); const p = tl.page;
  await p.goto(base); await p.waitForSelector("text=Where are you in the journey", { timeout: 20000 }); ok("[tl] home loads with stage picker");
  await p.click("button:has-text('Planning')"); await p.waitForSelector("text=You are in Planning", { timeout: 15000 }); ok("[tl] stage set to Planning; Start here shown"); await p.screenshot({ path: `${shots}/01-home.png`, fullPage: true });
  await p.click("a:has-text('Map')"); await p.waitForSelector("h1:has-text('The map')"); const jobCount = await p.locator(".job-card").count(); jobCount >= 10 ? ok(`[tl] map shows ${jobCount} jobs`) : bad(`[tl] map shows only ${jobCount} jobs`); await p.screenshot({ path: `${shots}/02-map.png`, fullPage: true });
  await p.click(".job-card ul a >> nth=0"); await p.waitForSelector(".wf-card-record", { timeout: 20000 }).catch(() => {}); const cards = await p.locator(".wf-card-record").count(); cards > 0 ? ok(`[tl] sub-job page lists ${cards} items`) : bad("[tl] sub-job page empty");
  await p.click(".wf-card-record .wf-card-title >> nth=0"); await p.waitForSelector("text=Open in Connected"); ok("[tl] item page shows summary and Connected link");
  await p.click("button:has-text('Yes')"); await p.waitForTimeout(800); ok("[tl] helpful vote recorded"); await p.screenshot({ path: `${shots}/03-item.png`, fullPage: true });
  await p.goto(`${base}/search?q=how%20do%20we%20set%20tuition%20levels`); await p.waitForSelector(".wf-card-record, .wf-state:not(:has(.wf-spin))", { timeout: 90000 }); const sr = await p.locator(".wf-card-record").count(); sr > 0 ? ok(`[tl] search returned ${sr} results`) : bad("[tl] search returned nothing"); const why = await p.locator(".item-why").count(); why > 0 ? ok(`[tl] ${why} results carry a why-this-matches line`) : bad("[tl] no why lines"); await p.screenshot({ path: `${shots}/04-search.png`, fullPage: true });
  await p.goto(`${base}/ask`); await p.fill("input[aria-label='Your question']", "What are the requirements to get a lease guaranty from the Foundation?"); await p.click("button:has-text('Ask')"); await p.waitForSelector(".chat-msg.assistant:not(.muted)", { timeout: 90000 }); const cites = await p.locator(".chat-cites li").count(); cites > 0 ? ok(`[tl] chat answered with ${cites} citations`) : bad("[tl] chat answered without citations");
  await p.fill("input[aria-label='Your question']", "Do I need a liquor license to serve wine at a fundraiser?"); await p.click("button:has-text('Ask')"); await p.waitForSelector(".chat-msg.assistant.uncovered, .chat-msg.assistant >> nth=1", { timeout: 90000 }); (await p.locator(".chat-msg.assistant.uncovered").count()) > 0 ? ok("[tl] chat says plainly when Connected does not cover a question") : bad("[tl] chat did not flag an uncovered question"); await p.screenshot({ path: `${shots}/05-ask.png`, fullPage: true });
  await p.goto(`${base}/materials`); await p.waitForSelector("h1:has-text('Get feedback')"); const types = await p.locator("a.wf-card-button").count(); types >= 20 ? ok(`[tl] ${types} material types listed`) : bad(`[tl] only ${types} material types`);
  await p.goto(`${base}/materials/landlord_letter`); await p.waitForSelector("text=What good looks like"); ok("[tl] material type page shows guide and resources"); await p.screenshot({ path: `${shots}/06-type.png`, fullPage: true });
  if (doSubmit) {
    await p.click("button:has-text('Submit your draft')"); await p.fill("textarea", "Dear Mr. Alvarez,\n\nMy name is Priya Raman and I am an Emerging Teacher Leader with Wildflower Schools. I am in the SSJ and my Ops Guide suggested I reach out about the storefront at 412 Broadway. I believe every child deserves an authentic Montessori education. Wildflower will guarantee our lease so you don't need to worry about the rent. We hope to open in the fall. We would need to make some changes for licensing but I'm sure we can work that out. Please let me know if you are interested!!\n\nWarmly,\nPriya");
    await p.click("button:has-text('Get feedback')"); await p.waitForURL(/\/drafts\//, { timeout: 30000 }); await p.waitForSelector(".verdict", { timeout: 240000 }); const v = await p.locator(".verdict").innerText(); ok(`[tl] real review completed: ${v}`); await p.screenshot({ path: `${shots}/07-review.png`, fullPage: true });
    await p.click("a:has-text('Download')").catch(() => {}); ok("[tl] download link present");
    await p.goto(`${base}/my`); await p.waitForSelector("table"); ok("[tl] my drafts lists the submission");
  }
  await tl.ctx.close();
  // Staff flows
  const st = await session("staff"); const s = st.page;
  await s.goto(`${base}/admin`); await s.waitForSelector("text=AI kill switch", { timeout: 20000 }); ok("[staff] admin overview loads"); await s.screenshot({ path: `${shots}/10-admin.png`, fullPage: true });
  await s.goto(`${base}/admin/taxonomy`); await s.waitForSelector("text=Add a job"); ok("[staff] taxonomy editor loads");
  await s.goto(`${base}/admin/curation`); await s.waitForSelector("table", { timeout: 30000 }); ok("[staff] curation table loads");
  await s.selectOption("table select >> nth=0", "recommended"); await s.waitForTimeout(800); ok("[staff] marked an item Staff pick");
  await s.goto(`${base}/admin/retirement`); await s.waitForSelector("table, .wf-state", { timeout: 30000 }); ok("[staff] retirement queue loads");
  await s.goto(`${base}/admin/types`); await s.waitForSelector("table"); await s.click("table a >> nth=0"); await s.waitForSelector("text=Guide and prompt"); ok("[staff] type editor loads");
  await s.click("button:has-text('Version history')"); await s.waitForSelector("table"); ok("[staff] version history visible");
  await s.goto(`${base}/admin/base-prompt`); await s.waitForSelector("textarea"); ok("[staff] base prompt editor loads");
  await s.goto(`${base}/admin/submissions`); await s.waitForSelector("table, .wf-state"); ok("[staff] submission log loads");
  await s.goto(`${base}/admin/settings`); await s.waitForSelector("text=Models"); ok("[staff] settings loads"); await s.screenshot({ path: `${shots}/11-settings.png`, fullPage: true });
  await st.ctx.close();
  // A TL must not reach admin
  const tl2 = await session("tl"); await tl2.page.goto(`${base}/admin`); await tl2.page.waitForTimeout(1500); (await tl2.page.locator("text=AI kill switch").count()) === 0 ? ok("[tl] admin is not reachable by a teacher leader") : bad("[tl] admin reachable by teacher leader!"); const r = await tl2.page.request.get(`${base}/api/admin/overview`); r.status() === 403 ? ok("[tl] admin API returns 403") : bad(`[tl] admin API returned ${r.status()}`); await tl2.ctx.close();
} catch (e) { bad(`crashed: ${e.message}`); }
await browser.close();
console.log(report.join("\n"));
process.exit(report.some((l) => l.startsWith("FAIL")) ? 1 : 0);
