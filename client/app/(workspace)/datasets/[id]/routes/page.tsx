import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Route as RouteIcon } from "lucide-react";

import { auth } from "@/lib/auth";
import { getDataset } from "@/lib/datasets/server/queries";
import { listRoutes, PAGE_SIZE } from "@/lib/datasets/server/explore";
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
import { routeTypeLabel } from "@/lib/gtfs/spec";
import { formatCount } from "@/lib/format";

export const metadata: Metadata = {
  title: "Routes",
  robots: { index: false, follow: false },
};

export default async function RoutesPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ q?: string; cursor?: string }>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);

  const session = await auth();
  if (!session?.user?.id) redirect(`/auth/signin?callbackUrl=/datasets/${id}/routes`);

  const dataset = await getDataset(id, session.user.id);
  if (!dataset) notFound();

  // Filtered and paged in the database. The browser never sees more than a
  // page, whatever the size of the feed.
  const { items, nextCursor } = await listRoutes({
    datasetId: dataset.id,
    search: query.q,
    cursor: query.cursor,
  });

  const base = `/datasets/${dataset.id}/routes`;
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
        title="Routes"
        description={
          dataset.metrics?.routes
            ? `${formatCount(dataset.metrics.routes)} routes in this feed.`
            : undefined
        }
      />

      <DatasetTabs datasetId={dataset.id} />

      <ExploreSearch placeholder="Search routes" />

      {items.length === 0 ? (
        <EmptyState
          icon={RouteIcon}
          title={query.q ? "No matching routes" : "No routes"}
          description={
            query.q
              ? `Nothing in this feed matches “${query.q}”.`
              : "This dataset has no routes."
          }
        />
      ) : (
        <>
          <Panel className="overflow-hidden">
            <TableContainer>
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="w-24">Route</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Mode</TableHead>
                    <TableHead numeric>Trips</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((route) => (
                    <TableRow key={route.routeId}>
                      <TableCell>
                        <span className="inline-flex items-center gap-2">
                          <span
                            aria-hidden
                            className="size-2 shrink-0 rounded-full"
                            style={{
                              backgroundColor: route.color
                                ? `#${route.color}`
                                : "var(--border-strong)",
                            }}
                          />
                          <span className="font-medium">
                            {route.shortName ?? route.routeId}
                          </span>
                        </span>
                      </TableCell>
                      <TableCell className="max-w-md truncate text-muted-foreground">
                        {route.longName ?? "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {routeTypeLabel(route.type)}
                      </TableCell>
                      <TableCell numeric className="text-muted-foreground">
                        {formatCount(route.tripCount)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Panel>

          {/* Cursor pagination: no page numbers, because a keyset cursor has no
              notion of "page 7" — and OFFSET, which does, gets slower the
              deeper you go. */}
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              Showing {items.length} {items.length === 1 ? "route" : "routes"}
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
