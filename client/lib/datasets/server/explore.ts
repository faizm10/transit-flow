import "server-only";

import { and, asc, count, eq, gt, ilike, or, sql, type SQL } from "drizzle-orm";

import {
  db,
  gtfsRoutes,
  gtfsStops,
  gtfsStopTimes,
  gtfsTrips,
} from "@/lib/db";

/**
 * Exploration queries.
 *
 * Every one of these is a *query* against normalized tables, which is the whole
 * point of Phase 3: the old app could only answer questions someone had thought
 * to prebake into a JSON file on a laptop.
 *
 * Two rules hold throughout:
 *
 *  - **Filter and paginate in the database.** Never load a dataset's rows and
 *    slice in JavaScript. A GO feed has 3.1M stop times; the browser must never
 *    see more than a page of anything.
 *  - **Cursor pagination, not OFFSET.** `OFFSET 50000` makes Postgres walk and
 *    discard 50,000 rows, so the last page of a large table is the slowest.
 *    Keyset pagination on the primary key is flat, and it does not skip or
 *    duplicate rows when data changes mid-scroll.
 */

export const PAGE_SIZE = 50;

export interface Page<T> {
  items: T[];
  /** Pass back as `cursor` for the next page; null when there are no more. */
  nextCursor: string | null;
}

// ── Routes ──────────────────────────────────────────────────────────────────

export interface RouteRow {
  routeId: string;
  shortName: string | null;
  longName: string | null;
  type: number;
  color: string | null;
  tripCount: number;
}

/**
 * Routes with their trip counts.
 *
 * The trip count is a correlated subquery rather than a join plus GROUP BY:
 * grouping would scan every trip in the dataset to produce 50 rows, while the
 * subquery runs 50 index lookups on `(dataset_id, route_id)`.
 */
export async function listRoutes({
  datasetId,
  search,
  routeType,
  cursor,
  limit = PAGE_SIZE,
}: {
  datasetId: string;
  search?: string;
  routeType?: number;
  cursor?: string;
  limit?: number;
}): Promise<Page<RouteRow>> {
  const filters: SQL[] = [eq(gtfsRoutes.datasetId, datasetId)];

  if (search) {
    const pattern = `%${escapeLike(search)}%`;
    filters.push(
      or(
        ilike(gtfsRoutes.shortName, pattern),
        ilike(gtfsRoutes.longName, pattern)
      )!
    );
  }
  if (routeType !== undefined) filters.push(eq(gtfsRoutes.type, routeType));
  if (cursor) filters.push(gt(gtfsRoutes.routeId, cursor));

  const rows = await db
    .select({
      routeId: gtfsRoutes.routeId,
      shortName: gtfsRoutes.shortName,
      longName: gtfsRoutes.longName,
      type: gtfsRoutes.type,
      color: gtfsRoutes.color,
      tripCount: sql<number>`(
        SELECT count(*)::int FROM ${gtfsTrips}
         WHERE ${gtfsTrips.datasetId} = ${datasetId}
           AND ${gtfsTrips.routeId} = ${gtfsRoutes.routeId}
      )`,
    })
    .from(gtfsRoutes)
    .where(and(...filters))
    // Ordering by the cursor column is what makes keyset pagination correct.
    .orderBy(asc(gtfsRoutes.routeId))
    // One extra row tells us whether another page exists without a count query.
    .limit(limit + 1);

  return paginate(rows, limit, (row) => row.routeId);
}

// ── Stops ───────────────────────────────────────────────────────────────────

export interface StopRow {
  stopId: string;
  name: string;
  code: string | null;
  lat: number | null;
  lon: number | null;
  routeCount: number | null;
}

