/**
 * Control plane — datasets, uploads, ingestion jobs, and the queue.
 *
 * Small, frequently-read rows. This is what the workspace UI polls and what the
 * worker claims work from. Deliberately separate from the GTFS entity tables
 * (tables/gtfs.ts), which are large, write-once and read by query.
 *
 * The queue lives here rather than in Redis: a worker claims a job with
 * `FOR UPDATE SKIP LOCKED`, and because job state and queue state are the same
 * row, a crash mid-job cannot leave the two disagreeing.
 */

import { sql } from "drizzle-orm";
import {
  pgTable,
  text,
  uuid,
  timestamp,
  integer,
  bigint,
  jsonb,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import { users } from "./community";
import type {
  DatasetStatus,
  JobStage,
  JobStatus,
} from "@/lib/datasets/stages";

// ── Datasets ────────────────────────────────────────────────────────────────

/** Feed-level facts, filled in by the worker once agency.txt is parsed. */
export interface DatasetFeedInfo {
  agencyName?: string;
  agencyUrl?: string;
  timezone?: string;
  feedVersion?: string;
  publisherName?: string;
  /** ISO dates derived from calendar.txt / calendar_dates.txt. */
  serviceStart?: string;
  serviceEnd?: string;
  /** [west, south, east, north] over all stops. */
  bbox?: [number, number, number, number];
}

export const datasets = pgTable(
  "datasets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    // draft | importing | ready | failed | archived — see lib/datasets/stages.ts
    status: text("status").$type<DatasetStatus>().notNull().default("draft"),
    feedInfo: jsonb("feed_info").$type<DatasetFeedInfo | null>(),
    /** Object-storage prefix holding this dataset's artifacts. */
    artifactPrefix: text("artifact_prefix"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    readyAt: timestamp("ready_at", { withTimezone: true }),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (table) => [
    index("datasets_owner_created_idx").on(table.ownerId, table.createdAt),
    index("datasets_status_idx").on(table.status),
  ]
);

// ── Uploads ─────────────────────────────────────────────────────────────────

/**
 * One archive, uploaded directly to object storage via presigned multipart.
 *
 * `parts` records each completed part's number and ETag. That is what makes an
 * interrupted upload resumable: the browser asks which parts already landed and
 * sends only the rest, instead of restarting a multi-gigabyte transfer.
 */
export interface UploadPart {
  partNumber: number;
  etag: string;
  size: number;
}

export const datasetUploads = pgTable(
  "dataset_uploads",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    datasetId: uuid("dataset_id")
      .notNull()
      .references(() => datasets.id, { onDelete: "cascade" }),
    /** Object key. Server-generated — never derived from the client filename. */
    storageKey: text("storage_key").notNull(),
    /** Original filename, for display only. Treated as untrusted. */
    filename: text("filename").notNull(),
    byteSize: bigint("byte_size", { mode: "number" }).notNull(),
    /** Client-computed SHA-256, re-verified server-side before processing. */
    checksumSha256: text("checksum_sha256"),
    /** S3 multipart upload id; null for a single-part PUT. */
    multipartUploadId: text("multipart_upload_id"),
    partSize: integer("part_size"),
    partCount: integer("part_count"),
    parts: jsonb("parts").$type<UploadPart[]>().notNull().default([]),
    // pending | uploading | completed | aborted
    status: text("status").notNull().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [
    index("dataset_uploads_dataset_idx").on(table.datasetId),
    uniqueIndex("dataset_uploads_storage_key_uidx").on(table.storageKey),
    // A dataset may only have one upload in flight at a time.
    uniqueIndex("dataset_uploads_one_active_uidx")
      .on(table.datasetId)
      .where(sql`${table.status} in ('pending', 'uploading')`),
  ]
);

// ── Ingestion jobs (also the queue) ─────────────────────────────────────────

/**
 * A structured failure. `code` is stable and machine-readable so the UI can
 * offer the right recovery action; `message` is the sentence a user reads;
 * `detail` carries the specifics that make it actionable — which file, which
 * ids, how many.
 */
export interface JobError {
  code: string;
  message: string;
  detail?: Record<string, unknown>;
  /** Whether a retry could plausibly succeed without a new upload. */
  retryable: boolean;
}

export const ingestionJobs = pgTable(
  "ingestion_jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    datasetId: uuid("dataset_id")
      .notNull()
      .references(() => datasets.id, { onDelete: "cascade" }),
    uploadId: uuid("upload_id").references(() => datasetUploads.id, {
      onDelete: "set null",
    }),
    // pending | running | succeeded | failed | cancelled
    status: text("status").$type<JobStatus>().notNull().default("pending"),
    stage: text("stage").$type<JobStage>().notNull().default("created"),
    /**
     * The furthest stage that finished cleanly. A retry resumes from here
     * rather than from the beginning — the point of Part 7's "retry processing"
     * instead of "re-upload several gigabytes".
     */
    lastCompletedStage: text("last_completed_stage").$type<JobStage | null>(),

    /**
     * Real units, not a percentage: bytes consumed, rows imported. The UI
     * derives a percentage only when `progressTotal` is known, and shows an
     * indeterminate bar otherwise.
     */
    progressCurrent: bigint("progress_current", { mode: "number" }),
    progressTotal: bigint("progress_total", { mode: "number" }),
    progressUnit: text("progress_unit"),

    attempt: integer("attempt").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(3),
    error: jsonb("error").$type<JobError | null>(),

    // ── Queue columns ──────────────────────────────────────────────────────
    /** When this job becomes claimable. Backoff pushes it into the future. */
    runAfter: timestamp("run_after", { withTimezone: true })
      .notNull()
      .defaultNow(),
    /** Worker identity holding the claim. */
    claimedBy: text("claimed_by"),
    claimedAt: timestamp("claimed_at", { withTimezone: true }),
    /**
     * Last liveness ping. A running job whose heartbeat has gone stale was
     * orphaned by a crashed worker and is reclaimable — this is what replaces
     * BullMQ's stalled-job detection.
     */
    heartbeatAt: timestamp("heartbeat_at", { withTimezone: true }),

    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("ingestion_jobs_dataset_created_idx").on(
      table.datasetId,
      table.createdAt
    ),
    // The claim query's index: pending jobs whose backoff has elapsed.
    index("ingestion_jobs_claimable_idx")
      .on(table.runAfter)
      .where(sql`${table.status} = 'pending'`),
    // Reaping orphaned jobs.
    index("ingestion_jobs_running_heartbeat_idx")
      .on(table.heartbeatAt)
      .where(sql`${table.status} = 'running'`),
    // At most one live job per dataset — two workers must not import the same
    // feed concurrently, and the app must not queue a second one.
    uniqueIndex("ingestion_jobs_one_live_uidx")
      .on(table.datasetId)
      .where(sql`${table.status} in ('pending', 'running')`),
  ]
);

// ── Processing events ───────────────────────────────────────────────────────

/**
 * Append-only stage log. Drives the processing screen's checklist and doubles
 * as the observability record — the structured events Part 18 asks for are
 * these rows, so we do not maintain a second logging path that can disagree
 * with what the user sees.
 */
export const processingEvents = pgTable(
  "processing_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    jobId: uuid("job_id")
      .notNull()
      .references(() => ingestionJobs.id, { onDelete: "cascade" }),
    stage: text("stage").$type<JobStage>().notNull(),
    // started | completed | failed | info
    kind: text("kind").notNull(),
    message: text("message"),
    /** Stage-specific facts: file name, row count, byte count. No PII. */
    data: jsonb("data").$type<Record<string, unknown> | null>(),
    durationMs: integer("duration_ms"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("processing_events_job_created_idx").on(table.jobId, table.createdAt)]
);

// ── Validation issues ───────────────────────────────────────────────────────

/**
 * What the Data Quality tab shows, and what makes an error message useful.
 *
 * "GTFS validation failed" is not actionable. `code`, `file`, `count` and
 * `sample` are what turn it into "trips.txt references 17 route_ids that do not
 * exist in routes.txt", with the offending ids to hand.
 */
export const datasetIssues = pgTable(
  "dataset_issues",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    datasetId: uuid("dataset_id")
      .notNull()
      .references(() => datasets.id, { onDelete: "cascade" }),
    jobId: uuid("job_id").references(() => ingestionJobs.id, {
      onDelete: "cascade",
    }),
    // error | warning | info — `error` blocks the dataset reaching ready.
    severity: text("severity").notNull(),
    /** Stable identifier, e.g. "unknown_route_reference". */
    code: text("code").notNull(),
    /** GTFS file the issue was found in, e.g. "trips.txt". */
    file: text("file"),
    message: text("message").notNull(),
    /** How many rows hit this issue — one row per code, not per occurrence. */
    count: integer("count").notNull().default(1),
    /** A handful of offending values, capped by the worker. */
    sample: jsonb("sample").$type<unknown[] | null>(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("dataset_issues_dataset_severity_idx").on(
      table.datasetId,
      table.severity
    ),
    uniqueIndex("dataset_issues_dataset_job_code_file_uidx").on(
      table.datasetId,
      table.jobId,
      table.code,
      table.file
    ),
  ]
);

// ── Metrics ─────────────────────────────────────────────────────────────────

export interface DatasetMetrics {
  agencies: number;
  routes: number;
  stops: number;
  trips: number;
  stopTimes: number;
  shapes: number;
  services: number;
  /** Route counts keyed by GTFS route_type. */
  routesByType?: Record<string, number>;
  /** Trips per weekday, index 0 = Sunday. */
  tripsByDayOfWeek?: number[];
  /** Wall-clock time of the ingestion that produced these. */
  processingDurationMs?: number;
  sourceByteSize?: number;
}

/**
 * One row per dataset, so the overview page is a single indexed lookup rather
 * than seven `count(*)` scans over millions of stop_times.
 */
export const datasetMetrics = pgTable("dataset_metrics", {
  datasetId: uuid("dataset_id")
    .primaryKey()
    .references(() => datasets.id, { onDelete: "cascade" }),
  metrics: jsonb("metrics").$type<DatasetMetrics>().notNull(),
  computedAt: timestamp("computed_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ── Type exports ────────────────────────────────────────────────────────────

export type Dataset = typeof datasets.$inferSelect;
export type NewDataset = typeof datasets.$inferInsert;
export type DatasetUpload = typeof datasetUploads.$inferSelect;
export type NewDatasetUpload = typeof datasetUploads.$inferInsert;
export type IngestionJob = typeof ingestionJobs.$inferSelect;
export type NewIngestionJob = typeof ingestionJobs.$inferInsert;
export type ProcessingEvent = typeof processingEvents.$inferSelect;
export type DatasetIssue = typeof datasetIssues.$inferSelect;
export type DatasetMetricRow = typeof datasetMetrics.$inferSelect;
