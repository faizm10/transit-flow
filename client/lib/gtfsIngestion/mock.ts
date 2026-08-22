/**
 * Fixture data for the admin GTFS stub.
 *
 * Imported only by /api/admin/gtfs routes. The UI must go through HTTP
 * (see client.ts) so swapping this for Postgres + a worker is a route-body
 * change, not a component rewrite.
 */

import {
  GTFS_INGESTION_WORK_STAGES,
  type GtfsAdminSnapshot,
  type GtfsIngestionJob,
  type GtfsStageRunStatus,
  type GtfsVersion,
} from "./types";

export const MOCK_VERSIONS: GtfsVersion[] = [
  {
    id: "ver_20260822",
    version: "2026.08.22",
    source: "Metrolinx GO Transit GTFS",
    importedAt: "2026-08-22T05:10:00.000Z",
    processingDurationMs: 72_000,
    status: "failed",
    isActive: false,
  },
  {
    id: "ver_20260821",
    version: "2026.08.21",
    source: "Metrolinx GO Transit GTFS",
    importedAt: "2026-08-21T14:02:11.000Z",
    processingDurationMs: 272_000,
    status: "active",
    isActive: true,
  },
  {
    id: "ver_20260814",
    version: "2026.08.14",
    source: "Metrolinx GO Transit GTFS",
    importedAt: "2026-08-14T09:41:00.000Z",
    processingDurationMs: 301_000,
    status: "inactive",
    isActive: false,
  },
  {
    id: "ver_20260807",
    version: "2026.08.07",
    source: "Metrolinx GO Transit GTFS",
    importedAt: "2026-08-07T18:22:00.000Z",
    processingDurationMs: 72_000,
    status: "failed",
    isActive: false,
  },
];

export const MOCK_FAILED_JOB: GtfsIngestionJob = {
  id: "job_mock_failed",
  versionId: "ver_20260822",
  stage: "failed",
  stages: GTFS_INGESTION_WORK_STAGES.map((stage, i) => ({
    stage,
    status:
      i < 2 ? "completed" : i === 2 ? "failed" : ("skipped" as GtfsStageRunStatus),
    startedAt: i <= 2 ? "2026-08-22T05:10:00.000Z" : null,
    finishedAt: i <= 2 ? "2026-08-22T05:11:12.000Z" : null,
  })),
  error: {
    stage: "validating",
    message: "stop_times.txt references unknown stop_id values",
    details: "12,481 rows referenced stop_ids missing from stops.txt (sample: UN-9999).",
  },
  createdAt: "2026-08-22T05:10:00.000Z",
  updatedAt: "2026-08-22T05:11:12.000Z",
};

export function getMockSnapshot(): GtfsAdminSnapshot {
  const activeVersion = MOCK_VERSIONS.find((v) => v.isActive) ?? null;
  return {
    activeVersion,
    // Last ingest failed; 2026.08.21 remains live. Start ingestion replaces this job.
    currentJob: MOCK_FAILED_JOB,
    versions: MOCK_VERSIONS,
  };
}

/** Stub “start ingestion” — does not store the zip or enqueue work. */
export function createMockQueuedJob(_filename: string): GtfsIngestionJob {
  const now = new Date().toISOString();
  return {
    id: `job_stub_${Date.now()}`,
    versionId: null,
    stage: "queued",
    stages: GTFS_INGESTION_WORK_STAGES.map((stage, i) => ({
      stage,
      status: i === 0 ? "running" : "pending",
      startedAt: i === 0 ? now : null,
      finishedAt: null,
    })),
    error: null,
    createdAt: now,
    updatedAt: now,
  };
}

/** Kept so the filename is visible in logs without implying we stored the file. */
export function logStubIngest(filename: string, byteSize: number): void {
  console.info(
    `[gtfs-ingest stub] accepted ${filename} (${byteSize} bytes) — no file stored, no worker started`
  );
}
