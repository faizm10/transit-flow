import { sql } from "./db.ts";
import { config } from "./config.ts";
import type { JobStage } from "../../client/lib/datasets/stages.ts";

/**
 * Queue operations, worker side.
 *
 * The same SQL the Next.js app runs (`client/lib/datasets/server/queue.ts`),
 * expressed against the TCP driver. Kept as a separate file rather than shared
 * because the two speak to different drivers with incompatible query builders;
 * what is shared, and what matters, is the schema and the statements.
 */

export interface ClaimedJob {
  id: string;
  dataset_id: string;
  upload_id: string | null;
  attempt: number;
  max_attempts: number;
  stage: JobStage;
  last_completed_stage: JobStage | null;
}

export interface JobError {
  code: string;
  message: string;
  detail?: Record<string, unknown>;
  retryable: boolean;
}

/**
 * Take the next runnable job.
 *
 * `FOR UPDATE SKIP LOCKED` steps over rows another worker is claiming rather
 * than blocking on them, so adding workers adds throughput instead of
 * contention.
 */
export async function claimNextJob(): Promise<ClaimedJob | null> {
  const rows = await sql<ClaimedJob[]>`
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
           claimed_by   = ${config.workerId},
           claimed_at   = now(),
           heartbeat_at = now(),
           started_at   = coalesce(j.started_at, now()),
           attempt      = j.attempt + 1
      FROM claimable
     WHERE j.id = claimable.id
    RETURNING j.id, j.dataset_id, j.upload_id, j.attempt, j.max_attempts,
              j.stage, j.last_completed_stage
  `;
  return rows[0] ?? null;
}

export interface ProgressUpdate {
  stage?: JobStage;
  lastCompletedStage?: JobStage;
  current?: number | null;
  total?: number | null;
  unit?: string | null;
}

/**
 * Report liveness and progress.
 *
 * Called from inside long stages, so it must stay cheap — one indexed UPDATE by
 * primary key, no transaction, no read-back.
 */
export async function heartbeat(
  jobId: string,
  update: ProgressUpdate = {}
): Promise<void> {
  await sql`
    UPDATE ingestion_jobs
       SET heartbeat_at        = now(),
           stage               = coalesce(${update.stage ?? null}, stage),
           last_completed_stage = coalesce(${update.lastCompletedStage ?? null}, last_completed_stage),
           progress_current    = ${update.current ?? null},
           progress_total      = ${update.total ?? null},
           progress_unit       = ${update.unit ?? null}
     WHERE id = ${jobId}
  `;
}

/**
 * Append a stage event.
 *
 * These rows are simultaneously the processing screen's checklist and the
 * observability record. Keeping them as one thing means the log cannot drift
 * from what the user is shown.
 */
export async function recordEvent(
  jobId: string,
  event: {
    stage: JobStage;
    kind: "started" | "completed" | "failed" | "info";
    message?: string;
    data?: Record<string, unknown>;
    durationMs?: number;
  }
): Promise<void> {
  await sql`
    INSERT INTO processing_events (job_id, stage, kind, message, data, duration_ms)
    VALUES (
      ${jobId}, ${event.stage}, ${event.kind}, ${event.message ?? null},
      ${event.data ? sql.json(event.data as never) : null}, ${event.durationMs ?? null}
    )
  `;
}

/**
 * Record a validation finding.
 *
 * One row per issue *code*, with a count and a sample — not one row per
 * occurrence. A feed with 400,000 dangling stop references should produce one
 * actionable row, not 400,000.
 */
export async function recordIssue(
  datasetId: string,
  jobId: string,
  issue: {
    severity: "error" | "warning" | "info";
    code: string;
    file?: string;
    message: string;
    count: number;
    sample?: unknown[];
  }
): Promise<void> {
  await sql`
    INSERT INTO dataset_issues (dataset_id, job_id, severity, code, file, message, count, sample)
    VALUES (
      ${datasetId}, ${jobId}, ${issue.severity}, ${issue.code},
      ${issue.file ?? null}, ${issue.message}, ${issue.count},
      ${issue.sample ? sql.json(issue.sample.slice(0, 10) as never) : null}
    )
    ON CONFLICT (dataset_id, job_id, code, file)
    DO UPDATE SET count = EXCLUDED.count,
                  message = EXCLUDED.message,
                  sample = EXCLUDED.sample
  `;
}

