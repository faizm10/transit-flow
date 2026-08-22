/**
 * Official GO Transit ingestion contract.
 *
 * UI-independent. These shapes should match the future ingestion API so
 * /admin/gtfs can swap the stub for a real worker without rewriting components.
 *
 * This is NOT the city-feed overlay system (browser-parsed, stored in Neon).
 */

/** Pipeline stages the worker will report. Terminal states are included. */
export type GtfsIngestionStage =
  | "queued"
  | "extracting"
  | "validating"
  | "processing_routes"
  | "processing_schedules"
  | "building_simulation_artifacts"
  | "validating_output"
  | "completed"
  | "failed";

/** Work stages only — the timeline UI iterates this, not completed/failed. */
export const GTFS_INGESTION_WORK_STAGES = [
  "queued",
  "extracting",
  "validating",
  "processing_routes",
  "processing_schedules",
  "building_simulation_artifacts",
  "validating_output",
] as const satisfies readonly GtfsIngestionStage[];

export type GtfsIngestionWorkStage = (typeof GTFS_INGESTION_WORK_STAGES)[number];

export type GtfsStageRunStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "skipped";

export interface GtfsIngestionStageRun {
  stage: GtfsIngestionWorkStage;
  status: GtfsStageRunStatus;
  startedAt: string | null;
  finishedAt: string | null;
}

export interface GtfsIngestionJobError {
  stage: GtfsIngestionStage;
  message: string;
  details?: string;
}

export interface GtfsIngestionJob {
  id: string;
  /** Set once the worker allocates a version row; null while still queued. */
  versionId: string | null;
  /** Current head of the pipeline (may be completed | failed). */
  stage: GtfsIngestionStage;
  stages: GtfsIngestionStageRun[];
  error: GtfsIngestionJobError | null;
  createdAt: string;
  updatedAt: string;
}

export type GtfsVersionStatus = "active" | "inactive" | "failed" | "processing";

export interface GtfsVersion {
  id: string;
  version: string;
  source: string;
  importedAt: string;
  processingDurationMs: number | null;
  status: GtfsVersionStatus;
  isActive: boolean;
}

export interface GtfsAdminSnapshot {
  activeVersion: GtfsVersion | null;
  currentJob: GtfsIngestionJob | null;
  versions: GtfsVersion[];
}

export interface StartIngestionRequest {
  filename: string;
  byteSize: number;
}

export interface StartIngestionResponse {
  job: GtfsIngestionJob;
}
