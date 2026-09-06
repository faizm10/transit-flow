import { hostname } from "node:os";

/**
 * Worker configuration.
 *
 * Read once at startup and validated eagerly: a worker that boots with a
 * missing bucket and only discovers it on the first job has already told the
 * queue it was healthy, and will fail every job it claims.
 */

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `${name} is required. See docs/architecture/01-ingestion.md for the worker's environment.`
    );
  }
  return value;
}

function optionalInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export const config = {
  databaseUrl: required("DATABASE_URL"),

  s3: {
    bucket: required("S3_BUCKET"),
    region: process.env.S3_REGION ?? "auto",
    endpoint: required("S3_ENDPOINT"),
    accessKeyId: required("S3_ACCESS_KEY_ID"),
    secretAccessKey: required("S3_SECRET_ACCESS_KEY"),
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
  },

  /**
   * Identifies this worker in `ingestion_jobs.claimed_by`, so a stuck job can
   * be traced back to the process that took it.
   */
  workerId: process.env.WORKER_ID ?? `${hostname()}-${process.pid}`,

  /**
   * How often to look for work when the queue was empty. Two seconds keeps a
   * queued import feeling immediate without hammering Postgres — at one worker
   * that is 43,000 cheap indexed queries a day.
   */
  pollIntervalMs: optionalInt("WORKER_POLL_INTERVAL_MS", 2_000),

  /**
   * Liveness ping while a job runs. Must be comfortably under the reaper's
   * 120s staleness threshold or a healthy worker's job gets stolen.
   */
  heartbeatIntervalMs: optionalInt("WORKER_HEARTBEAT_INTERVAL_MS", 20_000),

  /**
   * Rows per COPY batch.
   *
   * Sized so one batch is a few MB rather than by row count alone: too small
   * and per-statement overhead dominates on 5M rows; too large and a failure
   * costs a long redo, and the buffered batch itself becomes the memory
   * ceiling the whole design exists to avoid.
   */
  copyBatchRows: optionalInt("WORKER_COPY_BATCH_ROWS", 20_000),

  /** Concurrency is 1 by default: GTFS import is IO- and memory-heavy. */
  concurrency: optionalInt("WORKER_CONCURRENCY", 1),
} as const;

export type Config = typeof config;
