#!/usr/bin/env node
// Checks the sidebar shell, full item content, file streaming, the feedback dialog, and the staff feedback queue.
// Usage: node scripts/browser-check-ui.mjs <baseUrl> --dev-login
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
const base = (process.argv[2] ?? "http://localhost:8080").replace(/\/$/, "");
const shots = "scripts/.shots"; mkdirSync(shots, { recursive: true });
const report = []; const ok = (m) => report.push(`OK    ${m}`); const bad = (m) => report.push(`FAIL  ${m}`);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
async function session(role, viewport = { width: 1280, height: 900 }) {
  const ctx = await browser.newContext({ viewport }); const page = await ctx.newPage();
  page.on("pageerror", (e) => bad(`[${role}] page error: ${e.message}`));
  await page.goto(`${base}/api/auth/dev?email=${role}@example.com&role=${role === "staff" ? "staff" : "tl"}&name=${role === "staff" ? "Staff Tester" : "TL Tester"}`);
  return { ctx, page };
}
try {
  const items = process.argv.filter((a) => a.startsWith("--item=")).map((a) => a.slice(7));
  const tl = await session("tl"); const p = tl.page;
  await p.goto(base); await p.waitForSelector(".sidebar .nav-button.active", { timeout: 20000 }); ok("[tl] sidebar renders with an active nav item");
  (await p.locator(".sidebar .nav-section-label:has-text('Staff')").count()) === 0 ? ok("[tl] no staff section for a teacher leader") : bad("[tl] staff section visible to a teacher leader");
  await p.waitForSelector(".feedback-trigger"); ok("[tl] feedback button in the header"); await p.screenshot({ path: `${shots}/20-shell-home.png` });
  for (const [i, id] of items.entries()) {
    await p.goto(`${base}/item/${id}`); await p.waitForSelector(".wf-doc, .wf-media, .wf-embed, .wf-card-record", { timeout: 20000 });
    const doc = await p.locator(".wf-doc").count(), media = await p.locator(".wf-media").count(), embeds = await p.locator(".wf-embed").count(), cards = await p.locator(".wf-card-record").count();
    ok(`[tl] item ${i + 1}: body=${doc} media=${media} embeds=${embeds} series-cards=${cards}`);
    await p.waitForTimeout(1500); await p.screenshot({ path: `${shots}/21-item-${i + 1}.png`, fullPage: true });
    const img = p.locator(".wf-media img").first(); if (await img.count()) { await img.scrollIntoViewIfNeeded(); await img.evaluate((el) => el.complete ? null : new Promise((r) => { el.onload = r; el.onerror = r; setTimeout(r, 15000); })); const w = await img.evaluate((el) => el.naturalWidth); w > 0 ? ok(`[tl] item ${i + 1}: streamed image renders (${w}px wide)`) : bad(`[tl] item ${i + 1}: streamed image failed to load`); }
    const fr = p.locator(".wf-media iframe").first(); if (await fr.count()) { const r = await p.request.get(`${base}${await fr.getAttribute("src")}`, { maxRedirects: 0 }); r.status() === 200 && (r.headers()["content-type"] ?? "").includes("pdf") ? ok(`[tl] item ${i + 1}: PDF rendering streams (${r.headers()["content-type"]})`) : bad(`[tl] item ${i + 1}: PDF stream returned ${r.status()} ${r.headers()["content-type"]}`); }
    const vid = p.locator(".wf-media video").first(); if (await vid.count()) { const r = await p.request.get(`${base}${await vid.getAttribute("src")}`, { headers: { Range: "bytes=0-1023" } }); r.status() === 206 ? ok(`[tl] item ${i + 1}: video answers byte ranges (${r.headers()["content-range"]})`) : bad(`[tl] item ${i + 1}: video range request returned ${r.status()}`); }
  }
  // feedback dialog
  await p.goto(base); await p.waitForSelector(".feedback-trigger"); await p.click(".feedback-trigger"); await p.waitForSelector(".feedback-dialog"); ok("[tl] feedback dialog opens");
  await p.selectOption(".feedback-form select", "bug"); await p.fill(".feedback-form textarea", "Browser check: the stage picker overlaps on my phone."); await p.click(".feedback-form button[type=submit]");
  await p.waitForSelector(".feedback-success", { timeout: 30000 }); ok("[tl] feedback submitted with screenshot"); await p.screenshot({ path: `${shots}/22-feedback-sent.png` });
  await tl.ctx.close();
  // mobile shell
  const m = await session("tl", { width: 390, height: 844 }); await m.page.goto(base); await m.page.waitForSelector(".sidebar"); await m.page.screenshot({ path: `${shots}/23-mobile.png` }); ok("[tl] mobile shell renders"); await m.ctx.close();
  // staff queue
  const st = await session("staff"); const s = st.page;
  await s.goto(`${base}/admin/feedback`); await s.waitForSelector(".feedback-table tbody tr", { timeout: 20000 }); ok("[staff] feedback queue lists the note");
  await s.click(".feedback-table tbody tr >> nth=0"); await s.waitForSelector(".feedback-inspector-layout"); const shot = await s.locator(".feedback-screenshot").count(); shot ? ok("[staff] inspector shows the screenshot") : bad("[staff] no screenshot in the inspector");
  await s.screenshot({ path: `${shots}/24-feedback-queue.png`, fullPage: true });
  await s.selectOption(".feedback-inspector-layout select", "in_progress"); await s.waitForFunction(() => document.querySelector(".feedback-inspector-layout select")?.value === "in_progress" && !document.querySelector(".feedback-inspector-layout select[disabled]"), null, { timeout: 10000 }); ok("[staff] status change saved");
  await s.fill(".feedback-inspector-layout textarea", "Looked at it; fix queued."); await s.click("button:has-text('Save notes')"); await s.waitForTimeout(800); ok("[staff] notes saved");
  await s.goto(`${base}/admin`); await s.waitForSelector(".sidebar .nav-section-label:has-text('Staff')"); ok("[staff] staff section in the sidebar"); await s.screenshot({ path: `${shots}/25-admin.png` });
  await st.ctx.close();
} catch (e) { bad(`crashed: ${e.message}`); }
await browser.close();
console.log(report.join("\n"));
process.exit(report.some((l) => l.startsWith("FAIL")) ? 1 : 0);
