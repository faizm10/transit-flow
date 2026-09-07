import { config } from "./config.ts";
import { closeDb } from "./db.ts";
import { log } from "./log.ts";
import {
  claimNextJob,
  completeJob,
  failJob,
  heartbeat,
  loadJobContext,
  reapStalledJobs,
} from "./queue.ts";
import { PipelineError, runIngestion } from "./pipeline/run.ts";

/**
 * The GTFS ingestion worker.
 *
 * Polls Postgres for work, runs one job at a time, and exits cleanly on
 * SIGTERM. There is no framework here on purpose: the whole runtime is a loop,
 * a claim query, and a heartbeat timer, which is the amount of machinery this
 * problem actually needs.
 *
 * Deployment is a single container. Running several is safe — `SKIP LOCKED`
 * hands each worker a different job, and the per-dataset partial unique index
 * stops two jobs for the same dataset existing at all.
 */

let shuttingDown = false;
let activeJob: string | null = null;

async function processOne(): Promise<boolean> {
  const job = await claimNextJob();
  if (!job) return false;

  activeJob = job.id;
  const logger = log.child({ jobId: job.id, datasetId: job.dataset_id });
  logger.info("job_claimed", { attempt: job.attempt, worker: config.workerId });

  // Keep the claim alive while the job runs. Without this the reaper would
  // consider any job longer than 120s abandoned and hand it to another worker.
  const beat = setInterval(() => {
    void heartbeat(job.id).catch((error: unknown) =>
      logger.warn("heartbeat_failed", {
        error: error instanceof Error ? error.message : String(error),
      })
    );
  }, config.heartbeatIntervalMs);

  try {
    const context = await loadJobContext(job);
    if (!context) {
      // The dataset or upload was deleted after the job was queued. Retrying
      // cannot help.
      throw new PipelineError(
        "The upload for this job no longer exists.",
        "upload_missing",
        false
      );
    }

    await runIngestion(job, context);
    await completeJob(job.id, job.dataset_id);
    logger.info("job_succeeded");
  } catch (error) {
    const jobError =
      error instanceof PipelineError
        ? error.toJobError()
        : {
            code: "internal_error",
            // Unexpected errors are retryable: they are far more often a
            // transient network or database blip than a bad feed, and a feed
            // that is genuinely bad fails the same way three times cheaply.
            message:
              error instanceof Error
                ? `Processing failed: ${error.message}`
                : "Processing failed unexpectedly.",
            retryable: true,
          };

    const { willRetry } = await failJob(
      job.id,
      job.dataset_id,
      jobError,
      job.attempt,
      job.max_attempts
    );

    logger.error("job_failed", {
      code: jobError.code,
      retryable: jobError.retryable,
      willRetry,
      attempt: job.attempt,
      maxAttempts: job.max_attempts,
      stack: error instanceof Error ? error.stack : undefined,
    });
  } finally {
    clearInterval(beat);
    activeJob = null;
  }

  return true;
}

async function main(): Promise<void> {
  log.info("worker_started", {
    worker: config.workerId,
    pollIntervalMs: config.pollIntervalMs,
    copyBatchRows: config.copyBatchRows,
  });

  // Reclaim anything a previous crash orphaned before taking new work.
  const reaped = await reapStalledJobs();
  if (reaped > 0) log.warn("stalled_jobs_reclaimed", { count: reaped });

  let sinceLastReap = Date.now();

  while (!shuttingDown) {
    let didWork = false;
    try {
      didWork = await processOne();
    } catch (error) {
      // A failure *outside* a job — the claim query itself — must not kill the
      // loop, or a brief database blip permanently stops the worker.
      log.error("claim_failed", {
        error: error instanceof Error ? error.message : String(error),
      });
      await sleep(config.pollIntervalMs * 5);
      continue;
    }

    // Reap on an idle tick, roughly once a minute, so orphaned jobs are picked
    // up even when this is the only worker.
    if (!didWork && Date.now() - sinceLastReap > 60_000) {
      sinceLastReap = Date.now();
      const count = await reapStalledJobs().catch(() => 0);
      if (count > 0) log.warn("stalled_jobs_reclaimed", { count });
    }

    if (!didWork && !shuttingDown) await sleep(config.pollIntervalMs);
  }

  log.info("worker_stopped");
  await closeDb();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Graceful shutdown.
 *
 * The loop is allowed to finish the job in flight. If the platform kills us
 * first, the heartbeat goes stale and another worker reclaims the job — so the
 * worst case of an ungraceful stop is a repeated import, never a lost one.
 */
for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => {
    if (shuttingDown) {
      log.warn("forced_shutdown", { signal, activeJob });
      process.exit(1);
    }
    shuttingDown = true;
    log.info("shutdown_requested", { signal, activeJob });
  });
}

main().catch((error: unknown) => {
  log.error("worker_crashed", {
    error: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
  });
  process.exit(1);
});
