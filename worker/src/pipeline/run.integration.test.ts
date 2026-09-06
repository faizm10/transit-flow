/**
 * End-to-end ingestion against a real Postgres and a real GTFS archive.
 *
 * This is the test that matters. Everything else in the worker is a unit that
 * can pass while the pipeline still fails to import a feed, so this one runs
 * the actual stages — zip index, streaming inflate, streaming CSV, batched
 * COPY, metrics — and asserts against row counts in the database.
 *
 * It needs a Postgres it may create and drop a database on:
 *
 *   TEST_DATABASE_URL=postgres://localhost/postgres npm run test:integration
 *
 * Object storage is replaced with a local file, through the `openSource` seam
 * on `runIngestion`. That substitution is honest: `ByteRangeSource` is the only
 * thing the pipeline knows about storage, and S3 range reads and file reads
 * satisfy the same contract.
 */

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { open, readFile, stat } from "node:fs/promises";
import { existsSync, readdirSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, before, after } from "node:test";

import postgres from "postgres";
import { zipSync } from "fflate";

import type { ByteRangeSource } from "../zip/rangeZip.ts";
import { readCentralDirectory, streamMember } from "../zip/rangeZip.ts";
import { readCsv } from "../csv.ts";

const ADMIN_URL =
  process.env.TEST_DATABASE_URL ?? "postgres://localhost:5432/postgres";
const TEST_DB = `transitflow_worker_test_${process.pid}`;
const TEST_URL = ADMIN_URL.replace(/\/[^/]*$/, `/${TEST_DB}`);

const REPO_ROOT = join(import.meta.dirname, "..", "..", "..");
const MIGRATIONS_DIR = join(REPO_ROOT, "client", "drizzle");

/**
 * Every migration, in filename order.
 *
 * Naming one file here is how this test broke once already: the worker started
 * writing a column added by 0002 and the test database, built from 0001 alone,
 * did not have it. Reading the directory means a new migration is covered
 * automatically.
 */
function migrationFiles(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((name) => /^\d+_.*\.sql$/.test(name))
    .sort();
}
const REAL_FEED_DIR = join(REPO_ROOT, "server", "data", "gotransit");

/**
 * Point at a prebuilt .zip to test against a real feed:
 *   GTFS_INTEGRATION_ARCHIVE=/path/to/feed.zip npm run test:integration
 * Building a 208 MB archive in-process is slow enough to dominate the run.
 */
const PREBUILT_ARCHIVE = process.env.GTFS_INTEGRATION_ARCHIVE;

/** Or zip the checked-out feed in-process with GTFS_INTEGRATION_REAL_FEED=1. */
const USE_REAL_FEED =
  process.env.GTFS_INTEGRATION_REAL_FEED === "1" &&
  existsSync(join(REAL_FEED_DIR, "stop_times.txt"));

let tempDir: string;
let archivePath: string;
let sql: ReturnType<typeof postgres>;

const DATASET_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const UPLOAD_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const JOB_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

/** A `ByteRangeSource` backed by a local file. */
async function fileSource(path: string): Promise<ByteRangeSource> {
  const { size } = await stat(path);
  const handle = await open(path, "r");
  return {
    size,
    async read(start, end) {
      const length = end - start;
      const buffer = Buffer.allocUnsafe(length);
      await handle.read(buffer, 0, length, start);
      return new Uint8Array(buffer);
    },
  };
}

function psql(db: string, args: string[]): void {
  execFileSync("psql", ["-v", "ON_ERROR_STOP=1", "-q", "-d", db, ...args], {
    stdio: ["ignore", "ignore", "pipe"],
  });
}

