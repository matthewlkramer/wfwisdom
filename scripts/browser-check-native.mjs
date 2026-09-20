#!/usr/bin/env node
// Share a Google link as a teacher leader, approve it as staff, add a written item and a series, and check the pages.
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
const base = (process.argv[2] ?? "http://localhost:8080").replace(/\/$/, ""); const link = process.argv[3] ?? "https://docs.google.com/document/d/1BRlF2_zhNe86SGgHa6-VlBO-QgirITwCTugSfKie5Fs/edit";
const shots = "scripts/.shots"; mkdirSync(shots, { recursive: true });
const report = []; const ok = (m) => report.push(`OK    ${m}`); const bad = (m) => report.push(`FAIL  ${m}`);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
async function session(role) { const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } }); const p = await ctx.newPage(); p.on("pageerror", (e) => bad(`[${role}] page error: ${e.message}`)); await p.goto(`${base}/api/auth/dev?email=${role}2@example.com&role=${role === "staff" ? "staff" : "tl"}&name=${role === "staff" ? "Staff%20Two" : "Tomas%20Lee"}`); return { ctx, page: p }; }
try {
  const tl = await session("tl"); const p = tl.page;
  await p.goto(`${base}/share`); await p.waitForSelector("h1:has-text('Share your materials')"); ok(`[tl] share page lists ${await p.locator(".share-type").count()} material types`);
  await p.click(".share-type button:has-text('Share yours') >> nth=0"); await p.waitForSelector(".share-form"); await p.fill(".share-form input[aria-label='Google link']", link); await p.fill(".share-form input[placeholder*='What it is']", "We used this for our board's first retreat."); await p.click(".share-form button[type=submit]");
  await p.waitForSelector("text=Thank you", { timeout: 60000 }); ok("[tl] shared a Google Doc for review"); await p.waitForSelector("text=Waiting for staff review"); await p.screenshot({ path: `${shots}/70-share.png`, fullPage: true });
  await tl.ctx.close();
  const st = await session("staff"); const s = st.page;
  await s.goto(`${base}/admin/contributions`); await s.waitForSelector("button:has-text('Review')", { timeout: 20000 }); ok("[staff] contribution appears in the queue"); await s.click("button:has-text('Review')"); await s.waitForSelector("button:has-text('Publish on the map')");
  await s.click(".chip:has-text('Planning')"); await s.screenshot({ path: `${shots}/71-contributions.png`, fullPage: true }); await s.click("button:has-text('Publish on the map')"); await s.waitForSelector("text=Nothing waiting", { timeout: 180000 }); ok("[staff] contribution published");
  await s.click(".chip:has-text('Published')"); await s.waitForSelector(".wf-card h3 a", { timeout: 20000 }); const href = await s.locator(".wf-card h3 a").first().getAttribute("href"); await s.goto(`${base}${href}`); await s.waitForSelector(".wf-doc", { timeout: 20000 }); ok(`[staff] published Google item renders its content (${(await s.locator(".wf-doc").innerText()).length} chars)`);
  (await s.locator("a:has-text('Open in Google')").count()) ? ok("[staff] Open in Google button present") : bad("[staff] no Open in Google button");
  (await s.locator("text=Tomas Lee").count()) ? ok("[staff] contributor shown as author") : bad("[staff] author missing");
  await s.screenshot({ path: `${shots}/72-native-item.png`, fullPage: true });
  await s.click("a:has-text('Edit')"); await s.waitForSelector("h3:has-text('Versions')"); ok(`[staff] edit page shows ${await s.locator("table tbody tr").count()} version(s)`); await s.screenshot({ path: `${shots}/73-edit.png`, fullPage: true });
  await s.goto(`${base}/admin/resources/new`); await s.waitForSelector(".kind-tabs"); await s.click(".kind-tabs button:has-text('Write it here')"); await s.fill("aside input >> nth=0", "How to read a lease: a short primer"); await s.fill("textarea", "# Reading a lease\n\nStart with the **term** and the renewal options.\n\n- Rent and escalation\n- Tenant improvements\n- Who pays for licensing changes\n\nAsk your Ops Guide before signing.");
  await s.selectOption("aside select", { index: 1 }); await s.click(".chip:has-text('Startup')"); await s.click("button:has-text('Add to Wildflower Wisdom')"); await s.waitForURL(/\/item\//, { timeout: 60000 }); await s.waitForSelector(".wf-doc li"); ok("[staff] written item created and renders as HTML"); const textItemUrl = s.url();
  await s.goto(`${base}/admin/resources/new`); await s.waitForSelector(".kind-tabs"); await s.click(".kind-tabs button:has-text('A series')"); await s.fill("aside input >> nth=0", "Space search, start to finish"); await s.fill(".series-builder input", "lease"); await s.waitForSelector(".series-builder ul .link-button", { timeout: 20000 }); await s.click(".series-builder ul .link-button >> nth=0"); await s.fill(".series-builder input", "landlord"); await s.waitForSelector(".series-builder ul .link-button", { timeout: 20000 }); await s.click(".series-builder ul .link-button >> nth=0");
  await s.selectOption("aside select", { index: 1 }); await s.click("button:has-text('Add to Wildflower Wisdom')"); await s.waitForURL(/\/item\//, { timeout: 60000 }); await s.waitForSelector("text=In this series"); ok(`[staff] series created with ${await s.locator(".wf-card-record").count()} items`); await s.screenshot({ path: `${shots}/74-series.png`, fullPage: true });
  await s.click(".wf-card-record .wf-card-title >> nth=0"); await s.waitForSelector(".series-nav", { timeout: 20000 }); ok("[staff] a member of the native series shows the series navigation");
  await s.goto(textItemUrl); await s.click("a:has-text('Edit')"); await s.waitForSelector("textarea"); await s.fill("textarea", "# Reading a lease (revised)\n\nStart with the term.\n"); await s.click("button:has-text('Save')"); await s.waitForTimeout(3000); await s.reload(); await s.waitForSelector("table tbody tr"); const versions = await s.locator("table tbody tr").count(); versions >= 2 ? ok(`[staff] editing text kept ${versions} versions`) : bad(`[staff] expected 2 versions, saw ${versions}`);
  await st.ctx.close();
} catch (e) { bad(`crashed: ${e.message}`); }
await browser.close();
console.log(report.join("\n"));
process.exit(report.some((l) => l.startsWith("FAIL")) ? 1 : 0);
