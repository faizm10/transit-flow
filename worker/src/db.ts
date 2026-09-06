import postgres from "postgres";

import { config } from "./config.ts";

/**
 * Database connection.
 *
 * A TCP connection, not the HTTP driver the Next.js app uses. The worker needs
 * COPY streaming and real transactions, neither of which survives a
 * request-per-statement transport.
 *
 * A small pool: at concurrency 1 the worker uses one connection for the COPY
 * stream and occasionally a second for progress writes. Neon's connection
 * limits are per-project and worth not spending.
 */
export const sql = postgres(config.databaseUrl, {
  max: 4,
  // COPY of a multi-million-row table legitimately takes minutes.
  idle_timeout: 60,
  connect_timeout: 30,
  // Postgres NOTICEs (e.g. "relation already exists") are not worth a log line.
  onnotice: () => {},
  types: {
    // GTFS ids can look numeric; postgres.js must not coerce them.
    bigint: postgres.BigInt,
  },
});

export type Sql = typeof sql;

export async function closeDb(): Promise<void> {
  await sql.end({ timeout: 5 });
}
