/**
 * Ingest a GTFS archive from the local filesystem, without object storage.
 *
 * The normal path exists for browser uploads of multi-gigabyte feeds: the
 * archive goes to S3 so the worker can range-read it without ever holding it in
 * memory. For an operator ingesting a feed that is already on this machine,
 * that round trip buys nothing — so this script substitutes a file for the
 * bucket through the `openSource` seam on `runIngestion`, the same seam the
 * integration test uses. Every pipeline stage runs unchanged; only the
 * transport differs.
 *
 * Usage:
 *   cd worker
 *   npx tsx ingest-local.ts --archive /path/to/GO-GTFS.zip \
 *                           --owner <community_users.id> \
 *                           --name "GO Transit"
 *
 * Pass --dataset <uuid> to re-ingest into an existing dataset. That is the
 * update path: `runIngestion` clears the dataset's entity rows before importing,
 * so the id, and every reference to it, survives a feed refresh.
 */

import { randomUUID } from "node:crypto";
import { open, stat, readFile } from "node:fs/promises";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import postgres from "postgres";

import type { ByteRangeSource } from "./src/zip/rangeZip.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "..");

// ── Arguments ───────────────────────────────────────────────────────────────

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
}

const archivePath = arg("archive");
const ownerId = arg("owner");
const datasetName = arg("name") ?? "GO Transit";
const existingDataset = arg("dataset");

if (!archivePath) {
  console.error("--archive <path to .zip> is required");
  process.exit(1);
}
if (!existingDataset && !ownerId) {
  console.error("--owner <community_users.id> is required when creating a dataset");
  process.exit(1);
}

// ── Environment ─────────────────────────────────────────────────────────────

/**
 * The worker reads its config eagerly at import time, so DATABASE_URL has to be
 * in the environment before any of its modules load. The repo keeps one .env at
 * the root; nothing here loads it, so parse it directly.
 */
async function loadRootEnv(): Promise<void> {
  const raw = await readFile(join(REPO_ROOT, ".env"), "utf-8");
  for (const line of raw.split("\n")) {
    const match = /^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!match) continue;
    const [, key, value] = match;
    if (process.env[key]) continue;
    process.env[key] = value.trim().replace(/^["']|["']$/g, "");
  }
}

await loadRootEnv();

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL not found in the environment or ./.env");
  process.exit(1);
}

/**
 * `config.ts` validates the S3 credentials eagerly, because a real worker that
 * boots without a bucket would fail every job it claims. This run never opens a
 * bucket — `openSource` is overridden below — so placeholders satisfy the check
 * honestly rather than smuggling real credentials into a path that ignores them.
 */
process.env.S3_BUCKET ??= "unused-local-ingest";
process.env.S3_ENDPOINT ??= "http://127.0.0.1:1";
process.env.S3_ACCESS_KEY_ID ??= "unused";
process.env.S3_SECRET_ACCESS_KEY ??= "unused";

// ── Storage seam ────────────────────────────────────────────────────────────

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

// ── Run ─────────────────────────────────────────────────────────────────────

const absoluteArchive = resolve(archivePath);
const { size: byteSize } = await stat(absoluteArchive);

const sql = postgres(process.env.DATABASE_URL, { max: 2, onnotice: () => {} });

// Imported after the environment is set, for the same reason the integration
// test defers its import: these modules read config at module scope.
const { runIngestion } = await import("./src/pipeline/run.ts");
const { completeJob } = await import("./src/queue.ts");
const { closeDb } = await import("./src/db.ts");

const datasetId = existingDataset ?? randomUUID();
const uploadId = randomUUID();
const jobId = randomUUID();

/**
 * Keep the event loop alive for the whole run.
 *
 * Node exits with ERR_UNSETTLED_TOP_LEVEL_AWAIT (code 13) the moment the loop
 * empties while a top-level await is pending. The pipeline has stretches —
 * inflating and parsing a 133 MB member between database writes — where every
 * socket is idle and no timer is scheduled, and Node terminates the process
 * mid-import. The integration test never sees this because the test runner
 * holds its own handles.
 */
const keepAlive = setInterval(() => {}, 30_000);