before(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "tf-worker-"));

  // ── Build the archive ─────────────────────────────────────────────────────
  const files: Record<string, Uint8Array> = {};
  const encoder = new TextEncoder();

  // The real GO feed is 208 MB and takes minutes to zip and import. It proves
  // things the synthetic feed cannot — a 174 MB member, ~5M stop_times — so it
  // is worth running, but only on request. CI runs the synthetic feed.
  if (PREBUILT_ARCHIVE) {
    // Nothing to build.
  } else if (USE_REAL_FEED) {
    for (const name of readdirSync(REAL_FEED_DIR)) {
      if (name.endsWith(".txt")) {
        files[name] = await readFile(join(REAL_FEED_DIR, name));
      }
    }
  } else {
    // Synthetic feed, so this test still means something in CI. Deliberately
    // includes the defects the importers are supposed to survive: a trip
    // pointing at a missing route, a stop_time pointing at a missing trip, a
    // duplicate stop id, and a stop with no coordinates.
    files["agency.txt"] = encoder.encode(
      "agency_id,agency_name,agency_url,agency_timezone\nA1,Test Transit,https://example.com,America/Toronto\n"
    );
    files["stops.txt"] = encoder.encode(
      "stop_id,stop_name,stop_lat,stop_lon,location_type\n" +
        "S1,Union,43.6453,-79.3806,0\n" +
        "S2,Bloor,43.6700,-79.3900,0\n" +
        "S1,Union Duplicate,43.6453,-79.3806,0\n" +
        "S3,No Coords,,,0\n"
    );
    files["routes.txt"] = encoder.encode(
      "route_id,route_short_name,route_long_name,route_type,route_color\n" +
        "R1,1,Lakeshore,2,00853F\n" +
        "R2,2,Milton,2,#F5A81C\n"
    );
    files["calendar.txt"] = encoder.encode(
      "service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date\n" +
        "WD,1,1,1,1,1,0,0,20260101,20261231\n" +
        "WE,0,0,0,0,0,1,1,20260101,20261231\n"
    );
    files["calendar_dates.txt"] = encoder.encode(
      "service_id,date,exception_type\nWD,20260701,2\n"
    );
    files["shapes.txt"] = encoder.encode(
      "shape_id,shape_pt_lat,shape_pt_lon,shape_pt_sequence\n" +
        "SH1,43.6453,-79.3806,1\nSH1,43.6550,-79.3850,2\nSH1,43.6700,-79.3900,3\n"
    );
    files["trips.txt"] = encoder.encode(
      "route_id,service_id,trip_id,trip_headsign,direction_id,shape_id\n" +
        "R1,WD,T1,Eastbound,0,SH1\n" +
        "R1,WE,T2,Westbound,1,SH1\n" +
        "R_MISSING,WD,T3,Orphan,0,\n"
    );
    files["stop_times.txt"] = encoder.encode(
      "trip_id,arrival_time,departure_time,stop_id,stop_sequence\n" +
        "T1,08:00:00,08:00:00,S1,1\n" +
        "T1,08:15:00,08:16:00,S2,2\n" +
        "T2,25:10:00,25:10:00,S2,1\n" +
        "T2,25:30:00,25:30:00,S1,2\n" +
        "T_MISSING,09:00:00,09:00:00,S1,1\n"
    );
  }

  if (PREBUILT_ARCHIVE) {
    archivePath = PREBUILT_ARCHIVE;
  } else {
    archivePath = join(tempDir, "feed.zip");
    await writeFile(archivePath, zipSync(files));
  }

  // ── Database ──────────────────────────────────────────────────────────────
  execFileSync("dropdb", ["--if-exists", TEST_DB], { stdio: "ignore" });
  execFileSync("createdb", [TEST_DB], { stdio: "ignore" });

  psql(TEST_DB, [
    "-c",
    `CREATE TABLE community_users (
       id text PRIMARY KEY, name text, avatar_url text,
       github_login text, created_at timestamptz NOT NULL DEFAULT now()
     )`,
  ]);
  for (const file of migrationFiles()) {
    psql(TEST_DB, ["-f", join(MIGRATIONS_DIR, file)]);
  }

  sql = postgres(TEST_URL, { max: 4, onnotice: () => {} });

  await sql`INSERT INTO community_users (id, name) VALUES ('u1', 'Test')`;
  await sql`
    INSERT INTO datasets (id, owner_id, name, status)
    VALUES (${DATASET_ID}, 'u1', 'Integration Feed', 'importing')
  `;
  await sql`
    INSERT INTO dataset_uploads (id, dataset_id, storage_key, filename, byte_size, status)
    VALUES (${UPLOAD_ID}, ${DATASET_ID}, ${"local://feed.zip"}, 'feed.zip',
            ${(await stat(archivePath)).size}, 'completed')
  `;
  await sql`
    INSERT INTO ingestion_jobs (id, dataset_id, upload_id, status, stage)
    VALUES (${JOB_ID}, ${DATASET_ID}, ${UPLOAD_ID}, 'running', 'queued')
  `;

  process.env.DATABASE_URL = TEST_URL;
});

