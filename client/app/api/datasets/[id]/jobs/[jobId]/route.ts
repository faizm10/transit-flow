import { NextRequest, NextResponse } from "next/server";
import { and, asc, eq } from "drizzle-orm";

import { db, ingestionJobs, processingEvents } from "@/lib/db";
import {
  handle,
  requireOwnedDataset,
  ApiError,
  isUuid,
} from "@/lib/datasets/server/access";
import { retryJob } from "@/lib/datasets/server/queue";

/**
 * Job status, polled by the processing screen.
 *
 * Polling rather than SSE or WebSockets. An SSE connection holds a Fluid
 * function open for the whole job — minutes of billed wall clock to deliver
 * what a 2-second poll delivers anyway — and WebSockets need a server we do not
 * run. Polling also survives a reload, a closed tab and an instance recycle
 * with no reconnection logic, which the processing screen needs regardless
 * because state has to be reconstructible from the backend.
 *
 * The response carries a `pollAfterMs` hint so the client can back off once the
 * job is finished instead of the interval being hardcoded on both sides.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; jobId: string }> }
) {
  return handle(async () => {
    const { id, jobId } = await params;
    const { dataset } = await requireOwnedDataset(id);

    if (!isUuid(jobId)) throw new ApiError(404, "not_found", "Job not found");

    const [job] = await db
      .select()
      .from(ingestionJobs)
      .where(
        and(eq(ingestionJobs.id, jobId), eq(ingestionJobs.datasetId, dataset.id))
      )
      .limit(1);

    if (!job) throw new ApiError(404, "not_found", "Job not found");

    const events = await db
      .select({
        stage: processingEvents.stage,
        kind: processingEvents.kind,
        message: processingEvents.message,
        durationMs: processingEvents.durationMs,
        createdAt: processingEvents.createdAt,
      })
      .from(processingEvents)
      .where(eq(processingEvents.jobId, job.id))
      .orderBy(asc(processingEvents.createdAt));

    const finished = job.status === "succeeded" || job.status === "failed";

    return NextResponse.json(
      {
        job: {
          id: job.id,
          status: job.status,
          stage: job.stage,
          lastCompletedStage: job.lastCompletedStage,
          progressCurrent: job.progressCurrent,
          progressTotal: job.progressTotal,
          progressUnit: job.progressUnit,
          attempt: job.attempt,
          maxAttempts: job.maxAttempts,
          error: job.error,
          startedAt: job.startedAt,
          finishedAt: job.finishedAt,
        },
        events,
        datasetStatus: dataset.status,
        pollAfterMs: finished ? null : 2000,
      },
      // Never cached: this is the one endpoint whose whole purpose is being
      // current.
      { headers: { "Cache-Control": "no-store" } }
    );
  });
}

/**
 * Retry a failed job.
 *
 * The archive is still in object storage, so this costs a click rather than
 * re-uploading gigabytes — the recovery path Part 7 asks for.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; jobId: string }> }
) {
  return handle(async () => {
    const { id, jobId } = await params;
    const { dataset } = await requireOwnedDataset(id);

    if (!isUuid(jobId)) throw new ApiError(404, "not_found", "Job not found");

    const [existing] = await db
      .select({ id: ingestionJobs.id, status: ingestionJobs.status })
      .from(ingestionJobs)
      .where(
        and(eq(ingestionJobs.id, jobId), eq(ingestionJobs.datasetId, dataset.id))
      )
      .limit(1);

    if (!existing) throw new ApiError(404, "not_found", "Job not found");
    if (existing.status !== "failed") {
      throw new ApiError(
        409,
        "not_retryable",
        existing.status === "succeeded"
          ? "This import already succeeded."
          : "This import is still running."
      );
    }

    const job = await retryJob(jobId);
    if (!job) {
      // Lost a race with another retry; the job is no longer failed, which is
      // the outcome the caller wanted anyway.
      throw new ApiError(409, "not_retryable", "This import is already running.");
    }

    return NextResponse.json({ job });
  });
}
