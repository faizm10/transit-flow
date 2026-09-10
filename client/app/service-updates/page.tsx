import type { Metadata } from "next";
import { CheckCircle, RefreshCw, AlertTriangle, Wifi } from "lucide-react";
import MarketingHeader from "@/components/marketing/MarketingHeader";
import { AlertCard } from "@/components/service-updates/AlertCard";
import { LineFilterBar } from "@/components/service-updates/LineFilterBar";
import { fetchServiceUpdates } from "@/lib/serviceUpdates";
import type { ServiceAlert, ServiceUpdatesResult } from "@/lib/serviceUpdates";

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://transit-flow-two.vercel.app";

export const metadata: Metadata = {
  title: "Service Updates — TransitFlow",
  description:
    "Live GO Transit service alerts — delays, cancellations, and service notices for Lakeshore West, Barrie, Kitchener, Stouffville, Richmond Hill, Milton, and UP Express lines.",
  alternates: { canonical: `${SITE_URL}/service-updates` },
  openGraph: {
    title: "GO Transit Service Updates — TransitFlow",
    description:
      "Live GO Transit service alerts — delays, cancellations, and service notices for all GO lines.",
    url: `${SITE_URL}/service-updates`,
  },
};

function formatFetchTime(iso: string): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }).format(new Date(iso));
  } catch {
    return "";
  }
}

function SourceBadge({ source }: { source: ServiceUpdatesResult["source"] }) {
  if (source === "metrolinx-api") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700 border border-emerald-200">
        <Wifi className="h-3 w-3" />
        Live — Metrolinx API
      </span>
    );
  }
  if (source === "html-fallback" || source === "nextdata") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-700 border border-amber-200">
        <AlertTriangle className="h-3 w-3" />
        Scraped — gotransit.com
      </span>
    );
  }
  if (source === "error") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-medium text-red-600 border border-red-200">
        <AlertTriangle className="h-3 w-3" />
        Source unavailable
      </span>
    );
  }
  return null;
}

function AlertColumn({
  title,
  alerts,
  emptyLabel,
}: {
  title: string;
  alerts: ServiceAlert[];
  emptyLabel: string;
}) {
  return (
    <section>
      <h2 className="mb-4 flex items-baseline gap-2 text-xs font-semibold uppercase tracking-wider text-gray-400">
        {title}
        <span className="tabular-nums">{alerts.length}</span>
      </h2>
      {alerts.length === 0 ? (
        <p className="rounded-xl border border-dashed border-gray-200 px-4 py-10 text-center text-sm text-gray-400">
          {emptyLabel}
        </p>
      ) : (
        <div className="space-y-3">
          {alerts.map((alert) => (
            <AlertCard key={alert.id} alert={alert} />
          ))}
        </div>
      )}
    </section>
  );
}

