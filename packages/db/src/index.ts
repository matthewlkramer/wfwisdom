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
    pool = new pg.Pool({ connectionString: url, max: 8, keepAlive: true, ssl: local ? undefined : { rejectUnauthorized: false } });
    // A managed Postgres drops idle connections whenever it restarts or scales ("terminating
    // connection due to administrator command"). pg reports that by emitting 'error' on the pool,
    // and an unhandled 'error' event takes the whole process down. Log it and carry on: pg discards
    // the broken client, and the next query opens a fresh one.
    pool.on("error", (err: Error) => { console.error(`[db] idle client dropped, recovering: ${err.message}`); });
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
