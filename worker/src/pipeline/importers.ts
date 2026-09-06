import type { Sql } from "postgres";

import { flatten, readCsv, type CsvHeader, type CsvRow } from "../csv.ts";
import { copyInBatches, type CopyValue } from "../copy.ts";
import { parseGtfsTime } from "../../../client/lib/gtfs/spec.ts";

/**
 * Per-file GTFS importers.
 *
 * Each one streams a member out of the archive, parses it as CSV, and COPYs it
 * into its table. Nothing accumulates across rows except deliberately small
 * lookup sets used for referential checks.
 *
 * Every importer follows the same contract: it returns the number of rows
 * written and appends any validation findings to `issues`, rather than
 * throwing. A feed with a few malformed rows should import with warnings; only
 * a feed we cannot make sense of at all is a failure.
 */

export interface IssueCollector {
  add(issue: {
    severity: "error" | "warning" | "info";
    code: string;
    file: string;
    message: string;
    sample?: unknown;
  }): void;
}

/**
 * Accumulates issues by code, counting occurrences and keeping a few samples.
 *
 * The counting is the point: "trips.txt references 17 unknown route_ids, e.g.
 * R-99, R-104" is actionable. Seventeen separate rows saying "unknown route" is
 * a wall of noise that hides the one number the user needs.
 */
export class Issues implements IssueCollector {
  private readonly byKey = new Map<
    string,
    {
      severity: "error" | "warning" | "info";
      code: string;
      file: string;
      message: string;
      count: number;
      sample: unknown[];
    }
  >();

  add(issue: {
    severity: "error" | "warning" | "info";
    code: string;
    file: string;
    message: string;
    sample?: unknown;
  }): void {
    const key = `${issue.code}:${issue.file}`;
    const existing = this.byKey.get(key);
    if (existing) {
      existing.count++;
      if (existing.sample.length < 10 && issue.sample !== undefined) {
        existing.sample.push(issue.sample);
      }
      return;
    }
    this.byKey.set(key, {
      ...issue,
      count: 1,
      sample: issue.sample !== undefined ? [issue.sample] : [],
    });
  }

  all() {
    return [...this.byKey.values()];
  }

  get errorCount(): number {
    return this.all().filter((i) => i.severity === "error").length;
  }
}

export interface ImportContext {
  sql: Sql;
  datasetId: string;
  issues: Issues;
  /** Streams the named member's bytes; throws if the member is absent. */
  open(file: string): AsyncIterable<Uint8Array>;
  /** True when the archive contains this member. */
  has(file: string): boolean;
  onProgress?: (rows: number) => void;
}

// ── Field helpers ───────────────────────────────────────────────────────────

function num(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === "") return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function int(value: string): number | null {
  const parsed = num(value);
  return parsed === null ? null : Math.trunc(parsed);
}

function bool01(value: string): boolean {
  return value.trim() === "1";
}

/** GTFS `YYYYMMDD` → `YYYY-MM-DD`, or null. */
function gtfsDate(value: string): string | null {
  const trimmed = value.trim();
  if (!/^\d{8}$/.test(trimmed)) return null;
  return `${trimmed.slice(0, 4)}-${trimmed.slice(4, 6)}-${trimmed.slice(6, 8)}`;
}