after(async () => {
  await sql?.end({ timeout: 5 });

  // The pipeline holds its own module-level pool (src/db.ts). Closing only the
  // test's client leaves that one connected and dropdb refuses.
  try {
    const { closeDb } = await import("../db.ts");
    await closeDb();
  } catch {
    // The pipeline test may not have run; nothing to close.
  }

  await rm(tempDir, { recursive: true, force: true });
  // --force terminates any connection this process did not open, so a failed
  // test cannot leave a stray database behind for the next run to collide with.
  execFileSync("dropdb", ["--if-exists", "--force", TEST_DB], { stdio: "ignore" });
});

// ── Zip + CSV, standalone ───────────────────────────────────────────────────

test("reads the central directory with two range reads", async () => {
  const source = await fileSource(archivePath);
  let reads = 0;
  const counted: ByteRangeSource = {
    size: source.size,
    read: (a, b) => {
      reads++;
      return source.read(a, b);
    },
  };

  const members = await readCentralDirectory(counted);
  assert.ok(members.length >= 6, `expected ≥6 members, got ${members.length}`);
  assert.ok(reads <= 3, `expected ≤3 range reads, made ${reads}`);
  assert.ok(members.some((m) => m.name === "stop_times.txt"));
});

test("streams a member without holding it in memory", async () => {
  const source = await fileSource(archivePath);
  const members = await readCentralDirectory(source);
  const stopTimes = members.find((m) => m.name === "stop_times.txt")!;

  const limits = { totalUncompressed: 0 };
  let bytes = 0;
  let largestChunk = 0;
  for await (const chunk of streamMember(source, stopTimes, limits)) {
    bytes += chunk.length;
    largestChunk = Math.max(largestChunk, chunk.length);
  }

  assert.equal(bytes, stopTimes.uncompressedSize);
  // The whole point: no single chunk approaches the member's size.
  if (stopTimes.uncompressedSize > 10_000_000) {
    assert.ok(
      largestChunk < stopTimes.uncompressedSize / 10,
      `largest chunk ${largestChunk} was not small relative to ${stopTimes.uncompressedSize}`
    );
  }
});

test("parses CSV with quotes, embedded commas and newlines across chunks", async () => {
  const csv =
    'stop_id,stop_name,stop_desc\n' +
    'S1,"Union Station, Bay 5","Line one\nline two"\n' +
    'S2,"He said ""hi""",plain\n' +
    "S3,Simple,\n";

  const bytes = new TextEncoder().encode(csv);
  // One byte at a time — the worst case for a streaming parser, and the one
  // that catches state that was accidentally per-chunk.
  async function* oneByteAtATime() {
    for (const byte of bytes) yield new Uint8Array([byte]);
  }

  const { header, rows } = await readCsv(oneByteAtATime());
  assert.deepEqual(header.columns, ["stop_id", "stop_name", "stop_desc"]);

  const collected = [];
  for await (const row of rows) collected.push(row);

  assert.equal(collected.length, 3);
  assert.equal(header.get(collected[0], "stop_name"), "Union Station, Bay 5");
  assert.equal(header.get(collected[0], "stop_desc"), "Line one\nline two");
  assert.equal(header.get(collected[1], "stop_name"), 'He said "hi"');
  assert.equal(header.getOptional(collected[2], "stop_desc"), null);
});

test("strips a UTF-8 BOM from the first header cell", async () => {
  const bytes = new TextEncoder().encode("﻿stop_id,stop_name\nS1,Union\n");
  async function* once() {
    yield bytes;
  }
  const { header } = await readCsv(once());
  assert.equal(header.columns[0], "stop_id");
  assert.ok(header.has("stop_id"));
});

// ── Full pipeline ───────────────────────────────────────────────────────────

