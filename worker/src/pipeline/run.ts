import { createHash } from "node:crypto";

import { sql } from "../db.ts";
import { openRangeSource } from "../storage.ts";
import type { ByteRangeSource } from "../zip/rangeZip.ts";
import { log, type Logger } from "../log.ts";
import {
  heartbeat,
  recordEvent,
  recordIssue,
  type ClaimedJob,
  type JobContext,
  type JobError,
} from "../queue.ts";
import {
  readCentralDirectory,
  streamMember,
  ZipFormatError,
  type InflateLimits,
  type ZipMember,
} from "../zip/rangeZip.ts";
import { resolveGtfsLayout } from "../../../client/lib/gtfs/zipLayout.ts";
import type { JobStage } from "../../../client/lib/datasets/stages.ts";
import {
  Issues,
  importAgencies,
  importRoutes,
  importServices,
  importShapes,
  importStops,
  importStopTimes,
  importTrips,
  type ImportContext,
} from "./importers.ts";

/**
 * One ingestion, start to finish.
 *
 * Stages run in dependency order, not archive order: routes and services must
 * exist before trips can be checked against them, and trips before stop_times.
 * Random access into the zip (see zip/rangeZip.ts) is what makes that possible
 * without buffering.
 *
 * Memory stays flat throughout. The only things that grow with feed size are
 * the id sets used for referential checks — a GO feed's ~2,800 stops, ~90,000
 * trips and ~44 routes, which is a few megabytes, against a 174 MB
 * stop_times.txt that is never held at all.
 */

/** Thrown to abort a stage with a message the user can act on. */
export class PipelineError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly retryable: boolean,
    readonly detail?: Record<string, unknown>
  ) {
    super(message);
    this.name = "PipelineError";
  }

  toJobError(): JobError {
    return {
      code: this.code,
      message: this.message,
      detail: this.detail,
      retryable: this.retryable,
    };
  }
}

export interface RunOptions {
  /**
   * How to obtain the archive's bytes. Defaults to a ranged read against
   * object storage; the integration test substitutes a local file so the whole
   * pipeline can be exercised without a bucket.
   */
  openSource?: (key: string) => Promise<ByteRangeSource>;
}