export async function completeJob(
  jobId: string,
  datasetId: string
): Promise<void> {
  await sql.begin(async (tx) => {
    await tx`
      UPDATE ingestion_jobs
         SET status = 'succeeded', stage = 'ready', last_completed_stage = 'analyzing',
             error = NULL, finished_at = now(), claimed_by = NULL,
             progress_current = NULL, progress_total = NULL, progress_unit = NULL
       WHERE id = ${jobId}
    `;
    await tx`
      UPDATE datasets
         SET status = 'ready', ready_at = now(), updated_at = now()
       WHERE id = ${datasetId}
    `;
  });
}

/**
 * Record a failed attempt.
 *
 * Retryable failures with attempts remaining go back to `pending` with
 * exponential backoff, keeping `last_completed_stage` so the retry resumes.
 *
 * A dataset that is already `ready` is not marked failed: a failed *re-import*
 * must not take away data that currently works.
 */
export async function failJob(
  jobId: string,
  datasetId: string,
  error: JobError,
  attempt: number,
  maxAttempts: number
): Promise<{ willRetry: boolean }> {
  const willRetry = error.retryable && attempt < maxAttempts;

  if (willRetry) {
    const delaySeconds = 15 * 2 ** (attempt - 1);
    await sql`
      UPDATE ingestion_jobs
         SET status = 'pending', error = ${sql.json(error as never)},
             claimed_by = NULL, claimed_at = NULL,
             run_after = now() + make_interval(secs => ${delaySeconds})
       WHERE id = ${jobId}
    `;
    return { willRetry: true };
  }

  await sql.begin(async (tx) => {
    await tx`
      UPDATE ingestion_jobs
         SET status = 'failed', error = ${sql.json(error as never)},
             finished_at = now(), claimed_by = NULL
       WHERE id = ${jobId}
    `;
    await tx`
      UPDATE datasets
         SET status = 'failed', updated_at = now()
       WHERE id = ${datasetId} AND status <> 'ready'
    `;
  });

  return { willRetry: false };
}

/**
 * Return orphaned jobs to the queue.
 *
 * A worker killed mid-job leaves a `running` row nothing will finish. Once its
 * heartbeat is stale, any worker may reclaim it. This replaces BullMQ's
 * stalled-job checker with one statement.
 */
export async function reapStalledJobs(): Promise<number> {
  const rows = await sql<{ id: string }[]>`
    UPDATE ingestion_jobs
       SET status = 'pending', claimed_by = NULL, claimed_at = NULL, run_after = now()
     WHERE status = 'running'
       AND heartbeat_at < now() - interval '120 seconds'
    RETURNING id
  `;
  return rows.length;
}

export interface JobContext {
  datasetId: string;
  storageKey: string;
  filename: string;
  byteSize: number;
  checksumSha256: string | null;
}

/** Everything the pipeline needs about a claimed job, in one query. */
export async function loadJobContext(
  job: ClaimedJob
): Promise<JobContext | null> {
  const rows = await sql<
    {
      dataset_id: string;
      storage_key: string;
      filename: string;
      byte_size: string | number;
      checksum_sha256: string | null;
    }[]
  >`
    SELECT d.id AS dataset_id, u.storage_key, u.filename, u.byte_size, u.checksum_sha256
      FROM ingestion_jobs j
      JOIN datasets d ON d.id = j.dataset_id
      JOIN dataset_uploads u ON u.id = j.upload_id
     WHERE j.id = ${job.id}
     LIMIT 1
  `;

  const row = rows[0];
  if (!row) return null;

  return {
    datasetId: row.dataset_id,
    storageKey: row.storage_key,
    filename: row.filename,
    byteSize: Number(row.byte_size),
    checksumSha256: row.checksum_sha256,
  };
}
