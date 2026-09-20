import "dotenv/config";
// Smoke test for native items against the configured database and Google service account.
// Usage: tsx src/cli/native-smoke.ts <google-link> [path-to-file]
import { readFileSync } from "node:fs";
import { eq, getDb, items, users } from "@wfw/db";
import { createNativeItem } from "../routes/native.js";
import { readNativeContent } from "../services/native.js";
const [link, file] = process.argv.slice(2);
const db = getDb();
const [u] = await db.select({ id: users.id }).from(users).limit(1);
if (!u) throw new Error("no users yet");
if (link) {
  const r = await createNativeItem({ kind: "google", url: link, status: "published", authorUserId: u.id, by: "smoke" });
  const [it] = await db.select().from(items).where(eq(items.id, r.id));
  console.log("google item:", { id: r.id, title: it?.title, kind: it?.googleKind, chars: it?.bodyText?.length ?? 0, htmlChars: it?.bodyHtml?.length ?? 0, language: it?.language, summary: (it?.summary ?? "").slice(0, 120) });
}
if (file) {
  const buf = readFileSync(file); const name = file.split("/").pop()!;
  const r = await createNativeItem({ kind: "file", file: { buffer: buf, originalname: name, mimetype: "application/octet-stream", size: buf.length } as Express.Multer.File, status: "published", authorUserId: u.id, by: "smoke" });
  const [it] = await db.select().from(items).where(eq(items.id, r.id));
  console.log("file item:", { id: r.id, title: it?.title, nativeKind: it?.nativeKind, googleKind: it?.googleKind, mime: it?.driveMime, url: it?.url, chars: it?.bodyText?.length ?? 0 });
  console.log("re-read:", (await readNativeContent(it!)).status);
}
process.exit(0);
