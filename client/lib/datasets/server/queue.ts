import "server-only";

import { and, eq, sql } from "drizzle-orm";

import { db, ingestionJobs, datasets, type IngestionJob } from "@/lib/db";
import type { JobError } from "@/lib/db";
import type { JobStage } from "@/lib/datasets/stages";

/**
 * The work queue.
 *
 * There is no Redis. `ingestion_jobs` is both the job record and the queue, so
 * a claim and a status change are the same write — a worker cannot crash
 * between "the queue says it's taken" and "the database says it's running",
 * because there is only one of those.
 *
 * The claim is a single `UPDATE ... FROM (SELECT ... FOR UPDATE SKIP LOCKED)`
 * statement. That matters here: `drizzle-orm/neon-http` has no interactive
 * transactions, and a single statement is its own transaction, so the same code
 * works from a Vercel function and from the worker.
 *
 * Swapping in BullMQ later means reimplementing this module's five functions
 * and nothing else.
 */

/** A running job whose heartbeat is older than this was orphaned by a crash. */
const HEARTBEAT_TIMEOUT_SECONDS = 120;

/** Exponential backoff between attempts, in seconds. */
const BACKOFF_BASE_SECONDS = 15;

export interface EnqueueOptions {
  datasetId: string;
  uploadId: string;
  maxAttempts?: number;
}

/**
 * Queue an ingestion.
 *
 * Returns the existing job if one is already live for this dataset. The partial
 * unique index guarantees at most one, so a double-click or a retried request
 * cannot start a second import of the same feed — the database enforces it, not
 * this function.
 */
export async function enqueueIngestion({
  datasetId,
  uploadId,
  maxAttempts = Number(process.env.GTFS_JOB_ATTEMPTS ?? 3),
}: EnqueueOptions): Promise<IngestionJob> {
  const [existing] = await db
    .select()
    .from(ingestionJobs)
    .where(
      and(
        eq(ingestionJobs.datasetId, datasetId),
        sql`${ingestionJobs.status} in ('pending', 'running')`
      )
    )
    .limit(1);

  if (existing) return existing;

  const [job] = await db
    .insert(ingestionJobs)
    .values({
      datasetId,
      uploadId,
      status: "pending",
      stage: "queued",
      maxAttempts,
    })
    .returning();

  await db
    .update(datasets)
    .set({ status: "importing", updatedAt: new Date() })
    .where(eq(datasets.id, datasetId));

  return job;
}

/**
 * Claim the next runnable job.
 *
 * `SKIP LOCKED` is what lets several workers poll the same table without
 * blocking each other: a row another worker is already claiming is stepped
 * over rather than waited on.
 */
export async function claimNextJob(workerId: string): Promise<IngestionJob | null> {
  const { rows } = await db.execute<IngestionJob>(sql`
    WITH claimable AS (
      SELECT id
        FROM ingestion_jobs
       WHERE status = 'pending'
         AND run_after <= now()
       ORDER BY run_after
         FOR UPDATE SKIP LOCKED
       LIMIT 1
    )
    UPDATE ingestion_jobs j
       SET status       = 'running',
           claimed_by   = ${workerId},
           claimed_at   = now(),
           heartbeat_at = now(),
           started_at   = coalesce(j.started_at, now()),
           attempt      = j.attempt + 1
      FROM claimable
     WHERE j.id = claimable.id
    RETURNING j.*
  `);

  return rows[0] ?? null;
}

/**
 * Report liveness and progress.
 *
 * Progress is stored in whatever unit the stage actually measures — bytes for
 * parsing, rows for importing — with a nullable total. Stages that cannot
 * measure themselves pass no numbers and the UI shows an indeterminate bar
 * rather than a number we made up.
 */
export async function heartbeat(
  jobId: string,
  update: {
    stage?: JobStage;
    lastCompletedStage?: JobStage;
    progressCurrent?: number | null;
    progressTotal?: number | null;
    progressUnit?: string | null;
  } = {}
): Promise<void> {
  await db
    .update(ingestionJobs)
    .set({ heartbeatAt: new Date(), ...update })
    .where(eq(ingestionJobs.id, jobId));
}

