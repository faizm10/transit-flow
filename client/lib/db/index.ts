import { neon } from "@neondatabase/serverless";
import { drizzle, type NeonHttpDatabase } from "drizzle-orm/neon-http";
import * as schema from "./schema";

type Schema = typeof schema;

let _db: NeonHttpDatabase<Schema> | null = null;

function getDb(): NeonHttpDatabase<Schema> {
  if (!_db) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error(
        "DATABASE_URL is not set. Add it to .env.local and to Vercel environment variables."
      );
    }
    const sql = neon(connectionString);
    _db = drizzle(sql, { schema });
  }
  return _db;
}

/**
 * Lazy Drizzle client — only connects to Neon on the first actual DB call.
 * Safe to import at module level without DATABASE_URL set at build time.
 */
export const db = new Proxy({} as NeonHttpDatabase<Schema>, {
  get(_target, prop) {
    return (getDb() as unknown as Record<string | symbol, unknown>)[prop];
  },
});

export * from "./schema";