/** Six hex digits without '#', as GTFS stores colours. Null if malformed. */
function color(value: string): string | null {
  const trimmed = value.trim().replace(/^#/, "");
  return /^[0-9a-fA-F]{6}$/.test(trimmed) ? trimmed.toUpperCase() : null;
}

async function importFile(
  ctx: ImportContext,
  file: string,
  table: string,
  columns: string[],
  toRow: (row: CsvRow, header: CsvHeader) => CopyValue[] | null
): Promise<number> {
  const { header, rows } = await readCsv(ctx.open(file));
  return copyInBatches(ctx.sql, table, columns, rows, (row) => toRow(row, header), {
    onProgress: ctx.onProgress,
  });
}

// ── agency.txt ──────────────────────────────────────────────────────────────

export async function importAgencies(ctx: ImportContext): Promise<number> {
  return importFile(
    ctx,
    "agency.txt",
    "gtfs_agencies",
    ["dataset_id", "agency_id", "name", "url", "timezone", "lang", "phone", "fare_url"],
    (row, header) => {
      const name = header.get(row, "agency_name").trim();
      if (!name) {
        ctx.issues.add({
          severity: "warning",
          code: "agency_missing_name",
          file: "agency.txt",
          message: "An agency has no agency_name and was skipped.",
          sample: row.line,
        });
        return null;
      }
      return [
        ctx.datasetId,
        // agency_id is optional in single-agency feeds; a stable fallback keeps
        // routes.agency_id joinable.
        header.getOptional(row, "agency_id") ?? "__default__",
        name,
        header.getOptional(row, "agency_url"),
        header.getOptional(row, "agency_timezone"),
        header.getOptional(row, "agency_lang"),
        header.getOptional(row, "agency_phone"),
        header.getOptional(row, "agency_fare_url"),
      ];
    }
  );
}

// ── stops.txt ───────────────────────────────────────────────────────────────

export interface StopsResult {
  rows: number;
  stopIds: Set<string>;
  /** [west, south, east, north] over stops that had coordinates. */
  bbox: [number, number, number, number] | null;
}

export async function importStops(ctx: ImportContext): Promise<StopsResult> {
  const stopIds = new Set<string>();
  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;

  const rows = await importFile(
    ctx,
    "stops.txt",
    "gtfs_stops",
    [
      "dataset_id", "stop_id", "code", "name", "description", "lat", "lon",
      "zone_id", "location_type", "parent_station", "timezone",
      "wheelchair_boarding", "platform_code",
    ],
    (row, header) => {
      const stopId = header.get(row, "stop_id").trim();
      if (!stopId) {
        ctx.issues.add({
          severity: "warning",
          code: "stop_missing_id",
          file: "stops.txt",
          message: "A stop has no stop_id and was skipped.",
          sample: row.line,
        });
        return null;
      }
      if (stopIds.has(stopId)) {
        // A duplicate primary key would abort the COPY, so it must be dropped
        // rather than reported and passed through.
        ctx.issues.add({
          severity: "warning",
          code: "duplicate_stop_id",
          file: "stops.txt",
          message:
            "Some stop_ids appear more than once. Only the first occurrence of each was imported.",
          sample: stopId,
        });
        return null;
      }
      stopIds.add(flatten(stopId));

      const lat = num(header.get(row, "stop_lat"));
      const lon = num(header.get(row, "stop_lon"));
      const locationType = int(header.get(row, "location_type")) ?? 0;

      // Coordinates are required for stops and platforms (types 0 and 4);
      // stations and nodes may legitimately omit them.
      if ((lat === null || lon === null) && locationType !== 1 && locationType !== 3) {
        ctx.issues.add({
          severity: "warning",
          code: "stop_missing_coordinates",
          file: "stops.txt",
          message:
            "Some stops have no coordinates and will not appear on the map.",
          sample: stopId,
        });
      } else if (lat !== null && lon !== null) {
        if (Math.abs(lat) > 90 || Math.abs(lon) > 180) {
          ctx.issues.add({
            severity: "warning",
            code: "stop_coordinates_out_of_range",
            file: "stops.txt",
            message: "Some stops have coordinates outside the valid range.",
            sample: stopId,
          });
        } else {
          if (lon < west) west = lon;
          if (lon > east) east = lon;
          if (lat < south) south = lat;
          if (lat > north) north = lat;
        }
      }

      return [
        ctx.datasetId,
        stopId,
        header.getOptional(row, "stop_code"),
        header.get(row, "stop_name").trim() || stopId,
        header.getOptional(row, "stop_desc"),
        lat,
        lon,
        header.getOptional(row, "zone_id"),
        locationType,
        header.getOptional(row, "parent_station"),
        header.getOptional(row, "stop_timezone"),
        int(header.get(row, "wheelchair_boarding")),
        header.getOptional(row, "platform_code"),
      ];
    }
  );

  return {
    rows,
    stopIds,
    bbox: Number.isFinite(west) ? [west, south, east, north] : null,
  };
}

// ── routes.txt ──────────────────────────────────────────────────────────────

export interface RoutesResult {
  rows: number;
  routeIds: Set<string>;
  byType: Record<string, number>;
}

export async function importRoutes(ctx: ImportContext): Promise<RoutesResult> {
  const routeIds = new Set<string>();
  const byType: Record<string, number> = {};

  const rows = await importFile(
    ctx,
    "routes.txt",
    "gtfs_routes",
    [
      "dataset_id", "route_id", "agency_id", "short_name", "long_name",
      "description", "type", "color", "text_color", "sort_order",
    ],
    (row, header) => {
      const routeId = header.get(row, "route_id").trim();
      if (!routeId) {
        ctx.issues.add({
          severity: "warning",
          code: "route_missing_id",
          file: "routes.txt",
          message: "A route has no route_id and was skipped.",
          sample: row.line,
        });
        return null;
      }
      if (routeIds.has(routeId)) {
        ctx.issues.add({
          severity: "warning",
          code: "duplicate_route_id",
          file: "routes.txt",
          message:
            "Some route_ids appear more than once. Only the first occurrence of each was imported.",
          sample: routeId,
        });
        return null;
      }

      const type = int(header.get(row, "route_type"));
      if (type === null) {
        ctx.issues.add({
          severity: "error",
          code: "route_missing_type",
          file: "routes.txt",
          message:
            "Some routes have no route_type, which is required. Those routes were skipped.",
          sample: routeId,
        });
        return null;
      }

      routeIds.add(flatten(routeId));
      byType[String(type)] = (byType[String(type)] ?? 0) + 1;

      const shortName = header.getOptional(row, "route_short_name");
      const longName = header.getOptional(row, "route_long_name");
      if (!shortName && !longName) {
        ctx.issues.add({
          severity: "warning",
          code: "route_unnamed",
          file: "routes.txt",
          message:
            "Some routes have neither a short nor a long name and will show as their id.",
          sample: routeId,
        });
      }

      return [
        ctx.datasetId,
        routeId,
        header.getOptional(row, "agency_id"),
        shortName,
        longName,
        header.getOptional(row, "route_desc"),
        type,
        color(header.get(row, "route_color")),
        color(header.get(row, "route_text_color")),
        int(header.get(row, "route_sort_order")),
      ];
    }
  );

  return { rows, routeIds, byType };
}

// ── calendar.txt / calendar_dates.txt ───────────────────────────────────────

export interface ServicesResult {
  rows: number;
  serviceIds: Set<string>;
  start: string | null;
  end: string | null;
}

export async function importServices(ctx: ImportContext): Promise<ServicesResult> {
  const serviceIds = new Set<string>();
  let start: string | null = null;
  let end: string | null = null;
  let rows = 0;

  if (ctx.has("calendar.txt")) {
    rows += await importFile(
      ctx,
      "calendar.txt",
      "gtfs_services",
      [
        "dataset_id", "service_id", "monday", "tuesday", "wednesday",
        "thursday", "friday", "saturday", "sunday", "start_date", "end_date",
      ],
      (row, header) => {
        const serviceId = header.get(row, "service_id").trim();
        if (!serviceId || serviceIds.has(serviceId)) return null;
        serviceIds.add(flatten(serviceId));

        const from = gtfsDate(header.get(row, "start_date"));
        const to = gtfsDate(header.get(row, "end_date"));
        if (from && (start === null || from < start)) start = from;
        if (to && (end === null || to > end)) end = to;

        return [
          ctx.datasetId,
          serviceId,
          bool01(header.get(row, "monday")),
          bool01(header.get(row, "tuesday")),
          bool01(header.get(row, "wednesday")),
          bool01(header.get(row, "thursday")),
          bool01(header.get(row, "friday")),
          bool01(header.get(row, "saturday")),
          bool01(header.get(row, "sunday")),
          from,
          to,
        ];
      }
    );
  }

  if (ctx.has("calendar_dates.txt")) {
    // Feeds that use calendar_dates exclusively have no calendar.txt row for
    // these service ids, so the exception rows are the only record of them.
    const seen = new Set<string>();
    await importFile(
      ctx,
      "calendar_dates.txt",
      "gtfs_service_exceptions",
      ["dataset_id", "service_id", "date", "exception_type"],
      (row, header) => {
        const serviceId = header.get(row, "service_id").trim();
        const date = gtfsDate(header.get(row, "date"));
        const exceptionType = int(header.get(row, "exception_type"));
        if (!serviceId || !date || exceptionType === null) {
          ctx.issues.add({
            severity: "warning",
            code: "calendar_date_malformed",
            file: "calendar_dates.txt",
            message: "Some calendar_dates rows were malformed and were skipped.",
            sample: row.line,
          });
          return null;
        }

        const key = `${serviceId}|${date}`;
        if (seen.has(key)) return null;
        seen.add(key);

        serviceIds.add(flatten(serviceId));
        if (start === null || date < start) start = date;
        if (end === null || date > end) end = date;

        return [ctx.datasetId, serviceId, date, exceptionType];
      }
    );
  }

  return { rows, serviceIds, start, end };
}

// ── shapes.txt ──────────────────────────────────────────────────────────────

/**
 * Shapes collapse from one row per point to one row per shape.
 *
 * `shapes.txt` can be millions of rows, but no consumer ever wants a single
 * point — they want the polyline. Aggregating here turns millions of rows into
 * thousands of arrays, and it is safe on memory because the file is sorted by
 * shape and sequence in practice; shapes are flushed as soon as the shape_id
 * changes, with an out-of-order fallback.
 */
export async function importShapes(
  ctx: ImportContext
): Promise<{ rows: number; shapeIds: Set<string> }> {
  if (!ctx.has("shapes.txt")) return { rows: 0, shapeIds: new Set() };

  const { header, rows: csvRows } = await readCsv(ctx.open("shapes.txt"));
  const shapeIds = new Set<string>();

  interface Pending {
    shapeId: string;
    points: [number, number, number][]; // lon, lat, sequence
  }

  async function* aggregate(): AsyncGenerator<Pending> {
    let current: Pending | null = null;
    // Shapes seen out of order are held back; a feed that interleaves shapes
    // is rare but must not silently lose points.
    const outOfOrder = new Map<string, [number, number, number][]>();

    for await (const row of csvRows) {
      const shapeId = header.get(row, "shape_id").trim();
      const lat = num(header.get(row, "shape_pt_lat"));
      const lon = num(header.get(row, "shape_pt_lon"));
      const sequence = int(header.get(row, "shape_pt_sequence")) ?? 0;

      if (!shapeId || lat === null || lon === null) {
        ctx.issues.add({
          severity: "warning",
          code: "shape_point_malformed",
          file: "shapes.txt",
          message: "Some shape points were malformed and were skipped.",
          sample: row.line,
        });
        continue;
      }

      if (current && current.shapeId === shapeId) {
        current.points.push([lon, lat, sequence]);
        continue;
      }

      if (current) {
        if (shapeIds.has(shapeId)) {
          // We already emitted this shape — the file is interleaved.
          const held = outOfOrder.get(shapeId) ?? [];
          held.push([lon, lat, sequence]);
          outOfOrder.set(shapeId, held);
          continue;
        }
        yield current;
      }
      current = { shapeId, points: [[lon, lat, sequence]] };
      shapeIds.add(flatten(shapeId));
    }

    if (current) yield current;

    if (outOfOrder.size > 0) {
      ctx.issues.add({
        severity: "warning",
        code: "shapes_not_grouped",
        file: "shapes.txt",
        message:
          "shapes.txt interleaves points from different shapes. The affected shapes may be incomplete.",
        sample: [...outOfOrder.keys()].slice(0, 5),
      });
    }
  }

  const written = await copyInBatches(
    ctx.sql,
    "gtfs_shapes",
    ["dataset_id", "shape_id", "points", "point_count", "simplified"],
    aggregate(),
    (shape) => {
      if (shape.points.length < 2) {
        ctx.issues.add({
          severity: "warning",
          code: "shape_too_short",
          file: "shapes.txt",
          message: "Some shapes have fewer than two points and cannot be drawn.",
          sample: shape.shapeId,
        });
        return null;
      }

      shape.points.sort((a, b) => a[2] - b[2]);
      // 5 decimal places is about a metre — well past what a map needs, and it
      // roughly halves the stored JSON.
      const points = shape.points.map(
        ([lon, lat]) => [round5(lon), round5(lat)] as [number, number]
      );

      return [
        ctx.datasetId,
        shape.shapeId,
        JSON.stringify(points),
        points.length,
        JSON.stringify(simplify(points, 0.0001)),
      ];
    },
    { onProgress: ctx.onProgress }
  );

  return { rows: written, shapeIds };
}

function round5(value: number): number {
  return Math.round(value * 1e5) / 1e5;
}

/**
 * Douglas–Peucker simplification for the low-zoom copy.
 *
 * Iterative rather than recursive: a shape with 50,000 points would blow the
 * stack in the naive recursive form, and long-distance rail shapes reach that.
 */
function simplify(
  points: [number, number][],
  tolerance: number
): [number, number][] {
  if (points.length <= 2) return points;

  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;

  const stack: [number, number][] = [[0, points.length - 1]];
  while (stack.length > 0) {
    const [first, last] = stack.pop()!;
    if (last <= first + 1) continue;

    let maxDistance = 0;
    let index = first;
    for (let i = first + 1; i < last; i++) {
      const distance = perpendicularDistance(points[i], points[first], points[last]);
      if (distance > maxDistance) {
        maxDistance = distance;
        index = i;
      }
    }

    if (maxDistance > tolerance) {
      keep[index] = 1;
      stack.push([first, index], [index, last]);
    }
  }

  const out: [number, number][] = [];
  for (let i = 0; i < points.length; i++) if (keep[i]) out.push(points[i]);
  return out;
}

function perpendicularDistance(
  point: [number, number],
  start: [number, number],
  end: [number, number]
): number {
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  if (dx === 0 && dy === 0) {
    return Math.hypot(point[0] - start[0], point[1] - start[1]);
  }
  const numerator = Math.abs(
    dy * point[0] - dx * point[1] + end[0] * start[1] - end[1] * start[0]
  );
  return numerator / Math.hypot(dx, dy);
}

// ── trips.txt ───────────────────────────────────────────────────────────────

export interface TripsResult {
  rows: number;
  tripIds: Set<string>;
}

export async function importTrips(
  ctx: ImportContext,
  known: { routeIds: Set<string>; serviceIds: Set<string>; shapeIds: Set<string> }
): Promise<TripsResult> {
  const tripIds = new Set<string>();

  const rows = await importFile(
    ctx,
    "trips.txt",
    "gtfs_trips",
    [
      "dataset_id", "trip_id", "route_id", "service_id", "headsign",
      "short_name", "direction_id", "block_id", "shape_id",
      "wheelchair_accessible", "bikes_allowed",
    ],
    (row, header) => {
      const tripId = header.get(row, "trip_id").trim();
      const routeId = header.get(row, "route_id").trim();
      const serviceId = header.get(row, "service_id").trim();

      if (!tripId || !routeId || !serviceId) {
        ctx.issues.add({
          severity: "warning",
          code: "trip_missing_required_field",
          file: "trips.txt",
          message:
            "Some trips are missing trip_id, route_id or service_id and were skipped.",
          sample: row.line,
        });
        return null;
      }
      if (tripIds.has(tripId)) {
        ctx.issues.add({
          severity: "warning",
          code: "duplicate_trip_id",
          file: "trips.txt",
          message:
            "Some trip_ids appear more than once. Only the first occurrence of each was imported.",
          sample: tripId,
        });
        return null;
      }

      // Referential checks. These are the findings that make a failure
      // message actionable, and they are warnings rather than errors because
      // the rest of the feed is still worth importing.
      if (!known.routeIds.has(routeId)) {
        ctx.issues.add({
          severity: "error",
          code: "unknown_route_reference",
          file: "trips.txt",
          message:
            "trips.txt references route_ids that do not exist in routes.txt. Those trips will not appear under any route.",
          sample: routeId,
        });
      }
      if (!known.serviceIds.has(serviceId)) {
        ctx.issues.add({
          severity: "warning",
          code: "unknown_service_reference",
          file: "trips.txt",
          message:
            "trips.txt references service_ids with no calendar entry. Those trips have no service dates.",
          sample: serviceId,
        });
      }

      const shapeId = header.getOptional(row, "shape_id");
      if (shapeId && !known.shapeIds.has(shapeId)) {
        ctx.issues.add({
          severity: "warning",
          code: "unknown_shape_reference",
          file: "trips.txt",
          message:
            "trips.txt references shape_ids that are not in shapes.txt. Those trips will be drawn stop-to-stop.",
          sample: shapeId,
        });
      }

      tripIds.add(flatten(tripId));

      return [
        ctx.datasetId,
        tripId,
        routeId,
        serviceId,
        header.getOptional(row, "trip_headsign"),
        header.getOptional(row, "trip_short_name"),
        int(header.get(row, "direction_id")),
        header.getOptional(row, "block_id"),
        shapeId,
        int(header.get(row, "wheelchair_accessible")),
        int(header.get(row, "bikes_allowed")),
      ];
    }
  );

  return { rows, tripIds };
}

// ── stop_times.txt ──────────────────────────────────────────────────────────

/**
 * The big one: millions of rows.
 *
 * Referential checks here are *sampled* rather than exhaustive. Recording every
 * dangling reference would mean an unbounded Set alongside a 5M-row stream, and
 * the user's answer is the same whether 400,000 rows or 12 are affected: the
 * feed's trip ids do not line up. We count all of them but only keep samples.
 */
export async function importStopTimes(
  ctx: ImportContext,
  known: { tripIds: Set<string>; stopIds: Set<string> }
): Promise<{ rows: number }> {
  // Duplicate (trip_id, stop_sequence) violates the primary key and would abort
  // the whole COPY batch, so duplicates must be dropped before they are sent.
  //
  // The obvious implementation — one Set holding every row's key — costs
  // hundreds of megabytes at 5M rows, which defeats the bounded-memory design
  // the rest of the pipeline is built around. stop_times.txt is grouped by trip
  // in every real feed, so instead we hold sequences for the *current* trip only
  // and remember which trips have been closed. A trip that reappears after being
  // closed (an interleaved file) falls back to a per-trip set, which stays empty
  // for well-formed feeds.
  let currentTrip: string | null = null;
  let currentSequences = new Set<number>();
  const closedTrips = new Set<string>();
  const reopened = new Map<string, Set<number>>();

  const isDuplicate = (tripId: string, sequence: number): boolean => {
    if (tripId === currentTrip) {
      if (currentSequences.has(sequence)) return true;
      currentSequences.add(sequence);
      return false;
    }

    if (closedTrips.has(tripId)) {
      let seen = reopened.get(tripId);
      if (!seen) {
        seen = new Set<number>();
        reopened.set(tripId, seen);
      }
      if (seen.has(sequence)) return true;
      seen.add(sequence);
      return false;
    }

    if (currentTrip !== null) closedTrips.add(currentTrip);
    currentTrip = flatten(tripId);
    currentSequences = new Set<number>([sequence]);
    return false;
  };

  let unknownTrips = 0;
  let unknownStops = 0;

  const rows = await importFile(
    ctx,
    "stop_times.txt",
    "gtfs_stop_times",
    [
      "dataset_id", "trip_id", "stop_sequence", "stop_id", "arrival_time",
      "departure_time", "stop_headsign", "pickup_type", "drop_off_type",
      "shape_dist_traveled", "timepoint",
    ],
    (row, header) => {
      const tripId = header.get(row, "trip_id").trim();
      const stopId = header.get(row, "stop_id").trim();
      const stopSequence = int(header.get(row, "stop_sequence"));

      if (!tripId || !stopId || stopSequence === null) {
        ctx.issues.add({
          severity: "warning",
          code: "stop_time_missing_required_field",
          file: "stop_times.txt",
          message:
            "Some stop_times rows are missing trip_id, stop_id or stop_sequence and were skipped.",
          sample: row.line,
        });
        return null;
      }

      if (isDuplicate(tripId, stopSequence)) {
        ctx.issues.add({
          severity: "warning",
          code: "duplicate_stop_time",
          file: "stop_times.txt",
          message:
            "Some trips repeat a stop_sequence value. Only the first row for each was imported.",
          sample: tripId,
        });
        return null;
      }

      if (!known.tripIds.has(tripId)) unknownTrips++;
      if (!known.stopIds.has(stopId)) unknownStops++;

      return [
        ctx.datasetId,
        tripId,
        stopSequence,
        stopId,
        parseGtfsTime(header.get(row, "arrival_time")),
        parseGtfsTime(header.get(row, "departure_time")),
        header.getOptional(row, "stop_headsign"),
        int(header.get(row, "pickup_type")),
        int(header.get(row, "drop_off_type")),
        num(header.get(row, "shape_dist_traveled")),
        int(header.get(row, "timepoint")),
      ];
    }
  );

  if (reopened.size > 0) {
    ctx.issues.add({
      severity: "warning",
      code: "stop_times_not_grouped",
      file: "stop_times.txt",
      message:
        "stop_times.txt is not grouped by trip_id. It was imported, but duplicate rows far apart in the file may not have been detected.",
      sample: [...reopened.keys()].slice(0, 5),
    });
  }

  if (unknownTrips > 0) {
    ctx.issues.add({
      severity: "error",
      code: "unknown_trip_reference",
      file: "stop_times.txt",
      message: `${unknownTrips.toLocaleString()} stop_times rows reference trip_ids that do not exist in trips.txt. Those stop times are not reachable from any trip.`,
    });
  }
  if (unknownStops > 0) {
    ctx.issues.add({
      severity: "error",
      code: "unknown_stop_reference",
      file: "stop_times.txt",
      message: `${unknownStops.toLocaleString()} stop_times rows reference stop_ids that do not exist in stops.txt. Those calls have no location.`,
    });
  }

  return { rows };
}