/** Mark a job finished and its dataset explorable. */
export async function completeJob(jobId: string, datasetId: string): Promise<void> {
  const finishedAt = new Date();

  await db
    .update(ingestionJobs)
    .set({
      status: "succeeded",
      stage: "ready",
      lastCompletedStage: "analyzing",
      error: null,
      finishedAt,
      claimedBy: null,
    })
    .where(eq(ingestionJobs.id, jobId));

  await db
    .update(datasets)
    .set({ status: "ready", readyAt: finishedAt, updatedAt: finishedAt })
    .where(eq(datasets.id, datasetId));
}

/**
 * Record a failed attempt.
 *
 * A retryable failure with attempts left goes back to `pending` with
 * exponential backoff, keeping `lastCompletedStage` so the retry resumes.
 * Only when attempts are exhausted — or the error is not retryable — does the
 * job and its dataset go to `failed`.
 *
 * The dataset only becomes `failed` if it was never ready. A dataset that
 * already has data stays explorable when a *re-import* fails; a failed refresh
 * must not take away working data.
 */
export async function failJob(
  jobId: string,
  datasetId: string,
  error: JobError
): Promise<{ willRetry: boolean }> {
  const [job] = await db
    .select({
      attempt: ingestionJobs.attempt,
      maxAttempts: ingestionJobs.maxAttempts,
    })
    .from(ingestionJobs)
    .where(eq(ingestionJobs.id, jobId))
    .limit(1);

  const attempt = job?.attempt ?? 1;
  const maxAttempts = job?.maxAttempts ?? 3;
  const willRetry = error.retryable && attempt < maxAttempts;

  if (willRetry) {
    const delaySeconds = BACKOFF_BASE_SECONDS * 2 ** (attempt - 1);
    await db
      .update(ingestionJobs)
      .set({
        status: "pending",
        error,
        claimedBy: null,
        claimedAt: null,
        runAfter: new Date(Date.now() + delaySeconds * 1000),
      })
      .where(eq(ingestionJobs.id, jobId));
    return { willRetry: true };
  }

  const finishedAt = new Date();
  await db
    .update(ingestionJobs)
    .set({ status: "failed", error, finishedAt, claimedBy: null })
    .where(eq(ingestionJobs.id, jobId));

  await db
    .update(datasets)
    .set({ status: "failed", updatedAt: finishedAt })
    .where(and(eq(datasets.id, datasetId), sql`${datasets.status} <> 'ready'`));

  return { willRetry: false };
}

/**
 * Return orphaned jobs to the queue.
 *
 * A worker killed mid-job leaves a row in `running` that nothing will ever
 * finish. Any worker can reclaim it once the heartbeat goes stale. This is what
 * BullMQ's stalled-job checker did, in one statement.
 */
export async function reapStalledJobs(): Promise<number> {
  const { rows } = await db.execute<{ id: string }>(sql`
    UPDATE ingestion_jobs
       SET status     = 'pending',
           claimed_by = NULL,
           claimed_at = NULL,
           run_after  = now()
     WHERE status = 'running'
       AND heartbeat_at < now() - interval '${sql.raw(String(HEARTBEAT_TIMEOUT_SECONDS))} seconds'
    RETURNING id
  `);
  return rows.length;
}

/**
 * Re-queue a failed job without a new upload.
 *
 * This is Part 7's "retry processing": the archive is still in object storage,
 * so a transient failure costs a click rather than another multi-gigabyte
 * transfer. The attempt counter resets because a user-initiated retry is a new
 * decision, not a continuation of the automatic backoff.
 */
export async function retryJob(jobId: string): Promise<IngestionJob | null> {
  const [job] = await db
    .update(ingestionJobs)
    .set({
      status: "pending",
      error: null,
      attempt: 0,
      runAfter: new Date(),
      claimedBy: null,
      claimedAt: null,
      finishedAt: null,
    })
    .where(and(eq(ingestionJobs.id, jobId), eq(ingestionJobs.status, "failed")))
    .returning();

  if (job) {
    await db
      .update(datasets)
      .set({ status: "importing", updatedAt: new Date() })
      .where(eq(datasets.id, job.datasetId));
  }

  return job ?? null;
}
