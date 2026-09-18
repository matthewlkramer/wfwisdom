import "dotenv/config";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { closeDb, getDb } from "./index.js";
const here = dirname(fileURLToPath(import.meta.url));
try {
  await migrate(getDb(), { migrationsFolder: resolve(here, "../migrations") });
  console.log("Database migrations completed");
} finally { await closeDb(); }
