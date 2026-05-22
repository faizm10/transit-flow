import type { Metadata } from "next";
import { CheckCircle, RefreshCw, AlertTriangle, Wifi } from "lucide-react";
import MarketingHeader from "@/components/marketing/MarketingHeader";
import { AlertCard } from "@/components/service-updates/AlertCard";
import { LineFilterBar } from "@/components/service-updates/LineFilterBar";
import { fetchServiceUpdates } from "@/lib/serviceUpdates";
import type { ServiceUpdatesResult } from "@/lib/serviceUpdates";

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

export default async function ServiceUpdatesPage({
  searchParams,
}: {
  searchParams: Promise<{ line?: string }>;
}) {
  const { line } = await searchParams;
  const { alerts, fetchedAt, source } = await fetchServiceUpdates();

  const filtered = line
    ? alerts.filter((a) => a.routes.includes(line.toUpperCase()))
    : alerts;

  const delayCount = alerts.filter((a) => a.type === "delay").length;
  const cancelCount = alerts.filter((a) => a.type === "cancellation").length;

  return (
    <div className="min-h-screen bg-white">
      <MarketingHeader />

      <main className="mx-auto max-w-3xl px-5 pb-24 pt-14 lg:px-8">
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

          {/* Stats row */}
          {alerts.length > 0 && (
            <div className="mt-5 flex flex-wrap gap-3">
              <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-2.5 text-center">
                <p className="text-2xl font-bold text-gray-900">{alerts.length}</p>
                <p className="text-xs text-gray-500">Active alert{alerts.length !== 1 ? "s" : ""}</p>
              </div>
              {delayCount > 0 && (
                <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-2.5 text-center">
                  <p className="text-2xl font-bold text-red-600">{delayCount}</p>
                  <p className="text-xs text-red-500">Delay{delayCount !== 1 ? "s" : ""}</p>
                </div>
              )}
              {cancelCount > 0 && (
                <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-2.5 text-center">
                  <p className="text-2xl font-bold text-red-700">{cancelCount}</p>
                  <p className="text-xs text-red-600">Cancellation{cancelCount !== 1 ? "s" : ""}</p>
                </div>
              )}
            </div>
          )}

          {/* Last refreshed */}
          <div className="mt-4 inline-flex items-center gap-1.5 text-xs text-gray-400">
            <RefreshCw className="h-3 w-3" />
            <span>Updated at {formatFetchTime(fetchedAt)} · refreshes every 5 min</span>
          </div>
        </div>

        {/* Line filter */}
        <LineFilterBar activeLine={line} />

        {/* Alert list */}
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-4 py-20 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#007A33]/10">
              <CheckCircle className="h-8 w-8 text-[#007A33]" />
            </div>
            <div>
              <p className="text-base font-semibold text-gray-900">
                {alerts.length === 0
                  ? "No active service alerts"
                  : `No alerts for ${line?.toUpperCase()} right now`}
              </p>
              <p className="mt-1 text-sm text-gray-500">
                {alerts.length === 0
                  ? "All GO Transit lines are operating normally."
                  : "This line appears to be running on schedule."}
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {filtered.map((alert) => (
              <AlertCard key={alert.id} alert={alert} />
            ))}
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