export async function listStops({
  datasetId,
  search,
  cursor,
  limit = PAGE_SIZE,
}: {
  datasetId: string;
  search?: string;
  cursor?: string;
  limit?: number;
}): Promise<Page<StopRow>> {
  const filters: SQL[] = [
    eq(gtfsStops.datasetId, datasetId),
    // Stations and generic nodes are not places you board; they clutter a list
    // whose purpose is "where can I catch something".
    or(eq(gtfsStops.locationType, 0), eq(gtfsStops.locationType, 4))!,
  ];

  if (search) {
    // A leading-wildcard ILIKE cannot use the name btree, so this is a scan of
    // the dataset's stops. Measured at 0.5ms over the GO feed's 887 stops —
    // fine, and it stays fine into the tens of thousands. A feed with hundreds
    // of thousands of stops would want a pg_trgm GIN index; adding that
    // extension before anything needs it is speculation.
    const pattern = `%${escapeLike(search)}%`;
    filters.push(
      or(ilike(gtfsStops.name, pattern), ilike(gtfsStops.code, pattern))!
    );
  }
  if (cursor) filters.push(gt(gtfsStops.stopId, cursor));

  const rows = await db
    .select({
      stopId: gtfsStops.stopId,
      name: gtfsStops.name,
      code: gtfsStops.code,
      lat: gtfsStops.lat,
      lon: gtfsStops.lon,
      // Precomputed by the worker's `analyzing` stage. Doing this as a
      // correlated subquery measured 3.9s for one page on the real GO feed —
      // Postgres seq-scanned all 186,901 trips once per stop. See
      // drizzle/0002_stop_route_count.sql.
      routeCount: gtfsStops.routeCount,
    })
    .from(gtfsStops)
    .where(and(...filters))
    .orderBy(asc(gtfsStops.stopId))
    .limit(limit + 1);

  return paginate(rows, limit, (row) => row.stopId);
}

// ── Route detail ────────────────────────────────────────────────────────────

export interface RouteDetail {
  route: RouteRow;
  /** Distinct headsigns, which is how riders actually name a direction. */
  headsigns: { directionId: number | null; headsign: string; trips: number }[];
  /** Stops served, most-called first. */
  stops: { stopId: string; name: string; calls: number }[];
}

export async function getRouteDetail(
  datasetId: string,
  routeId: string
): Promise<RouteDetail | null> {
  const [route] = await db
    .select({
      routeId: gtfsRoutes.routeId,
      shortName: gtfsRoutes.shortName,
      longName: gtfsRoutes.longName,
      type: gtfsRoutes.type,
      color: gtfsRoutes.color,
      tripCount: sql<number>`(
        SELECT count(*)::int FROM ${gtfsTrips}
         WHERE ${gtfsTrips.datasetId} = ${datasetId}
           AND ${gtfsTrips.routeId} = ${routeId}
      )`,
    })
    .from(gtfsRoutes)
    .where(
      and(eq(gtfsRoutes.datasetId, datasetId), eq(gtfsRoutes.routeId, routeId))
    )
    .limit(1);

  if (!route) return null;

  const headsigns = await db
    .select({
      directionId: gtfsTrips.directionId,
      headsign: sql<string>`coalesce(${gtfsTrips.headsign}, '')`,
      trips: count(),
    })
    .from(gtfsTrips)
    .where(
      and(eq(gtfsTrips.datasetId, datasetId), eq(gtfsTrips.routeId, routeId))
    )
    .groupBy(gtfsTrips.directionId, gtfsTrips.headsign)
    .orderBy(sql`count(*) desc`)
    .limit(20);

  // Capped: a long route has hundreds of stops and the page shows the busiest.
  const stops = await db.execute<{
    stop_id: string;
    name: string;
    calls: number;
  }>(sql`
    SELECT st.stop_id, s.name, count(*)::int AS calls
      FROM ${gtfsStopTimes} st
      JOIN ${gtfsTrips} t
        ON t.dataset_id = st.dataset_id AND t.trip_id = st.trip_id
      LEFT JOIN ${gtfsStops} s
        ON s.dataset_id = st.dataset_id AND s.stop_id = st.stop_id
     WHERE st.dataset_id = ${datasetId} AND t.route_id = ${routeId}
     GROUP BY st.stop_id, s.name
     ORDER BY calls DESC
     LIMIT 100
  `);

  return {
    route,
    headsigns: headsigns.map((h) => ({
      directionId: h.directionId,
      headsign: h.headsign || "(no headsign)",
      trips: h.trips,
    })),
    stops: stops.rows.map((r) => ({
      stopId: r.stop_id,
      name: r.name ?? r.stop_id,
      calls: Number(r.calls),
    })),
  };
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function paginate<T>(
  rows: T[],
  limit: number,
  cursorOf: (row: T) => string
): Page<T> {
  if (rows.length <= limit) return { items: rows, nextCursor: null };
  const items = rows.slice(0, limit);
  return { items, nextCursor: cursorOf(items[items.length - 1]) };
}

/**
 * Escape LIKE wildcards in user input.
 *
 * Without this, a search for "%" matches every row — a cheap way to make the
 * database scan a 3M-row table on demand.
 */
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (match) => `\\${match}`);
}