export async function runIngestion(
  job: ClaimedJob,
  context: JobContext,
  options: RunOptions = {}
): Promise<void> {
  const logger = log.child({ jobId: job.id, datasetId: context.datasetId });
  const startedAt = Date.now();
  const issues = new Issues();

  const stage = async <T>(
    name: JobStage,
    fn: () => Promise<T>
  ): Promise<T> => {
    const stageStart = Date.now();
    await heartbeat(job.id, { stage: name });
    await recordEvent(job.id, { stage: name, kind: "started" });
    logger.info("stage_started", { stage: name });

    try {
      const result = await fn();
      const durationMs = Date.now() - stageStart;
      await recordEvent(job.id, { stage: name, kind: "completed", durationMs });
      await heartbeat(job.id, { lastCompletedStage: name });
      logger.info("stage_completed", { stage: name, durationMs });
      return result;
    } catch (error) {
      await recordEvent(job.id, {
        stage: name,
        kind: "failed",
        message: error instanceof Error ? error.message : String(error),
        durationMs: Date.now() - stageStart,
      });
      throw error;
    }
  };

  // ── Clear any partial state from a previous attempt ───────────────────────
  // Cheap and indexed by dataset_id, and it makes every attempt idempotent
  // without needing to reason about which stage the last one died in.
  await clearDatasetData(context.datasetId);

  // ── validating ────────────────────────────────────────────────────────────
  const { source, members, root, limits } = await stage("validating", async () => {
    const source = await (options.openSource ?? openRangeSource)(
      context.storageKey
    );

    if (source.size !== context.byteSize) {
      throw new PipelineError(
        `The stored archive is ${source.size.toLocaleString()} bytes but the upload recorded ${context.byteSize.toLocaleString()}. Upload it again.`,
        "size_mismatch",
        false
      );
    }

    let members: ZipMember[];
    try {
      members = await readCentralDirectory(source);
    } catch (error) {
      if (error instanceof ZipFormatError) {
        throw new PipelineError(error.message, error.code, false);
      }
      throw error;
    }

    const layout = resolveGtfsLayout(members.map((m) => m.name));

    if (layout.unsafePaths.length > 0) {
      throw new PipelineError(
        `This archive contains entries with unsafe paths (${layout.unsafePaths.slice(0, 3).join(", ")}) and will not be processed.`,
        "unsafe_zip_paths",
        false,
        { paths: layout.unsafePaths.slice(0, 10) }
      );
    }
    if (layout.candidates.length > 1) {
      throw new PipelineError(
        `This archive contains more than one GTFS feed (${layout.candidates.map((c) => c || "the archive root").join(", ")}). Upload them as separate datasets.`,
        "ambiguous_feed_root",
        false,
        { candidates: layout.candidates }
      );
    }
    if (layout.root === null) {
      throw new PipelineError(
        layout.missing.length > 0
          ? `This archive is missing ${layout.missing.join(", ")}. A GTFS feed must contain all of them.`
          : "No GTFS feed was found in this archive.",
        "missing_required_files",
        false,
        { missing: layout.missing }
      );
    }
    if (!layout.hasCalendar) {
      issues.add({
        severity: "warning",
        code: "no_service_calendar",
        file: "calendar.txt",
        message:
          "This feed contains neither calendar.txt nor calendar_dates.txt, so it has no service dates.",
      });
    }

    return {
      source,
      members,
      root: layout.root,
      limits: { totalUncompressed: 0 } satisfies InflateLimits,
    };
  });

  // ── extracting: verify the bytes are what was uploaded ────────────────────
  await stage("extracting", async () => {
    if (!context.checksumSha256) {
      logger.warn("checksum_absent", { file: context.filename });
      return;
    }

    // One streaming pass, never holding the archive. This is the only full read
    // of the raw bytes, and it doubles as a read-through of everything the
    // range reads will later touch.
    const hash = createHash("sha256");
    let read = 0;
    const CHUNK = 8 * 1024 * 1024;
    let lastBeat = Date.now();

    while (read < source.size) {
      const end = Math.min(read + CHUNK, source.size);
      hash.update(await source.read(read, end));
      read = end;
      if (Date.now() - lastBeat > 5_000) {
        await heartbeat(job.id, {
          stage: "extracting",
          current: read,
          total: source.size,
          unit: "bytes",
        });
        lastBeat = Date.now();
      }
    }

    const actual = hash.digest("hex");
    if (actual !== context.checksumSha256) {
      throw new PipelineError(
        "The stored archive does not match the checksum recorded when it was uploaded. It was corrupted in transit — upload it again.",
        "checksum_mismatch",
        false
      );
    }
  });

  // ── Member access ─────────────────────────────────────────────────────────
  const byName = new Map(members.map((m) => [m.name, m]));
  const has = (file: string) => byName.has(`${root}${file}`);
  const open = (file: string) => {
    const member = byName.get(`${root}${file}`);
    if (!member) {
      throw new PipelineError(
        `${file} is missing from the archive.`,
        "missing_file",
        false,
        { file }
      );
    }
    return streamMember(source, member, limits);
  };

  const importContext: ImportContext = {
    sql,
    datasetId: context.datasetId,
    issues,
    open,
    has,
  };

  // ── parsing + importing ───────────────────────────────────────────────────
  // These are one pass, not two: a GTFS file is parsed and loaded in a single
  // stream. The stages are reported separately because that is the shape a
  // user understands, and `parsing` covers the small files while `importing`
  // covers the two that dominate the wall clock.
  const totals = await stage("parsing", async () => {
    const agencies = await importAgencies(importContext);
    const stops = await importStops(importContext);
    const routes = await importRoutes(importContext);
    const services = await importServices(importContext);

    logger.info("small_files_imported", {
      agencies,
      stops: stops.rows,
      routes: routes.rows,
      services: services.serviceIds.size,
    });

    return { agencies, stops, routes, services };
  });

  const bigTotals = await stage("importing", async () => {
    // shapes.txt before trips.txt so trips' shape_id references can be checked.
    const shapes = await importShapes({
      ...importContext,
      onProgress: (rows) =>
        void heartbeat(job.id, {
          stage: "importing",
          current: rows,
          unit: "shapes",
        }),
    });

    const trips = await importTrips(importContext, {
      routeIds: totals.routes.routeIds,
      serviceIds: totals.services.serviceIds,
      shapeIds: shapes.shapeIds,
    });

    const stopTimes = await importStopTimes(
      {
        ...importContext,
        onProgress: (rows) =>
          void heartbeat(job.id, {
            stage: "importing",
            current: rows,
            unit: "stop times",
          }),
      },
      { tripIds: trips.tripIds, stopIds: totals.stops.stopIds }
    );

    logger.info("large_files_imported", {
      shapes: shapes.rows,
      trips: trips.rows,
      stopTimes: stopTimes.rows,
    });

    return { shapes, trips, stopTimes };
  });

  // ── indexing ──────────────────────────────────────────────────────────────
  await stage("indexing", async () => {
    // Indexes already exist from the migration; what the planner lacks after a
    // bulk load is statistics. Without this, the first query against a fresh
    // 5M-row table plans as though the table were empty.
    await heartbeat(job.id, { stage: "indexing", current: null, total: null });
    await sql`ANALYZE gtfs_stop_times`;
    await sql`ANALYZE gtfs_trips`;
    await sql`ANALYZE gtfs_stops`;
    await sql`ANALYZE gtfs_routes`;
    await sql`ANALYZE gtfs_shapes`;
  });

  // ── analyzing ─────────────────────────────────────────────────────────────
  await stage("analyzing", async () => {
    // Per-stop route counts. Derived rather than from the feed, and computed
    // here so the stops list is an index scan instead of a join per page.
    // One pass over stop_times: 211ms on a 3.1M-row feed.
    await sql`
      UPDATE gtfs_stops s
         SET route_count = coalesce(c.routes, 0)
        FROM (
          SELECT st.stop_id, count(DISTINCT t.route_id)::int AS routes
            FROM gtfs_stop_times st
            JOIN gtfs_trips t
              ON t.dataset_id = st.dataset_id AND t.trip_id = st.trip_id
           WHERE st.dataset_id = ${context.datasetId}
           GROUP BY st.stop_id
        ) c
       WHERE s.dataset_id = ${context.datasetId} AND s.stop_id = c.stop_id
    `;

    const metrics = {
      agencies: totals.agencies,
      routes: totals.routes.rows,
      stops: totals.stops.rows,
      trips: bigTotals.trips.rows,
      stopTimes: bigTotals.stopTimes.rows,
      shapes: bigTotals.shapes.rows,
      services: totals.services.serviceIds.size,
      routesByType: totals.routes.byType,
      tripsByDayOfWeek: await tripsByDayOfWeek(context.datasetId),
      processingDurationMs: Date.now() - startedAt,
      sourceByteSize: context.byteSize,
    };

    const feedInfo = {
      agencyName: await primaryAgencyName(context.datasetId),
      timezone: await primaryTimezone(context.datasetId),
      serviceStart: totals.services.start ?? undefined,
      serviceEnd: totals.services.end ?? undefined,
      bbox: totals.stops.bbox ?? undefined,
    };

    await sql`
      INSERT INTO dataset_metrics (dataset_id, metrics, computed_at)
      VALUES (${context.datasetId}, ${sql.json(metrics as never)}, now())
      ON CONFLICT (dataset_id)
      DO UPDATE SET metrics = EXCLUDED.metrics, computed_at = EXCLUDED.computed_at
    `;

    await sql`
      UPDATE datasets
         SET feed_info = ${sql.json(feedInfo as never)}, updated_at = now()
       WHERE id = ${context.datasetId}
    `;

    // Findings are written last, in one go, so a retry that succeeds does not
    // leave the previous attempt's warnings visible.
    for (const issue of issues.all()) {
      await recordIssue(context.datasetId, job.id, issue);
    }

    logger.info("ingestion_completed", {
      durationMs: metrics.processingDurationMs,
      rows: metrics.stopTimes,
      issues: issues.all().length,
    });
  });
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Remove a dataset's entity rows.
 *
 * Runs before every attempt so a retry starts clean. Deleting by `dataset_id`
 * is indexed on every table, and the alternative — reasoning about which rows a
 * half-finished attempt left behind — is how partial-state bugs are born.
 */
async function clearDatasetData(datasetId: string): Promise<void> {
  await sql`DELETE FROM gtfs_stop_times WHERE dataset_id = ${datasetId}`;
  await sql`DELETE FROM gtfs_trips WHERE dataset_id = ${datasetId}`;
  await sql`DELETE FROM gtfs_shapes WHERE dataset_id = ${datasetId}`;
  await sql`DELETE FROM gtfs_service_exceptions WHERE dataset_id = ${datasetId}`;
  await sql`DELETE FROM gtfs_services WHERE dataset_id = ${datasetId}`;
  await sql`DELETE FROM gtfs_routes WHERE dataset_id = ${datasetId}`;
  await sql`DELETE FROM gtfs_stops WHERE dataset_id = ${datasetId}`;
  await sql`DELETE FROM gtfs_agencies WHERE dataset_id = ${datasetId}`;
  await sql`DELETE FROM dataset_issues WHERE dataset_id = ${datasetId}`;
}

/** Trips per weekday, index 0 = Sunday. Computed in the database, not in JS. */
async function tripsByDayOfWeek(datasetId: string): Promise<number[]> {
  const rows = await sql<{ dow: number; trips: string }[]>`
    SELECT dow, count(*)::text AS trips
      FROM (
        SELECT t.trip_id,
               generate_series(0, 6) AS dow
          FROM gtfs_trips t
         WHERE t.dataset_id = ${datasetId}
      ) x
      JOIN gtfs_trips t2 ON t2.trip_id = x.trip_id AND t2.dataset_id = ${datasetId}
      JOIN gtfs_services s
        ON s.dataset_id = ${datasetId} AND s.service_id = t2.service_id
     WHERE CASE x.dow
             WHEN 0 THEN s.sunday WHEN 1 THEN s.monday WHEN 2 THEN s.tuesday
             WHEN 3 THEN s.wednesday WHEN 4 THEN s.thursday WHEN 5 THEN s.friday
             ELSE s.saturday
           END
     GROUP BY dow
     ORDER BY dow
  `;

  const counts = new Array(7).fill(0);
  for (const row of rows) counts[row.dow] = Number(row.trips);
  return counts;
}

async function primaryAgencyName(datasetId: string): Promise<string | undefined> {
  const rows = await sql<{ name: string }[]>`
    SELECT name FROM gtfs_agencies WHERE dataset_id = ${datasetId} ORDER BY name LIMIT 1
  `;
  return rows[0]?.name;
}

async function primaryTimezone(datasetId: string): Promise<string | undefined> {
  const rows = await sql<{ timezone: string | null }[]>`
    SELECT timezone FROM gtfs_agencies
     WHERE dataset_id = ${datasetId} AND timezone IS NOT NULL
     LIMIT 1
  `;
  return rows[0]?.timezone ?? undefined;
}

export type { Logger };