export default async function ServiceUpdatesPage({
  searchParams,
}: {
  searchParams: Promise<{ line?: string }>;
}) {
  const { line } = await searchParams;
  const { alerts, fetchedAt, source } = await fetchServiceUpdates();

  const filtered = (
    line ? alerts.filter((a) => a.routes.includes(line.toUpperCase())) : alerts
  )
    .slice()
    .sort(
      (a, b) => new Date(b.postedAt).getTime() - new Date(a.postedAt).getTime()
    );

  // Two lanes: things that affect a trip in progress vs. standing notices
  // (elevator outages, stop relocations, general advisories).
  const serviceUpdates = filtered.filter(
    (a) => a.type === "delay" || a.type === "cancellation"
  );
  const notices = filtered.filter(
    (a) => a.type === "information" || a.type === "other"
  );

  const delayCount = alerts.filter((a) => a.type === "delay").length;
  const cancelCount = alerts.filter((a) => a.type === "cancellation").length;

  return (
    <div className="min-h-screen bg-white">
      <MarketingHeader />

      <main className="mx-auto max-w-5xl px-5 pb-24 pt-14 lg:px-8">
        {/* Page header */}
        <div className="mb-10">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-gray-900">
                Service Updates
              </h1>
              <p className="mt-1.5 text-sm text-gray-500">
                Real-time GO Transit alerts — delays, cancellations, and service notices.
              </p>
            </div>
            <SourceBadge source={source} />
          </div>

          {/* Quiet summary line: counts + freshness */}
          <div className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-gray-100 pt-3 text-xs text-gray-400">
            <span>
              {alerts.length > 0 ? (
                <>
                  <span className="font-semibold text-gray-700">{alerts.length}</span>{" "}
                  active
                  {delayCount > 0 &&
                    ` · ${delayCount} delay${delayCount !== 1 ? "s" : ""}`}
                  {cancelCount > 0 &&
                    ` · ${cancelCount} cancellation${cancelCount !== 1 ? "s" : ""}`}
                </>
              ) : (
                "No active alerts"
              )}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <RefreshCw className="h-3 w-3" />
              Updated {formatFetchTime(fetchedAt)}
            </span>
          </div>
        </div>

        {/* Line filter */}
        <LineFilterBar activeLine={line} />

        {/* Alert list */}
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-4 py-20 text-center">
            {/* A green tick is a claim, not decoration — keep it for the
                authoritative source and stay neutral otherwise. */}
            <div
              className={`flex h-16 w-16 items-center justify-center rounded-full ${
                source === "metrolinx-api" ? "bg-[#007A33]/10" : "bg-gray-100"
              }`}
            >
              <CheckCircle
                className={`h-8 w-8 ${
                  source === "metrolinx-api" ? "text-[#007A33]" : "text-gray-400"
                }`}
              />
            </div>
            <div>
              <p className="text-base font-semibold text-gray-900">
                {source !== "metrolinx-api"
                  ? "No alerts available"
                  : alerts.length === 0
                    ? "No active service alerts"
                    : `No alerts for ${line?.toUpperCase()} right now`}
              </p>
              <p className="mt-1 text-sm text-gray-500">
                {/* Only the Metrolinx API is authoritative enough to say
                    "operating normally". The scrape is best-effort and its
                    selectors drift with gotransit.com, so an empty result
                    there means the scrape found nothing — which is not the
                    same as nothing being wrong, and not something to tell
                    someone planning a journey. */}
                {source === "metrolinx-api"
                  ? alerts.length === 0
                    ? "All GO Transit lines are operating normally."
                    : "This line appears to be running on schedule."
                  : "No alerts could be read from gotransit.com. Check GO's own site before travelling."}
              </p>
            </div>
          </div>
        ) : (
          <div className="grid gap-x-6 gap-y-10 md:grid-cols-2">
            <AlertColumn
              title="Service updates"
              alerts={serviceUpdates}
              emptyLabel="No delays or cancellations right now."
            />
            <AlertColumn
              title="Notices"
              alerts={notices}
              emptyLabel="No notices right now."
            />
          </div>
        )}

        {/* Footer note */}
        <p className="mt-12 text-center text-xs text-gray-400">
          {source === "metrolinx-api" ? (
            <>
              Powered by the{" "}
              <a
                href="https://api.openmetrolinx.com/OpenDataAPI/Help/Index/en"
                target="_blank"
                rel="noopener noreferrer"
                className="underline transition-colors hover:text-gray-600"
              >
                Metrolinx Open Data API
              </a>
              . Refreshes every 5 minutes.
            </>
          ) : (
            <>
              Data sourced from{" "}
              <a
                href="https://www.gotransit.com/en/service-updates"
                target="_blank"
                rel="noopener noreferrer"
                className="underline transition-colors hover:text-gray-600"
              >
                gotransit.com
              </a>
              . Refreshes every 5 minutes.
            </>
          )}
        </p>
      </main>
    </div>
  );
}