test("imports a feed end to end", async (t) => {
  // Imported here rather than at module scope: these modules read
  // DATABASE_URL at import time, and `before` sets it.
  const { runIngestion } = await import("./run.ts");

  const started = Date.now();
  await runIngestion(
    {
      id: JOB_ID,
      dataset_id: DATASET_ID,
      upload_id: UPLOAD_ID,
      attempt: 1,
      max_attempts: 3,
      stage: "queued",
      last_completed_stage: null,
    },
    {
      datasetId: DATASET_ID,
      storageKey: "local://feed.zip",
      filename: "feed.zip",
      byteSize: (await stat(archivePath)).size,
      checksumSha256: null,
    },
    { openSource: () => fileSource(archivePath) }
  );
  const elapsed = Date.now() - started;

  const count = async (table: string): Promise<number> => {
    const rows = await sql.unsafe(
      `SELECT count(*)::int AS n FROM ${table} WHERE dataset_id = $1`,
      [DATASET_ID]
    );
    return (rows[0] as unknown as { n: number }).n;
  };

  const counts = {
    agencies: await count("gtfs_agencies"),
    stops: await count("gtfs_stops"),
    routes: await count("gtfs_routes"),
    services: await count("gtfs_services"),
    shapes: await count("gtfs_shapes"),
    trips: await count("gtfs_trips"),
    stopTimes: await count("gtfs_stop_times"),
  };
  t.diagnostic(`imported in ${elapsed}ms: ${JSON.stringify(counts)}`);

  assert.ok(counts.agencies >= 1, "agencies imported");
  assert.ok(counts.stops >= 2, "stops imported");
  assert.ok(counts.routes >= 2, "routes imported");
  assert.ok(counts.trips >= 2, "trips imported");
  assert.ok(counts.stopTimes >= 4, "stop times imported");

  // ── Times past 24:00 survive as integers ─────────────────────────────────
  const late = await sql<{ departure_time: number }[]>`
    SELECT departure_time FROM gtfs_stop_times
     WHERE dataset_id = ${DATASET_ID} AND departure_time >= 86400
     LIMIT 1
  `;
  assert.ok(
    late.length > 0,
    "expected at least one post-midnight departure stored past 86400s"
  );

  // ── Colors normalized, '#' stripped ──────────────────────────────────────
  const colors = await sql<{ color: string | null }[]>`
    SELECT color FROM gtfs_routes WHERE dataset_id = ${DATASET_ID} AND color IS NOT NULL
  `;
  for (const { color } of colors) {
    assert.match(color!, /^[0-9A-F]{6}$/, `color ${color} should be bare hex`);
  }

  // ── Shapes aggregated into arrays, not point rows ────────────────────────
  const shapes = await sql<{ point_count: number; points: unknown }[]>`
    SELECT point_count, points FROM gtfs_shapes WHERE dataset_id = ${DATASET_ID} LIMIT 1
  `;
  if (shapes.length > 0) {
    assert.ok(shapes[0].point_count >= 2);
    assert.ok(Array.isArray(shapes[0].points));
  }

  // ── Derived per-stop route counts ────────────────────────────────────────
  const counted = await sql<{ n: number }[]>`
    SELECT count(*)::int AS n FROM gtfs_stops
     WHERE dataset_id = ${DATASET_ID} AND route_count IS NOT NULL
  `;
  assert.ok(
    counted[0].n > 0,
    'analyzing should fill gtfs_stops.route_count — the stops list reads it instead of joining stop_times per page'
  );

  // ── Metrics written ──────────────────────────────────────────────────────
  const metrics = await sql<{ metrics: Record<string, number> }[]>`
    SELECT metrics FROM dataset_metrics WHERE dataset_id = ${DATASET_ID}
  `;
  assert.equal(metrics.length, 1, "metrics row written");
  assert.equal(metrics[0].metrics.stopTimes, counts.stopTimes);
  assert.ok(
    (metrics[0].metrics.processingDurationMs as number) > 0,
    "processing duration recorded"
  );

  // ── Stage events recorded in order ───────────────────────────────────────
  const events = await sql<{ stage: string; kind: string }[]>`
    SELECT stage, kind FROM processing_events
     WHERE job_id = ${JOB_ID} ORDER BY created_at, id
  `;
  const completed = events.filter((e) => e.kind === "completed").map((e) => e.stage);
  assert.deepEqual(completed, [
    "validating",
    "extracting",
    "parsing",
    "importing",
    "indexing",
    "analyzing",
  ]);
});

