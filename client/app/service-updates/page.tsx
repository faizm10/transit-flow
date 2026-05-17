import type { Metadata } from "next";
import { CheckCircle, RefreshCw } from "lucide-react";
import MarketingHeader from "@/components/marketing/MarketingHeader";
import { AlertCard } from "@/components/service-updates/AlertCard";
import { LineFilterBar } from "@/components/service-updates/LineFilterBar";
import { fetchServiceUpdates } from "@/lib/serviceUpdates";

export const metadata: Metadata = {
  title: "Service Updates — TransitFlow",
  description:
    "Live GO Transit service alerts — delays, cancellations, and service notices for all GO lines.",
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

  return (
    <div className="min-h-screen bg-[#0a1628]">
      <MarketingHeader />

      <main className="mx-auto max-w-3xl px-5 pb-24 pt-14 lg:px-8">
        {/* Page header */}
        <div className="mb-10">
          <h1 className="text-3xl font-bold tracking-tight text-white">
            Service Updates
          </h1>
          <p className="mt-2 text-sm text-slate-400">
            Live GO Transit alerts — delays, cancellations, and service notices.
          </p>

          {/* Last refreshed */}
          <div className="mt-3 inline-flex items-center gap-1.5 text-xs text-slate-500">
            <RefreshCw className="h-3 w-3" />
            <span>
              Updated at {formatFetchTime(fetchedAt)}
              {source === "error" && (
                <span className="ml-2 text-red-400">
                  (could not reach gotransit.com)
                </span>
              )}
            </span>
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
              <p className="text-base font-semibold text-white">
                {alerts.length === 0
                  ? "No active service alerts"
                  : `No alerts for ${line?.toUpperCase()} right now`}
              </p>
              <p className="mt-1 text-sm text-slate-400">
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
        <p className="mt-12 text-center text-xs text-slate-600">
          Data sourced from{" "}
          <a
            href="https://www.gotransit.com/en/service-updates"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-slate-400 transition-colors"
          >
            gotransit.com
          </a>
          . Refreshes every 5 minutes.
        </p>
      </main>
    </div>
  );
}
