import "dotenv/config";
import pg from "pg";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "./schema.js";

export * from "./schema.js";
export { sql, eq, and, or, desc, asc, inArray, isNull, isNotNull, ne, gt, gte, lt, lte, like, ilike, count, sum, max } from "drizzle-orm";

let pool: pg.Pool | null = null;
let db: NodePgDatabase<typeof schema> | null = null;

export function getPool(): pg.Pool {
  if (!pool) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set");
    const local = /localhost|127\.0\.0\.1|@helium/.test(url);
    pool = new pg.Pool({ connectionString: url, max: 8, ssl: local ? undefined : { rejectUnauthorized: false } });
  }
  return pool;
}
export function getDb(): NodePgDatabase<typeof schema> {
  if (!db) db = drizzle(getPool(), { schema });
  return db;
}
export async function closeDb(): Promise<void> {
  if (pool) { await pool.end(); pool = null; db = null; }
}
export type Db = NodePgDatabase<typeof schema>;