test("records referential problems as actionable issues", async () => {
  const issues = await sql<
    { code: string; severity: string; file: string | null; message: string }[]
  >`
    SELECT code, severity, file, message FROM dataset_issues
     WHERE dataset_id = ${DATASET_ID}
  `;

  const byCode = new Map(issues.map((i) => [i.code, i]));

  // The synthetic feed carries deliberate defects; the real feed may not, so
  // only assert on them when they were actually planted.
  if (!USE_REAL_FEED && !PREBUILT_ARCHIVE) {
    const unknownRoute = byCode.get("unknown_route_reference");
    assert.ok(unknownRoute, "dangling route reference reported");
    assert.equal(unknownRoute!.file, "trips.txt");
    assert.match(unknownRoute!.message, /routes\.txt/);

    const unknownTrip = byCode.get("unknown_trip_reference");
    assert.ok(unknownTrip, "dangling trip reference reported");
    assert.match(unknownTrip!.message, /trips\.txt/);

    assert.ok(byCode.get("duplicate_stop_id"), "duplicate stop id reported");
    assert.ok(
      byCode.get("stop_missing_coordinates"),
      "stop without coordinates reported"
    );
  }

  // Whatever the feed, every issue must name a file or carry a count, or it is
  // not actionable.
  for (const issue of issues) {
    assert.ok(issue.message.length > 20, `issue ${issue.code} has a terse message`);
    assert.ok(
      ["error", "warning", "info"].includes(issue.severity),
      `issue ${issue.code} has an unknown severity`
    );
  }
});

test("re-running the same job is idempotent", async () => {
  const { runIngestion } = await import("./run.ts");

  const before = await sql<{ n: number }[]>`
    SELECT count(*)::int AS n FROM gtfs_stop_times WHERE dataset_id = ${DATASET_ID}
  `;

  await runIngestion(
    {
      id: JOB_ID,
      dataset_id: DATASET_ID,
      upload_id: UPLOAD_ID,
      attempt: 2,
      max_attempts: 3,
      stage: "queued",
      last_completed_stage: null,
    },
    {
      datasetId: DATASET_ID,
      storageKey: "local://feed.zip",
      filename: "feed.zip",
      byteSize: (await stat(archivePath)).size,
      checksumSha256: null,
    },
    { openSource: () => fileSource(archivePath) }
  );

  const after = await sql<{ n: number }[]>`
    SELECT count(*)::int AS n FROM gtfs_stop_times WHERE dataset_id = ${DATASET_ID}
  `;

  // A retry must not double the rows — this is what clearDatasetData buys.
  assert.equal(after[0].n, before[0].n, "retry did not duplicate rows");
});

test("rejects an archive whose stored size does not match the upload", async () => {
  const { runIngestion, PipelineError } = await import("./run.ts");

  await assert.rejects(
    runIngestion(
      {
        id: JOB_ID,
        dataset_id: DATASET_ID,
        upload_id: UPLOAD_ID,
        attempt: 1,
        max_attempts: 3,
        stage: "queued",
        last_completed_stage: null,
      },
      {
        datasetId: DATASET_ID,
        storageKey: "local://feed.zip",
        filename: "feed.zip",
        byteSize: 12345, // wrong on purpose
        checksumSha256: null,
      },
      { openSource: () => fileSource(archivePath) }
    ),
    (error: unknown) =>
      error instanceof PipelineError &&
      error.code === "size_mismatch" &&
      error.retryable === false
  );
});

test("rejects a checksum mismatch as non-retryable", async () => {
  const { runIngestion, PipelineError } = await import("./run.ts");

  await assert.rejects(
    runIngestion(
      {
        id: JOB_ID,
        dataset_id: DATASET_ID,
        upload_id: UPLOAD_ID,
        attempt: 1,
        max_attempts: 3,
        stage: "queued",
        last_completed_stage: null,
      },
      {
        datasetId: DATASET_ID,
        storageKey: "local://feed.zip",
        filename: "feed.zip",
        byteSize: (await stat(archivePath)).size,
        checksumSha256: "0".repeat(64),
      },
      { openSource: () => fileSource(archivePath) }
    ),
    (error: unknown) =>
      error instanceof PipelineError &&
      error.code === "checksum_mismatch" &&
      // A corrupted upload cannot be fixed by trying again.
      error.retryable === false
  );
});
