"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

type VariantTime = {
  variant_id: string;
  route_short_name: string;
  route_variant: string;
  direction_id: number;
  route_id: string;
  route_long_name: string;
  route_type: number | string;
  start_stop_name: string;
  end_stop_name: string;
  duration_seconds: number | null;
  duration_label: string;
};

type VariantResponse = {
  results: VariantTime[];
};

type GroupedVariant = {
  route_variant: string;
  route_short_name: string;
  route_long_name: string;
  route_type: number | string;
  directions: Record<
    number,
    {
      variant_id: string;
      duration_label: string;
      start_stop_name: string;
      end_stop_name: string;
    }
  >;
};

function formatRouteType(value: number | string) {
  return String(value) === "2" ? "Train" : "Bus";
}

export default function InfoPage() {
  const [data, setData] = useState<VariantTime[]>([]);
  const [variantStops, setVariantStops] = useState<
    Record<
      string,
      Array<{
        stop_id: string;
        stop_name: string;
        stop_lat: number | null;
        stop_lon: number | null;
        stop_sequence: number;
      }>
    >
  >({});
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [variantTimesResponse, variantStopsResponse] = await Promise.all([
          fetch("/api/gotransit/variant-times"),
          fetch("/gotransit/derived/variant_stops.json"),
        ]);

        if (!variantTimesResponse.ok) {
          throw new Error(`HTTP error! status: ${variantTimesResponse.status}`);
        }
        if (!variantStopsResponse.ok) {
          throw new Error(`HTTP error! status: ${variantStopsResponse.status}`);
        }

        const payload = (await variantTimesResponse.json()) as VariantResponse;
        const stopsPayload = (await variantStopsResponse.json()) as Record<
          string,
          Array<{
            stop_id: string;
            stop_name: string;
            stop_lat: number | null;
            stop_lon: number | null;
            stop_sequence: number;
          }>
        >;

        setData(payload.results || []);
        setVariantStops(stopsPayload || {});
      } catch (error) {
        console.error("Failed to load variant times:", error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, []);

  const grouped = useMemo(() => {
    const groups = new Map<string, GroupedVariant>();
    data.forEach((item) => {
      const key = `${item.route_short_name}-${item.route_variant}`;
      if (!groups.has(key)) {
        groups.set(key, {
          route_variant: item.route_variant,
          route_short_name: item.route_short_name,
          route_long_name: item.route_long_name,
          route_type: item.route_type,
          directions: {},
        });
      }

      const group = groups.get(key)!;
      group.directions[item.direction_id] = {
        variant_id: item.variant_id,
        duration_label: item.duration_label,
        start_stop_name: item.start_stop_name,
        end_stop_name: item.end_stop_name,
      };
    });

    return Array.from(groups.values()).sort((a, b) => {
      const typeA = String(a.route_type);
      const typeB = String(b.route_type);
      if (typeA !== typeB) return typeA.localeCompare(typeB);
      if (a.route_short_name !== b.route_short_name) {
        return a.route_short_name.localeCompare(b.route_short_name);
      }
      return a.route_variant.localeCompare(b.route_variant);
    });
  }, [data]);

  return (
    <div className="bg-background w-full min-h-screen">
      <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 lg:px-10">
        <Section className="mb-6">
          <div className="space-y-3">
            <p className="text-xs uppercase tracking-widest text-muted-foreground">
              TransitFlow Info
            </p>
            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
              GO Transit trip durations
            </h1>
            <p className="text-muted-foreground text-sm leading-6">
              Duration is based on representative trips for each route variant.
              Start-to-end and end-to-start directions are shown where available.
            </p>
            <div className="pt-2">
              <Link
                href="/frequency"
                className="text-sm text-muted-foreground hover:text-foreground underline"
              >
                View frequency analysis →
              </Link>
            </div>
          </div>
        </Section>

        <Section>
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold">All routes</h2>
            <span className="text-xs text-muted-foreground">
              {isLoading ? "Loading..." : `${grouped.length} variants`}
            </span>
          </div>

          {isLoading && (
            <div className="text-sm text-muted-foreground">
              Fetching GTFS trip times...
            </div>
          )}

          {!isLoading && grouped.length === 0 && (
            <div className="text-sm text-muted-foreground">
              No variant data found.
            </div>
          )}

          {!isLoading && grouped.length > 0 && (
            <div className="mt-4 space-y-4">
              {grouped.map((item) => {
                const forward = item.directions[0];
                const reverse = item.directions[1];
                const isTrain = String(item.route_type) === "2";
                const forwardStops = forward
                  ? variantStops[forward.variant_id] || []
                  : [];
                const reverseStops = reverse
                  ? variantStops[reverse.variant_id] || []
                  : [];

                return (
                  <div
                    key={`${item.route_short_name}-${item.route_variant}`}
                    className="rounded-xl border border-dashed p-4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-xs text-muted-foreground">
                          {formatRouteType(item.route_type)}
                        </p>
                        <h3 className="text-lg font-semibold">
                          {item.route_variant}
                        </h3>
                        {item.route_long_name && (
                          <p className="text-sm text-muted-foreground">
                            {item.route_long_name}
                          </p>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Route {item.route_short_name}
                      </div>
                    </div>

                    {isTrain && (
                      <div className="mt-4 space-y-3">
                        <StopsRow
                          title="Stops: start to end"
                          stops={forwardStops}
                        />
                        <StopsRow
                          title="Stops: end to start"
                          stops={reverseStops}
                        />
                      </div>
                    )}

                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <div className="rounded-lg border border-dashed p-3">
                        <p className="text-xs uppercase text-muted-foreground">
                          Start to end
                        </p>
                        <p className="mt-2 text-sm font-medium">
                          {forward
                            ? `${forward.start_stop_name} → ${forward.end_stop_name}`
                            : "N/A"}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {forward ? forward.duration_label : "N/A"}
                        </p>
                      </div>
                      <div className="rounded-lg border border-dashed p-3">
                        <p className="text-xs uppercase text-muted-foreground">
                          End to start
                        </p>
                        <p className="mt-2 text-sm font-medium">
                          {reverse
                            ? `${reverse.start_stop_name} → ${reverse.end_stop_name}`
                            : "N/A"}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {reverse ? reverse.duration_label : "N/A"}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Section>
      </div>
    </div>
  );
}

function StopsRow({
  title,
  stops,
}: {
  title: string;
  stops: Array<{ stop_id: string; stop_name: string }>;
}) {
  if (stops.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-3">
        <p className="text-xs uppercase text-muted-foreground">{title}</p>
        <p className="mt-2 text-xs text-muted-foreground">No stops available</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-dashed p-3">
      <p className="text-xs uppercase text-muted-foreground">{title}</p>
      <div className="mt-3 overflow-x-auto">
        <div className="relative flex min-w-max items-start gap-6 px-2 py-4">
          <div className="pointer-events-none absolute left-2 right-2 top-7 h-px bg-border" />
          {stops.map((stop) => (
            <div
              key={stop.stop_id}
              className="flex w-20 flex-col items-center gap-2"
            >
              <span className="h-2.5 w-2.5 rounded-full bg-foreground" />
              <span className="origin-top-left -rotate-90 whitespace-nowrap text-[10px] text-muted-foreground">
                {stop.stop_name || stop.stop_id}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Section({
  className,
  children,
  ...props
}: React.ComponentProps<"section">) {
  return (
    <section
      className={cn(
        "bg-background text-foreground flex min-w-0 flex-col gap-6 border border-dashed p-5 sm:p-6",
        className,
      )}
      {...props}
    >
      {children}
    </section>
  );
}
