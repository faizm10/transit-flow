import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AlertTriangle, CheckCircle2, Upload } from "lucide-react";

import { auth } from "@/lib/auth";
import {
  getDataset,
  getDatasetIssues,
  getLatestJob,
} from "@/lib/datasets/server/queries";
import { PageBody, PageHeader } from "@/components/workspace/PageHeader";
import { ProcessingView } from "@/components/datasets/ProcessingView";
import { Button } from "@/components/ui/button";
import { Panel, PanelContent, PanelHeader, PanelTitle } from "@/components/ui/card";
import { Status } from "@/components/ui/status";
import { EmptyState } from "@/components/ui/empty-state";
import { DataList, DataListItem, Metric } from "@/components/workspace/DataList";
import {
  DATASET_STATUS_LABELS,
  datasetTone,
} from "@/lib/datasets/stages";
import { routeTypeLabel } from "@/lib/gtfs/spec";
import {
  formatBytes,
  formatCount,
  formatDuration,
  formatRelativeTime,
  formatTimestamp,
} from "@/lib/format";

export const metadata: Metadata = { robots: { index: false, follow: false } };

// A dataset's status changes underneath this page while a worker runs.
export const dynamic = "force-dynamic";

export default async function DatasetPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) redirect(`/auth/signin?callbackUrl=/datasets/${id}`);

  const dataset = await getDataset(id, session.user.id);
  if (!dataset) notFound();

  const job = await getLatestJob(dataset.id);

  // ── Draft: nothing uploaded yet ──────────────────────────────────────────
  if (dataset.status === "draft" && !job) {
    return (
      <PageBody>
        <Header dataset={dataset} />
        <EmptyState
          icon={Upload}
          title="No feed uploaded yet"
          description="This dataset was created but no GTFS archive was uploaded. Start an import to fill it."
          action={
            <Button render={<Link href="/datasets/new" />}>Import a feed</Button>
          }
        />
      </PageBody>
    );
  }

  // ── In flight, or failed: the processing screen owns the page ────────────
  if (job && (job.status === "pending" || job.status === "running" || job.status === "failed")) {
    return (
      <PageBody>
        <Header dataset={dataset} />
        <ProcessingView
          datasetId={dataset.id}
          datasetName={dataset.name}
          initialJob={{
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
            startedAt: job.startedAt?.toISOString() ?? null,
            finishedAt: job.finishedAt?.toISOString() ?? null,
          }}
        />
      </PageBody>
    );
  }

  // ── Ready: the overview ──────────────────────────────────────────────────
  const [issues] = await Promise.all([getDatasetIssues(dataset.id)]);
  const metrics = dataset.metrics;
  const errors = issues.filter((i) => i.severity === "error");
  const warnings = issues.filter((i) => i.severity === "warning");

  return (
    <PageBody wide>
      <Header dataset={dataset} />

      {/* The three figures that lead the page. Borderless — hierarchy comes
          from type size, not from wrapping each number in its own card. */}
      <div className="grid grid-cols-2 gap-x-8 gap-y-6 sm:grid-cols-4">
        <Metric label="Routes" value={formatCount(metrics?.routes)} />
        <Metric label="Stops" value={formatCount(metrics?.stops)} />
        <Metric label="Trips" value={formatCount(metrics?.trips)} />
        <Metric
          label="Stop times"
          value={formatCount(metrics?.stopTimes)}
          hint="scheduled calls"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel>
          <PanelHeader>
            <PanelTitle>Feed</PanelTitle>
          </PanelHeader>
          <PanelContent>
            <DataList>
              <DataListItem
                label="Agency"
                value={dataset.feedInfo?.agencyName ?? "—"}
              />
              <DataListItem
                label="Timezone"
                value={dataset.feedInfo?.timezone ?? "—"}
              />
              <DataListItem
                label="Service starts"
                value={dataset.feedInfo?.serviceStart ?? "—"}
              />
              <DataListItem
                label="Service ends"
                value={dataset.feedInfo?.serviceEnd ?? "—"}
              />
              <DataListItem
                label="Shapes"
                value={formatCount(metrics?.shapes)}
              />
              <DataListItem
                label="Service patterns"
                value={formatCount(metrics?.services)}
              />
            </DataList>
          </PanelContent>
        </Panel>

        <Panel>
          <PanelHeader>
            <PanelTitle>Import</PanelTitle>
          </PanelHeader>
          <PanelContent>
            <DataList>
              <DataListItem
                label="Imported"
                value={
                  dataset.readyAt ? formatRelativeTime(dataset.readyAt) : "—"
                }
                hint={
                  dataset.readyAt ? formatTimestamp(dataset.readyAt) : undefined
                }
              />
              <DataListItem
                label="Processing time"
                value={
                  metrics?.processingDurationMs
                    ? formatDuration(metrics.processingDurationMs)
                    : "—"
                }
              />
              <DataListItem
                label="Archive size"
                value={
                  metrics?.sourceByteSize
                    ? formatBytes(metrics.sourceByteSize)
                    : "—"
                }
              />
              <DataListItem
                label="Feed health"
                value={
                  errors.length > 0 ? (
                    <span className="text-danger">
                      {errors.length} {errors.length === 1 ? "error" : "errors"}
                    </span>
                  ) : warnings.length > 0 ? (
                    <span className="text-warning">
                      {warnings.length}{" "}
                      {warnings.length === 1 ? "warning" : "warnings"}
                    </span>
                  ) : (
                    <span className="text-success">No issues</span>
                  )
                }
              />
            </DataList>
          </PanelContent>
        </Panel>
      </div>

      {metrics?.routesByType && Object.keys(metrics.routesByType).length > 0 && (
        <Panel>
          <PanelHeader>
            <PanelTitle>Modes</PanelTitle>
          </PanelHeader>
          <PanelContent>
            <DataList columns={3}>
              {Object.entries(metrics.routesByType)
                .sort((a, b) => b[1] - a[1])
                .map(([type, count]) => (
                  <DataListItem
                    key={type}
                    label={routeTypeLabel(Number(type))}
                    value={`${formatCount(count)} ${count === 1 ? "route" : "routes"}`}
                  />
                ))}
            </DataList>
          </PanelContent>
        </Panel>
      )}

      <Panel>
        <PanelHeader>
          <PanelTitle>Data quality</PanelTitle>
        </PanelHeader>
        <PanelContent>
          {issues.length === 0 ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <CheckCircle2 className="size-4 text-success" />
              No problems were found in this feed.
            </p>
          ) : (
            <ul className="space-y-3">
              {issues.map((issue) => (
                <li key={issue.id} className="flex items-start gap-2.5">
                  <AlertTriangle
                    className={
                      issue.severity === "error"
                        ? "mt-0.5 size-4 shrink-0 text-danger"
                        : "mt-0.5 size-4 shrink-0 text-warning"
                    }
                  />
                  <div className="min-w-0">
                    <p className="text-sm">{issue.message}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {issue.file && <span className="font-mono">{issue.file}</span>}
                      {issue.file && " · "}
                      {formatCount(issue.count)}{" "}
                      {issue.count === 1 ? "occurrence" : "occurrences"}
                      {Array.isArray(issue.sample) && issue.sample.length > 0 && (
                        <>
                          {" · e.g. "}
                          <span className="font-mono">
                            {issue.sample.slice(0, 3).map(String).join(", ")}
                          </span>
                        </>
                      )}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </PanelContent>
      </Panel>
    </PageBody>
  );
}

function Header({
  dataset,
}: {
  dataset: NonNullable<Awaited<ReturnType<typeof getDataset>>>;
}) {
  return (
    <PageHeader
      eyebrow={
        <Link href="/datasets" className="hover:text-foreground">
          Datasets
        </Link>
      }
      title={dataset.name}
      description={dataset.description ?? undefined}
      actions={
        <Status
          tone={datasetTone(dataset.status)}
          pulse={dataset.status === "importing"}
        >
          {DATASET_STATUS_LABELS[dataset.status]}
        </Status>
      }
    />
  );
}
