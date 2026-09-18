#!/usr/bin/env node
// Checks the map explorer, school materials, the writing workspace (with a real "Draft it for me"), and the drafts pages.
// Usage: node scripts/browser-check-workspace.mjs <baseUrl> [--submit]
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
const base = (process.argv[2] ?? "http://localhost:8080").replace(/\/$/, ""); const doSubmit = process.argv.includes("--submit");
const shots = "scripts/.shots"; mkdirSync(shots, { recursive: true });
const report = []; const ok = (m) => report.push(`OK    ${m}`); const bad = (m) => report.push(`FAIL  ${m}`);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } }); const p = await ctx.newPage();
p.on("pageerror", (e) => bad(`page error: ${e.message}`));
try {
  await p.goto(`${base}/api/auth/dev?email=priya@example.com&role=tl&name=Priya%20Raman`);
  // Map explorer
  await p.goto(`${base}/map`); await p.waitForSelector(".map-jobs button.active", { timeout: 20000 }); await p.waitForSelector(".map-subjob .wf-card-record", { timeout: 20000 });
  ok(`map: ${await p.locator(".map-jobs button").count()} jobs, ${await p.locator(".map-subjob").count()} sub-jobs shown with ${await p.locator(".map-subjob .wf-card-record").count()} preview cards`);
  await p.click(".stage-rail button:has-text('Planning')"); await p.waitForTimeout(800); ok(`map: Planning filter leaves ${await p.locator(".map-jobs button").count()} jobs`); await p.screenshot({ path: `${shots}/40-map.png`, fullPage: true });
  await p.click(".map-jobs button:has-text('Find and set up your space')"); await p.waitForSelector(".map-detail-header h2:has-text('space')", { timeout: 15000 }); ok("map: switching job updates the detail pane");
  await p.click(".map-subjob-all >> nth=0"); await p.waitForSelector("h1", { timeout: 15000 }); ok("map: 'All resources' opens the sub-job page");
  // School materials
  await p.goto(`${base}/materials`); await p.waitForSelector(".school-panel"); await p.click(".school-panel button:has-text('Manage')").catch(() => {});
  await p.setInputFiles(".school-panel input[type=file]", "/tmp/claude-0/-home-user/52b7d7c8-70a2-55a8-8fb4-7dc2ee78887c/scratchpad/marigold.txt"); await p.waitForSelector(".school-list li:has-text('marigold')", { timeout: 20000 }); ok("school: uploaded a document");
  await p.fill(".school-link-form input", "https://www.wildflowerschools.org/"); await p.click(".school-link-form button"); await p.waitForSelector(".school-list li >> nth=1", { timeout: 40000 }).then(() => ok("school: added a website link")).catch(() => bad("school: website link did not get added"));
  await p.screenshot({ path: `${shots}/41-school.png`, fullPage: true });
  // Writing workspace
  await p.goto(`${base}/materials/landlord_letter`); await p.waitForSelector(".writing-area", { timeout: 20000 }); ok("workspace: writing box shown");
  (await p.locator(".objectives li").count()) >= 3 ? ok("workspace: objectives listed") : bad("workspace: no objectives");
  await p.waitForSelector("text=Suggested for your school", { timeout: 60000 }).then(() => ok("workspace: suggestions for the school appear")).catch(() => bad("workspace: no suggestions for the school"));
  await p.click("button:has-text('What good looks like')"); await p.waitForSelector(".guide-panel"); ok("workspace: guide expands"); await p.click("button:has-text('Hide the guide')");
  await p.fill(".writing-area", "Notes: storefront at 412 Broadway, owner Mr. Alvarez. Want a 20 minute call. Opening Sept 2027. Ground floor, 1800 sq ft, outdoor space nearby.");
  await p.click(".draft-button"); await p.waitForSelector("text=Draft ready", { timeout: 180000 }); const drafted = await p.inputValue(".writing-area"); drafted.length > 400 ? ok(`workspace: Draft it for me produced ${drafted.length} characters`) : bad(`workspace: draft too short (${drafted.length})`);
  /Marigold|Priya|412 Broadway/.test(drafted) ? ok("workspace: draft uses school facts") : bad("workspace: draft ignores school facts");
  await p.screenshot({ path: `${shots}/42-workspace.png`, fullPage: true });
  if (doSubmit) {
    await p.fill("input[placeholder*='e.g.']", "Letter to Mr. Alvarez, 412 Broadway");
    await p.click(".wf-form-actions .primary-button"); await p.waitForURL(/\/drafts\//, { timeout: 30000 }); await p.waitForSelector(".verdict-strip", { timeout: 300000 }); ok(`review: verdict ${await p.locator(".verdict").innerText()}`);
    (await p.locator(".note-mark").count()) > 0 ? ok(`review: ${await p.locator(".note-mark").count()} line notes marked in the draft`) : bad("review: no line notes marked in the draft");
    await p.click(".review-pane .wf-tabs button:has-text('Changes')"); await p.waitForSelector(".priority-list li"); ok("review: changes tab");
    await p.click(".review-pane .wf-tabs button:has-text('Line notes')"); await p.waitForSelector(".line-note"); ok("review: line notes tab");
    await p.screenshot({ path: `${shots}/43-review.png`, fullPage: true });
    await p.goto(`${base}/my`); await p.waitForSelector(".draft-chain", { timeout: 20000 }); ok(`drafts: ${await p.locator(".draft-chain").count()} chain(s), stats strip ${await p.locator(".stat-strip .wf-card-metric").count()} cells`); await p.screenshot({ path: `${shots}/44-drafts.png`, fullPage: true });
  } else { await p.goto(`${base}/my`); await p.waitForSelector(".stat-strip, .wf-state", { timeout: 20000 }); ok("drafts: page loads"); await p.screenshot({ path: `${shots}/44-drafts.png`, fullPage: true }); }
} catch (e) { bad(`crashed: ${e.message}`); }
await browser.close();
console.log(report.join("\n"));
process.exit(report.some((l) => l.startsWith("FAIL")) ? 1 : 0);
