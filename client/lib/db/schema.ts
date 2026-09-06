/**
 * Schema barrel.
 *
 * Split by plane rather than by feature:
 *   tables/community.ts — users, posts, likes, comments, legacy city feeds
 *   tables/platform.ts  — datasets, uploads, ingestion jobs, queue, metrics
 *   tables/gtfs.ts      — normalized GTFS entities
 *
 * Everything re-exports from here, so `@/lib/db` and drizzle-kit keep seeing a
 * single schema module and no existing import had to change.
 */

export * from "./tables/community";
export * from "./tables/platform";
export * from "./tables/gtfs";
