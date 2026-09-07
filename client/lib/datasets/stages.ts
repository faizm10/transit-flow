/**
 * The ingestion state machine.
 *
 * This module is the single contract shared by the API, the worker and the
 * processing UI. It is deliberately free of imports so the worker can consume
 * it without pulling in React, Next or the database client.
 *
 * Two separate axes, and conflating them is the mistake to avoid:
 *
 *   DatasetStatus — what the *dataset* is: can a user explore it?
 *   JobStage      — where the current *attempt* is in the pipeline.
 *
 * A dataset that is `ready` can have a newer job that is `parsing`; the old
 * data stays explorable until the new job reaches `ready`.
 */

// ── Dataset ─────────────────────────────────────────────────────────────────

export const DATASET_STATUSES = [
  "draft", // created, nothing uploaded yet
  "importing", // an ingestion job is in flight
  "ready", // explorable
  "failed", // the most recent job exhausted its attempts
  "archived", // entity rows dropped, artifacts retained
] as const;

export type DatasetStatus = (typeof DATASET_STATUSES)[number];

// ── Job ─────────────────────────────────────────────────────────────────────

/**
 * Ordered pipeline. Index order is meaningful: `stageIndex` drives the
 * checklist UI, and `lastCompletedStage` on a failed job is what lets a retry
 * resume instead of restarting.
 */
export const JOB_STAGES = [
  "created",
  "uploading",
  "uploaded",
  "queued",
  "validating",
  "extracting",
  "parsing",
  "importing",
  "indexing",
  "analyzing",
  "ready",
] as const;

export type JobStage = (typeof JOB_STAGES)[number];

/** Terminal failure. Not part of JOB_STAGES because it is not a position. */
export type JobStatus = "pending" | "running" | "succeeded" | "failed" | "cancelled";

export const JOB_STAGE_INDEX: Record<JobStage, number> = Object.fromEntries(
  JOB_STAGES.map((stage, index) => [stage, index])
) as Record<JobStage, number>;

export function stageIndex(stage: JobStage): number {
  return JOB_STAGE_INDEX[stage];
}

export function isStageComplete(current: JobStage, candidate: JobStage): boolean {
  return stageIndex(candidate) < stageIndex(current);
}

// ── Presentation ────────────────────────────────────────────────────────────

/**
 * Present-tense labels for the stage currently running, and past-tense for one
 * already done. "Parsing stops.txt" while it happens; "Parsed" once it has.
 */
export const STAGE_LABELS: Record<
  JobStage,
  { active: string; done: string; description: string }
> = {
  created: {
    active: "Preparing",
    done: "Prepared",
    description: "Allocating storage for the upload",
  },
  uploading: {
    active: "Uploading",
    done: "Upload complete",
    description: "Transferring the archive directly to object storage",
  },
  uploaded: {
    active: "Finalizing upload",
    done: "Upload finalized",
    description: "Verifying the archive checksum",
  },
  queued: {
    active: "Queued",
    done: "Queued",
    description: "Waiting for a worker to pick up the job",
  },
  validating: {
    active: "Validating archive",
    done: "Archive validated",
    description: "Checking the zip layout and required GTFS files",
  },
  extracting: {
    active: "Reading archive",
    done: "Archive read",
    description: "Streaming zip entries without extracting to disk",
  },
  parsing: {
    active: "Parsing GTFS",
    done: "GTFS parsed",
    description: "Reading each text file as a stream of rows",
  },
  importing: {
    active: "Importing rows",
    done: "Rows imported",
    description: "Bulk-loading entities into the database",
  },
  indexing: {
    active: "Building indexes",
    done: "Indexes built",
    description: "Creating the indexes that back route and stop queries",
  },
  analyzing: {
    active: "Calculating statistics",
    done: "Statistics calculated",
    description: "Deriving service coverage and feed health metrics",
  },
  ready: {
    active: "Ready",
    done: "Ready",
    description: "The dataset is available to explore",
  },
};

/**
 * Stages where the backend can report a real percentage.
 *
 * Everything else gets an indeterminate bar. We do not synthesize progress:
 * a bar that crawls to 90% and sits there is worse than one that is honestly
 * indeterminate, because it teaches users the number means nothing.
 */
const DETERMINATE_STAGES = new Set<JobStage>(["uploading", "parsing", "importing"]);

export function isDeterminateStage(stage: JobStage): boolean {
  return DETERMINATE_STAGES.has(stage);
}

// ── Status tones ────────────────────────────────────────────────────────────
// The only place domain state maps to a visual tone. Screens call these rather
// than choosing colours, so a state looks the same everywhere it appears.

export type StatusTone = "neutral" | "info" | "success" | "warning" | "danger";

export function datasetTone(status: DatasetStatus): StatusTone {
  switch (status) {
    case "ready":
      return "success";
    case "importing":
      return "info";
    case "failed":
      return "danger";
    case "archived":
      return "warning";
    case "draft":
      return "neutral";
  }
}

export const DATASET_STATUS_LABELS: Record<DatasetStatus, string> = {
  draft: "Draft",
  importing: "Importing",
  ready: "Ready",
  failed: "Failed",
  archived: "Archived",
};

export function jobTone(status: JobStatus): StatusTone {
  switch (status) {
    case "succeeded":
      return "success";
    case "running":
      return "info";
    case "failed":
      return "danger";
    case "cancelled":
      return "warning";
    case "pending":
      return "neutral";
  }
}

/** True while the job is doing work — drives pulsing indicators. */
export function isJobActive(status: JobStatus): boolean {
  return status === "running" || status === "pending";
}
