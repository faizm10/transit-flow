import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { MapPin } from "lucide-react";

import { auth } from "@/lib/auth";
import { getDataset } from "@/lib/datasets/server/queries";
import { listStops, PAGE_SIZE } from "@/lib/datasets/server/explore";
import { PageBody, PageHeader } from "@/components/workspace/PageHeader";
import { DatasetTabs } from "@/components/datasets/DatasetTabs";
import { ExploreSearch } from "@/components/datasets/ExploreTable";
import { ButtonLink } from "@/components/ui/button";
import { Panel } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCount } from "@/lib/format";

export const metadata: Metadata = {
  title: "Stops",
  robots: { index: false, follow: false },
};

export default async function StopsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ q?: string; cursor?: string }>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);

  const session = await auth();
  if (!session?.user?.id) redirect(`/auth/signin?callbackUrl=/datasets/${id}/stops`);

  const dataset = await getDataset(id, session.user.id);
  if (!dataset) notFound();

  const { items, nextCursor } = await listStops({
    datasetId: dataset.id,
    search: query.q,
    cursor: query.cursor,
  });

  const base = `/datasets/${dataset.id}/stops`;
  const nextHref = nextCursor
    ? `${base}?${new URLSearchParams({
        ...(query.q ? { q: query.q } : {}),
        cursor: nextCursor,
      })}`
    : null;

  return (
    <PageBody wide>
      <PageHeader
        eyebrow={
          <Link href={`/datasets/${dataset.id}`} className="hover:text-foreground">
            {dataset.name}
          </Link>
        }
        title="Stops"
        description={
          dataset.metrics?.stops
            ? `${formatCount(dataset.metrics.stops)} stops in this feed.`
            : undefined
        }
      />

      <DatasetTabs datasetId={dataset.id} />

      <ExploreSearch placeholder="Search stops by name or code" />

      {items.length === 0 ? (
        <EmptyState
          icon={MapPin}
          title={query.q ? "No matching stops" : "No stops"}
          description={
            query.q
              ? `Nothing in this feed matches “${query.q}”.`
              : "This dataset has no boardable stops."
          }
        />
      ) : (
        <>
          <Panel className="overflow-hidden">
            <TableContainer>
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Stop</TableHead>
                    <TableHead>Code</TableHead>
                    <TableHead numeric>Routes</TableHead>
                    <TableHead numeric>Position</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((stop) => (
                    <TableRow key={stop.stopId}>
                      <TableCell className="max-w-md">
                        <span className="block truncate font-medium">
                          {stop.name}
                        </span>
                        <span className="block truncate font-mono text-xs text-muted-foreground">
                          {stop.stopId}
                        </span>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {stop.code ?? "—"}
                      </TableCell>
                      <TableCell numeric className="text-muted-foreground">
                        {formatCount(stop.routeCount)}
                      </TableCell>
                      <TableCell numeric className="font-mono text-xs text-muted-foreground">
                        {stop.lat != null && stop.lon != null
                          ? `${stop.lat.toFixed(4)}, ${stop.lon.toFixed(4)}`
                          : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Panel>

          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              Showing {items.length} {items.length === 1 ? "stop" : "stops"}
              {items.length === PAGE_SIZE && nextHref ? " · more available" : ""}
            </p>
            {nextHref && (
              <ButtonLink href={nextHref} variant="outline" size="sm">
                Next
              </ButtonLink>
            )}
          </div>
        </>
      )}
    </PageBody>
  );
}
