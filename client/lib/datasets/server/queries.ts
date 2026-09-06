import "server-only";

import { and, desc, eq, sql as raw } from "drizzle-orm";

import {
  db,
  datasets,
  datasetMetrics,
  datasetIssues,
  ingestionJobs,
  processingEvents,
  type Dataset,
  type DatasetMetrics,
  type IngestionJob,
} from "@/lib/db";

/**
 * Read queries for the workspace.
 *
 * Every function here is scoped by owner and returns exactly the columns a
 * screen renders. Server Components serialize whatever they hand a client
 * component into the HTML payload, so selecting `*` here would ship columns
 * nobody displays over the wire on every navigation.
 */

export interface DatasetSummary {
  id: string;
  name: string;
  description: string | null;
  status: Dataset["status"];
  feedInfo: Dataset["feedInfo"];
  createdAt: Date;
  readyAt: Date | null;
  metrics: DatasetMetrics | null;
}

export async function listDatasets(ownerId: string): Promise<DatasetSummary[]> {
  return db
    .select({
      id: datasets.id,
      name: datasets.name,
      description: datasets.description,
      status: datasets.status,
      feedInfo: datasets.feedInfo,
      createdAt: datasets.createdAt,
      readyAt: datasets.readyAt,
      metrics: datasetMetrics.metrics,
    })
    .from(datasets)
    .leftJoin(datasetMetrics, eq(datasetMetrics.datasetId, datasets.id))
    .where(eq(datasets.ownerId, ownerId))
    .orderBy(desc(datasets.createdAt));
}

export async function getDataset(
  datasetId: string,
  ownerId: string
): Promise<DatasetSummary | null> {
  const [row] = await db
    .select({
      id: datasets.id,
      name: datasets.name,
      description: datasets.description,
      status: datasets.status,
      feedInfo: datasets.feedInfo,
      createdAt: datasets.createdAt,
      readyAt: datasets.readyAt,
      metrics: datasetMetrics.metrics,
    })
    .from(datasets)
    .leftJoin(datasetMetrics, eq(datasetMetrics.datasetId, datasets.id))
    .where(and(eq(datasets.id, datasetId), eq(datasets.ownerId, ownerId)))
    .limit(1);
  return row ?? null;
}

/** The job the processing screen watches — the newest for this dataset. */
export async function getLatestJob(
  datasetId: string
): Promise<IngestionJob | null> {
  const [job] = await db
    .select()
    .from(ingestionJobs)
    .where(eq(ingestionJobs.datasetId, datasetId))
    .orderBy(desc(ingestionJobs.createdAt))
    .limit(1);
  return job ?? null;
}

export async function getJobEvents(jobId: string) {
  return db
    .select({
      stage: processingEvents.stage,
      kind: processingEvents.kind,
      message: processingEvents.message,
      durationMs: processingEvents.durationMs,
      createdAt: processingEvents.createdAt,
    })
    .from(processingEvents)
    .where(eq(processingEvents.jobId, jobId))
    .orderBy(processingEvents.createdAt);
}

export async function getDatasetIssues(datasetId: string) {
  return db
    .select({
      id: datasetIssues.id,
      severity: datasetIssues.severity,
      code: datasetIssues.code,
      file: datasetIssues.file,
      message: datasetIssues.message,
      count: datasetIssues.count,
      sample: datasetIssues.sample,
    })
    .from(datasetIssues)
    .where(eq(datasetIssues.datasetId, datasetId))
    // Errors first, then the noisiest warnings — the order a person triages in.
    .orderBy(
      raw`case ${datasetIssues.severity} when 'error' then 0 when 'warning' then 1 else 2 end`,
      desc(datasetIssues.count)
    );
}
