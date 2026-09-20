#!/usr/bin/env node
// Staff: the Move off Connected panel, an imported item's page and editor. Pass the imported item id as the second argument.
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
const base = (process.argv[2] ?? "http://localhost:8080").replace(/\/$/, ""); const itemId = process.argv[3];
const shots = "scripts/.shots"; mkdirSync(shots, { recursive: true });
const report = []; const ok = (m) => report.push(`OK    ${m}`); const bad = (m) => report.push(`FAIL  ${m}`);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } }); const p = await ctx.newPage(); p.on("pageerror", (e) => bad(`page error: ${e.message}`));
  await p.goto(`${base}/api/auth/dev?email=staff3@example.com&role=staff&name=Staff%20Three`);
  await p.goto(`${base}/admin`); await p.waitForSelector("h2:has-text('Move off Connected')", { timeout: 20000 }); ok("overview shows the Move off Connected panel");
  const still = await p.locator(".wf-card-metric:has-text('Still in Connected') .wf-card-value").innerText(); ok(`still in Connected: ${still}`);
  await p.click("button:has-text('Dry run')"); await p.waitForSelector("text=/Last run: (done|failed)/", { timeout: 180000 }); ok("dry run ran and logged its plan"); await p.screenshot({ path: `${shots}/80-import-panel.png`, fullPage: true });
  if (itemId) {
    await p.goto(`${base}/item/${itemId}`); await p.waitForSelector(".wf-doc", { timeout: 20000 });
    (await p.locator(".wf-doc img[src^='/api/files/native/']").count()) ? ok("imported item renders its Drive image in the body") : bad("no Drive image in the body");
    (await p.locator(".series-nav").count()) ? ok("imported post still shows its Connected series navigation") : bad("series navigation missing for the imported post");
    (await p.locator("a:has-text('Edit')").count()) ? ok("staff Edit link present") : bad("Edit link missing");
    await p.screenshot({ path: `${shots}/81-imported-item.png`, fullPage: true });
    await p.click("a:has-text('Edit')"); await p.waitForSelector("text=Imported from Connected", { timeout: 20000 }); ok("editor shows the import note");
    (await p.locator("text=Files shown with this item").count()) ? ok("editor lists the item's Drive files") : bad("editor does not list files");
    (await p.locator("button:has-text('turn it into a Google Doc')").count()) ? ok("editor offers Google Doc conversion") : bad("no conversion offer");
    await p.screenshot({ path: `${shots}/82-imported-edit.png`, fullPage: true });
  }
  await ctx.close();
} catch (e) { bad(`crashed: ${e.message}`); }
await browser.close();
console.log(report.join("\n"));
process.exit(report.some((l) => l.startsWith("FAIL")) ? 1 : 0);
