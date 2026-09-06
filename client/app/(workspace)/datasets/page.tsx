import type { Metadata } from "next";
import Link from "next/link";
import { Database, Plus } from "lucide-react";

import { auth } from "@/lib/auth";
import { listDatasets } from "@/lib/datasets/server/queries";
import { PageBody, PageHeader } from "@/components/workspace/PageHeader";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Panel } from "@/components/ui/card";
import { Status } from "@/components/ui/status";
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DATASET_STATUS_LABELS,
  datasetTone,
} from "@/lib/datasets/stages";
import { formatCompactCount, formatRelativeTime } from "@/lib/format";

export const metadata: Metadata = {
  title: "Datasets",
  robots: { index: false, follow: false },
};

// Dataset status changes while a worker runs, so this page must not be cached.
export const dynamic = "force-dynamic";

export default async function DatasetsPage() {
  const session = await auth();

  if (!session?.user?.id) {
    return (
      <PageBody>
        <PageHeader
          title="Datasets"
          description="Import a GTFS feed to explore its routes, stops, trips and service."
        />
        <EmptyState
          icon={Database}
          title="Sign in to manage datasets"
          description="Datasets are private to the account that imports them."
          action={
            <ButtonLink href="/auth/signin">Sign in</ButtonLink>
          }
        />
      </PageBody>
    );
  }

  const datasets = await listDatasets(session.user.id);

  return (
    <PageBody wide>
      <PageHeader
        title="Datasets"
        description="Every GTFS feed you have imported, and what is in it."
        actions={
          <ButtonLink href="/datasets/new">
            <Plus />
            New dataset
          </ButtonLink>
        }
      />

      {datasets.length === 0 ? (
        <EmptyState
          icon={Database}
          title="No datasets yet"
          description="Import a GTFS archive to get started. Uploads go straight to storage, so feeds of any size are fine — you can close the tab while one processes."
          action={
            <ButtonLink href="/datasets/new">
              <Plus />
              New dataset
            </ButtonLink>
          }
        />
      ) : (
        <Panel className="overflow-hidden">
          <TableContainer>
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Dataset</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead numeric>Routes</TableHead>
                  <TableHead numeric>Stops</TableHead>
                  <TableHead numeric>Trips</TableHead>
                  <TableHead>Updated</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {datasets.map((dataset) => (
                  <TableRow key={dataset.id}>
                    <TableCell className="max-w-xs">
                      <Link
                        href={`/datasets/${dataset.id}`}
                        className="block truncate font-medium text-foreground transition-colors hover:text-brand focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
                      >
                        {dataset.name}
                      </Link>
                      {dataset.feedInfo?.agencyName && (
                        <span className="block truncate text-xs text-muted-foreground">
                          {dataset.feedInfo.agencyName}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Status
                        tone={datasetTone(dataset.status)}
                        pulse={dataset.status === "importing"}
                      >
                        {DATASET_STATUS_LABELS[dataset.status]}
                      </Status>
                    </TableCell>
                    <TableCell numeric className="text-muted-foreground">
                      {formatCompactCount(dataset.metrics?.routes)}
                    </TableCell>
                    <TableCell numeric className="text-muted-foreground">
                      {formatCompactCount(dataset.metrics?.stops)}
                    </TableCell>
                    <TableCell numeric className="text-muted-foreground">
                      {formatCompactCount(dataset.metrics?.trips)}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatRelativeTime(dataset.readyAt ?? dataset.createdAt)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Panel>
      )}
    </PageBody>
  );
}
