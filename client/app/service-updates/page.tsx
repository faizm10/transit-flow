import type { Metadata } from "next";
import MarketingShell from "@/components/marketing/MarketingShell";
import MarketingHeader from "@/components/marketing/MarketingHeader";
import MarketingFooter from "@/components/marketing/MarketingFooter";
import { Eyebrow } from "@/components/marketing/spec";
import { AlertCard } from "@/components/service-updates/AlertCard";
import { LineFilterBar } from "@/components/service-updates/LineFilterBar";
import { fetchServiceUpdates } from "@/lib/serviceUpdates";
import type { ServiceAlert, ServiceUpdatesResult } from "@/lib/serviceUpdates";

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://transit-flow-two.vercel.app";

export const metadata: Metadata = {
  title: "Service Updates — TransitFlow",
  description:
    "Live GO Transit service alerts: delays, cancellations, and service notices for Lakeshore West, Barrie, Kitchener, Stouffville, Richmond Hill, Milton, and UP Express lines.",
  alternates: { canonical: `${SITE_URL}/service-updates` },
  openGraph: {
    title: "GO Transit Service Updates — TransitFlow",
    description:
      "Live GO Transit service alerts: delays, cancellations, and service notices for all GO lines.",
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

function sourceLabel(source: ServiceUpdatesResult["source"]): string {
  switch (source) {
    case "metrolinx-api":
      return "Live · Metrolinx API";
    case "html-fallback":
    case "nextdata":
      return "Scraped · gotransit.com";
    case "error":
      return "Source unavailable";
    default:
      return "";
  }
}

const colLabel =
  "mb-4 flex items-baseline gap-2 font-[family-name:var(--landing-mono)] text-[0.6875rem] uppercase tracking-[0.1em] text-[var(--landing-faint)]";

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
      <h2 className={colLabel}>
        <span className="text-[var(--landing-accent)]">/</span> {title}
        <span className="tabular-nums">{alerts.length}</span>
      </h2>
      {alerts.length === 0 ? (
        <p className="border border-dashed border-[var(--landing-border)] px-4 py-10 text-center text-sm text-[var(--landing-faint)]">
          {emptyLabel}
        </p>
      ) : (
        <div className="flex flex-col gap-3">
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
      (a, b) => new Date(b.postedAt).getTime() - new Date(a.postedAt).getTime(),
    );

  // Two lanes: things that affect a trip in progress vs. standing notices
  // (elevator outages, stop relocations, general advisories).
  const serviceUpdates = filtered.filter(
    (a) => a.type === "delay" || a.type === "cancellation",
  );
  const notices = filtered.filter(
    (a) => a.type === "information" || a.type === "other",
  );

  const delayCount = alerts.filter((a) => a.type === "delay").length;
  const cancelCount = alerts.filter((a) => a.type === "cancellation").length;

  return (
    <MarketingShell>
      <MarketingHeader />

      <main className="mx-auto w-full max-w-5xl flex-1 px-5 pb-28 pt-14 lg:px-8">
        {/* Page header */}
        <div className="mb-10 flex flex-col gap-4">
          <Eyebrow>Service updates</Eyebrow>
          <h1 className="font-[family-name:var(--font-hanken)] text-[2.5rem] font-normal leading-[1.05] tracking-[-0.025em] text-[var(--landing-ink)]">
            What&apos;s running, what isn&apos;t
          </h1>
          <p className="max-w-xl text-[var(--landing-muted)]">
            Real-time GO Transit alerts: delays, cancellations, and service
            notices, newest first.
          </p>

          {/* Mono status line: source · counts · freshness */}
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-[var(--landing-border)] pt-3 font-[family-name:var(--landing-mono)] text-[0.6875rem] uppercase tracking-[0.06em] text-[var(--landing-faint)]">
            <span className="text-[var(--landing-muted)]">
              <span className="text-[var(--landing-accent)]">/</span>{" "}
              {sourceLabel(source)}
            </span>
            <span aria-hidden>·</span>
            <span>
              {alerts.length > 0
                ? `${alerts.length} active${
                    delayCount > 0 ? ` · ${delayCount} delay${delayCount !== 1 ? "s" : ""}` : ""
                  }${
                    cancelCount > 0
                      ? ` · ${cancelCount} cancellation${cancelCount !== 1 ? "s" : ""}`
                      : ""
                  }`
                : "no active alerts"}
            </span>
            <span aria-hidden>·</span>
            <span>updated {formatFetchTime(fetchedAt)}</span>
          </div>
        </div>

        {/* Line filter */}
        <LineFilterBar activeLine={line} />

        {/* Alert list */}
        {filtered.length === 0 ? (
          <div className="border border-dashed border-[var(--landing-border)] px-6 py-20 text-center">
            <p className="font-[family-name:var(--font-hanken)] text-lg font-medium text-[var(--landing-ink)]">
              {source !== "metrolinx-api"
                ? "No alerts available"
                : alerts.length === 0
                  ? "No active service alerts"
                  : `No alerts for ${line?.toUpperCase()} right now`}
            </p>
            <p className="mx-auto mt-1.5 max-w-md text-sm text-[var(--landing-muted)]">
              {/* Only the Metrolinx API is authoritative enough to say
                  "operating normally". The scrape is best-effort and its
                  selectors drift with gotransit.com, so an empty result there
                  means the scrape found nothing — not that nothing is wrong. */}
              {source === "metrolinx-api"
                ? alerts.length === 0
                  ? "All GO Transit lines are operating normally."
                  : "This line appears to be running on schedule."
                : "No alerts could be read from gotransit.com. Check GO's own site before travelling."}
            </p>
          </div>
        ) : (
          <div className="grid gap-x-6 gap-y-12 md:grid-cols-2">
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
        <p className="mt-14 text-center font-[family-name:var(--landing-mono)] text-[0.6875rem] uppercase tracking-[0.05em] text-[var(--landing-faint)]">
          {source === "metrolinx-api" ? (
            <>
              Powered by the{" "}
              <a
                href="https://api.openmetrolinx.com/OpenDataAPI/Help/Index/en"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[var(--landing-accent)] transition-opacity hover:opacity-70"
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
                className="text-[var(--landing-accent)] transition-opacity hover:opacity-70"
              >
                gotransit.com
              </a>
              . Refreshes every 5 minutes.
            </>
          )}
        </p>
      </main>

      <MarketingFooter />
    </MarketingShell>
  );
}