try {
  if (existingDataset) {
    const rows = await sql`SELECT name FROM datasets WHERE id = ${datasetId}`;
    if (rows.length === 0) {
      console.error(`No dataset ${datasetId}`);
      process.exit(1);
    }
    await sql`
      UPDATE datasets SET status = 'importing', updated_at = now()
       WHERE id = ${datasetId}
    `;
    console.log(`Re-ingesting into dataset ${datasetId} (${rows[0].name})`);
  } else {
    await sql`
      INSERT INTO datasets (id, owner_id, name, status)
      VALUES (${datasetId}, ${ownerId!}, ${datasetName}, 'importing')
    `;
    console.log(`Created dataset ${datasetId} (${datasetName})`);
  }

  // The upload row is what `loadJobContext` reads in the normal path. The
  // storage key records that these bytes never went to a bucket, so a later
  // reader is not misled into thinking the archive is retrievable from storage.
  //
  // `storage_key` is uniquely indexed — in the real path keys are generated per
  // upload and never repeat. Scoping by upload id preserves that invariant when
  // the same file is ingested twice, and keeps one row per ingest as history.
  const storageKey = `local://${uploadId}/${absoluteArchive}`;
  await sql`
    INSERT INTO dataset_uploads (id, dataset_id, storage_key, filename, byte_size, status)
    VALUES (${uploadId}, ${datasetId}, ${storageKey},
            ${absoluteArchive.split("/").pop()!}, ${byteSize}, 'completed')
  `;
  // `ingestion_jobs_one_live_uidx` allows one pending-or-running job per
  // dataset. A previous ingest that died without finalising still holds that
  // slot, and the worker's reaper cannot free it — the reaper returns a stale
  // job to 'pending', which still occupies the index, on the assumption that
  // some worker will claim it. With no worker running, nothing ever will.
  //
  // Take the slot over only when the holder is demonstrably abandoned, using
  // the reaper's own 120-second staleness threshold. A job that is heartbeating
  // belongs to a live worker and must not be stomped.
  const live = await sql<{ id: string; stale: boolean }[]>`
    SELECT id,
           (heartbeat_at IS NULL OR heartbeat_at < now() - interval '120 seconds') AS stale
      FROM ingestion_jobs
     WHERE dataset_id = ${datasetId} AND status IN ('pending', 'running')
  `;
  for (const job of live) {
    if (!job.stale) {
      console.error(
        `Job ${job.id} is still heartbeating — a worker is processing this ` +
          `dataset. Refusing to run concurrently.`
      );
      process.exit(1);
    }
    await sql`
      UPDATE ingestion_jobs
         SET status = 'failed', finished_at = now(), claimed_by = NULL,
             error = ${sql.json({
               code: "abandoned",
               message: "Superseded by a local ingest; the previous attempt left no heartbeat.",
               retryable: false,
             })}
       WHERE id = ${job.id}
    `;
    console.log(`Superseded abandoned job ${job.id}`);
  }

  await sql`
    INSERT INTO ingestion_jobs (id, dataset_id, upload_id, status, stage)
    VALUES (${jobId}, ${datasetId}, ${uploadId}, 'running', 'queued')
  `;

  const started = Date.now();
  await runIngestion(
    {
      id: jobId,
      dataset_id: datasetId,
      upload_id: uploadId,
      attempt: 1,
      max_attempts: 1,
      stage: "queued",
      last_completed_stage: null,
    },
    {
      datasetId,
      storageKey,
      filename: absoluteArchive.split("/").pop()!,
      byteSize,
      checksumSha256: null,
    },
    { openSource: () => fileSource(absoluteArchive) }
  );

  await completeJob(jobId, datasetId);

  const counts = await sql`
    SELECT
      (SELECT count(*) FROM gtfs_agencies  WHERE dataset_id = ${datasetId}) AS agencies,
      (SELECT count(*) FROM gtfs_stops     WHERE dataset_id = ${datasetId}) AS stops,
      (SELECT count(*) FROM gtfs_routes    WHERE dataset_id = ${datasetId}) AS routes,
      (SELECT count(*) FROM gtfs_services  WHERE dataset_id = ${datasetId}) AS services,
      (SELECT count(*) FROM gtfs_shapes    WHERE dataset_id = ${datasetId}) AS shapes,
      (SELECT count(*) FROM gtfs_trips     WHERE dataset_id = ${datasetId}) AS trips,
      (SELECT count(*) FROM gtfs_stop_times WHERE dataset_id = ${datasetId}) AS stop_times
  `;
  console.log(`Done in ${((Date.now() - started) / 1000).toFixed(1)}s`);
  console.table(counts[0]);
  console.log(`dataset id: ${datasetId}`);
} finally {
  clearInterval(keepAlive);
  await sql.end({ timeout: 5 });
  await closeDb();
}
