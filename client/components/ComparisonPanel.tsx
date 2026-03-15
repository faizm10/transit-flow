"use client";

import { useEffect, useMemo, useState } from "react";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { LoaderCircle, X } from "lucide-react";
import type { CustomRoute, Schedule } from "@/hooks/useRouteBuilder";

type GoRouteEntry = {
  route_id: string;
  route_short_name: string;
  route_long_name: string;
  route_type: number | string;
};

type FrequencyData = {
  variant_id: string;
  route_short_name: string;
  route_variant: string;
  direction_id: number;
  startStopName: string;
  endStopName: string;
  totalTrips: number;
  totalTripsWeekday: number;
  averageHeadway: number;
  peakFrequencyWeekday: number;
  peakHourWeekday: number;
};

type CompareOption = {
  value: string;
  label: string;
  kind: "custom" | "go";
  customRoute?: CustomRoute;
  goRoute?: GoRouteEntry;
};

type ComparisonPanelProps = {
  customRoutes: CustomRoute[];
  goRoutes: GoRouteEntry[];
  onClose: () => void;
};

type RouteMetrics = {
  title: string;
  subtitle: string;
  sourceLabel: string;
  stops: string;
  duration: string;
  headway: string;
  dailyTrips: string;
  peakTripsPerHour: string;
  chartStops?: number;
  chartDailyTrips?: number;
  chartHeadway?: number;
  chartPeakTripsPerHour?: number;
};

function getIntervalMinutes(schedule?: Schedule): number | null {
  if (!schedule || schedule.type !== "frequency") return null;
  const configs = Object.values(schedule.dayConfigs ?? {}).filter((config) => config?.enabled);
  if (configs.length === 0) return null;
  return configs[0]?.intervalMinutes ?? null;
}

function getDailyTripsFromSchedule(schedule?: Schedule): number {
  if (!schedule) return 0;
  if (schedule.type === "fixed") return schedule.departures.length;
  const configs = Object.values(schedule.dayConfigs ?? {}).filter((config) => config?.enabled);
  if (configs.length === 0) return 0;
  const config = configs[0]!;
  const hoursOfService =
    (parseInt(config.endTime.split(":")[0], 10) - parseInt(config.startTime.split(":")[0], 10)) * 60 +
    (parseInt(config.endTime.split(":")[1], 10) - parseInt(config.startTime.split(":")[1], 10));
  return Math.floor(hoursOfService / config.intervalMinutes);
}

function buildCustomMetrics(route: CustomRoute): RouteMetrics {
  const headway = getIntervalMinutes(route.schedule);
  const dailyTrips = getDailyTripsFromSchedule(route.schedule);
  const durationMinutes = route.durationSeconds ? Math.round(route.durationSeconds / 60) : null;

  return {
    title: route.name || "Untitled Route",
    subtitle:
      route.stops.length > 1
        ? `${route.stops[0]?.name ?? "Start"} → ${route.stops[route.stops.length - 1]?.name ?? "End"}`
        : "Custom route",
    sourceLabel: "Custom route",
    stops: String(route.stops.length),
    duration: durationMinutes != null ? `${durationMinutes} min` : "—",
    headway: headway != null ? `${headway} min` : "—",
    dailyTrips: dailyTrips > 0 ? String(dailyTrips) : "—",
    peakTripsPerHour: headway ? String(Math.floor(60 / headway)) : "—",
    chartStops: route.stops.length,
    chartDailyTrips: dailyTrips || 0,
    chartHeadway: headway ?? undefined,
    chartPeakTripsPerHour: headway ? Math.floor(60 / headway) : undefined,
  };
}

function buildGoMetrics(route: GoRouteEntry, frequencyData: FrequencyData): RouteMetrics {
  return {
    title: route.route_short_name || route.route_long_name || "GO Transit",
    subtitle: `${frequencyData.startStopName} → ${frequencyData.endStopName}`,
    sourceLabel: "GO Transit",
    stops: "—",
    duration: "—",
    headway: `${Math.round(frequencyData.averageHeadway)} min`,
    dailyTrips: String(frequencyData.totalTripsWeekday),
    peakTripsPerHour: String(frequencyData.peakFrequencyWeekday),
    chartDailyTrips: frequencyData.totalTripsWeekday,
    chartHeadway: Math.round(frequencyData.averageHeadway),
    chartPeakTripsPerHour: frequencyData.peakFrequencyWeekday,
  };
}

export function ComparisonPanel({ customRoutes, goRoutes, onClose }: ComparisonPanelProps) {
  const compareOptions = useMemo<CompareOption[]>(() => {
    const customOptions = customRoutes
      .filter((route) => route.stops.length >= 2)
      .map((route) => ({
        value: `custom:${route.id}`,
        label: route.name || "Untitled Route",
        kind: "custom" as const,
        customRoute: route,
      }));

    const goMap = new Map<string, GoRouteEntry>();
    goRoutes.forEach((route) => {
      if (!goMap.has(route.route_short_name)) {
        goMap.set(route.route_short_name, route);
      }
    });

    const goOptions = Array.from(goMap.values())
      .sort((a, b) =>
        a.route_short_name.localeCompare(b.route_short_name, undefined, { numeric: true }),
      )
      .map((route) => ({
        value: `go:${route.route_short_name}`,
        label: route.route_long_name
          ? `${route.route_short_name} — ${route.route_long_name}`
          : route.route_short_name,
        kind: "go" as const,
        goRoute: route,
      }));

    return [...customOptions, ...goOptions];
  }, [customRoutes, goRoutes]);

  const defaultLeft = compareOptions[0]?.value ?? "";
  const defaultRight =
    compareOptions.find((option) => option.value !== defaultLeft)?.value ??
    compareOptions[0]?.value ??
    "";

  const [selectedLeft, setSelectedLeft] = useState(defaultLeft);
  const [selectedRight, setSelectedRight] = useState(defaultRight);
  const [frequencyCache, setFrequencyCache] = useState<Record<string, FrequencyData>>({});
  const [loadingRoutes, setLoadingRoutes] = useState<Record<string, boolean>>({});
  const [routeErrors, setRouteErrors] = useState<Record<string, string>>({});
  const effectiveSelectedLeft = compareOptions.some((option) => option.value === selectedLeft)
    ? selectedLeft
    : defaultLeft;
  const effectiveSelectedRight = compareOptions.some((option) => option.value === selectedRight)
    ? selectedRight
    : defaultRight;

  const leftOption = compareOptions.find((option) => option.value === effectiveSelectedLeft) ?? null;
  const rightOption = compareOptions.find((option) => option.value === effectiveSelectedRight) ?? null;

  const requiredGoRoutes = useMemo(() => {
    const routeNames = new Set<string>();
    [leftOption, rightOption].forEach((option) => {
      if (option?.kind === "go" && option.goRoute?.route_short_name) {
        routeNames.add(option.goRoute.route_short_name);
      }
    });
    return Array.from(routeNames);
  }, [leftOption, rightOption]);

  useEffect(() => {
    const missingRoutes = requiredGoRoutes.filter(
      (routeShortName) => !frequencyCache[routeShortName] && !loadingRoutes[routeShortName],
    );
    if (missingRoutes.length === 0) return;

    const controllers = missingRoutes.map(() => new AbortController());

    missingRoutes.forEach((routeShortName, index) => {
      const controller = controllers[index];
      setLoadingRoutes((current) => ({ ...current, [routeShortName]: true }));
      setRouteErrors((current) => {
        const next = { ...current };
        delete next[routeShortName];
        return next;
      });

      fetch(`/api/gotransit/frequency?route_short_name=${encodeURIComponent(routeShortName)}`, {
        signal: controller.signal,
      })
        .then(async (response) => {
          if (!response.ok) {
            throw new Error("Failed to fetch route frequency");
          }
          const data = (await response.json()) as { results: FrequencyData[] };
          const match =
            data.results.find((item) => item.direction_id === 0) ??
            data.results[0];

          if (!match) {
            throw new Error(`No frequency data found for route ${routeShortName}`);
          }

          setFrequencyCache((current) => ({ ...current, [routeShortName]: match }));
        })
        .catch((error: unknown) => {
          if (controller.signal.aborted) return;
          const message = error instanceof Error ? error.message : "Unknown error";
          setRouteErrors((current) => ({ ...current, [routeShortName]: message }));
        })
        .finally(() => {
          if (controller.signal.aborted) return;
          setLoadingRoutes((current) => {
            const next = { ...current };
            delete next[routeShortName];
            return next;
          });
        });
    });

    return () => {
      controllers.forEach((controller) => controller.abort());
    };
  }, [frequencyCache, loadingRoutes, requiredGoRoutes]);

  const leftMetrics = buildMetrics(leftOption, frequencyCache);
  const rightMetrics = buildMetrics(rightOption, frequencyCache);

  const chartData =
    leftMetrics && rightMetrics
      ? [
          { metric: "Stops", route1: leftMetrics.chartStops, route2: rightMetrics.chartStops },
          { metric: "Daily Trips", route1: leftMetrics.chartDailyTrips, route2: rightMetrics.chartDailyTrips },
          { metric: "Headway", route1: leftMetrics.chartHeadway, route2: rightMetrics.chartHeadway },
          {
            metric: "Peak /hr",
            route1: leftMetrics.chartPeakTripsPerHour,
            route2: rightMetrics.chartPeakTripsPerHour,
          },
        ]
      : [];

  return (
    <div className="fixed bottom-24 right-4 z-50 w-[min(720px,calc(100vw-1rem))] max-w-[calc(100vw-1rem)]">
      <div className="overflow-hidden rounded-[28px] border border-white/55 bg-[var(--glass-surface-strong)] text-sm text-slate-900 shadow-[var(--glass-shadow)] backdrop-blur-2xl">
        <div className="flex items-start justify-between border-b border-white/35 px-5 py-4">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.24em] text-slate-500">
              Benchmark
            </div>
            <div className="mt-1 text-[1.65rem] font-semibold tracking-tight text-slate-950">
              Compare Routes
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-2 text-slate-400 transition-colors hover:bg-white/45 hover:text-slate-950"
            aria-label="Close comparison"
          >
            <X size={18} />
          </button>
        </div>

        <div className="max-h-[min(72vh,680px)] overflow-y-auto">
          <div className="border-b border-white/30 px-5 py-4">
            <div className="grid gap-3 md:grid-cols-2">
              <RouteSelect
                label="Route 1"
                value={effectiveSelectedLeft}
                onChange={setSelectedLeft}
                options={compareOptions}
              />
              <RouteSelect
                label="Route 2"
                value={effectiveSelectedRight}
                onChange={setSelectedRight}
                options={compareOptions}
              />
            </div>
          </div>

          <div className="px-5 py-4">
            <div className="grid gap-3 md:grid-cols-2">
              <ComparisonColumn
                heading="Route 1"
                metrics={leftMetrics}
                loading={isOptionLoading(leftOption, loadingRoutes)}
                error={getOptionError(leftOption, routeErrors)}
              />
              <ComparisonColumn
                heading="Route 2"
                metrics={rightMetrics}
                loading={isOptionLoading(rightOption, loadingRoutes)}
                error={getOptionError(rightOption, routeErrors)}
              />
            </div>
          </div>

          {chartData.length > 0 && (
            <div className="border-t border-white/30 px-5 pb-5 pt-4">
              <div className="mb-3 text-[10px] uppercase tracking-widest text-slate-500">
                Key Metrics
              </div>
              <ResponsiveContainer width="100%" height={168}>
                <BarChart data={chartData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }} barGap={8}>
                  <XAxis
                    dataKey="metric"
                    tick={{ fill: "rgba(71,85,105,0.82)", fontSize: 10 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fill: "rgba(100,116,139,0.8)", fontSize: 10 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "rgba(255,255,255,0.92)",
                      border: "1px solid rgba(255,255,255,0.7)",
                      borderRadius: 16,
                      fontSize: 11,
                    }}
                    labelStyle={{ color: "rgb(71,85,105)" }}
                    itemStyle={{ color: "rgb(15,23,42)" }}
                  />
                  <Bar dataKey="route1" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="route2" fill="#22c55e" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
              <div className="mt-2 flex justify-center gap-4">
                <LegendDot color="bg-blue-500" label="Route 1" />
                <LegendDot color="bg-green-500" label="Route 2" />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function buildMetrics(
  option: CompareOption | null,
  frequencyCache: Record<string, FrequencyData>,
): RouteMetrics | null {
  if (!option) return null;
  if (option.kind === "custom" && option.customRoute) {
    return buildCustomMetrics(option.customRoute);
  }
  if (option.kind === "go" && option.goRoute) {
    const frequencyData = frequencyCache[option.goRoute.route_short_name];
    if (!frequencyData) return null;
    return buildGoMetrics(option.goRoute, frequencyData);
  }
  return null;
}

function isOptionLoading(
  option: CompareOption | null,
  loadingRoutes: Record<string, boolean>,
) {
  if (option?.kind !== "go" || !option.goRoute) return false;
  return Boolean(loadingRoutes[option.goRoute.route_short_name]);
}

function getOptionError(
  option: CompareOption | null,
  routeErrors: Record<string, string>,
) {
  if (option?.kind !== "go" || !option.goRoute) return null;
  return routeErrors[option.goRoute.route_short_name] ?? null;
}

function RouteSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: CompareOption[];
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[11px] uppercase tracking-[0.18em] text-slate-500">
        {label}
      </span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full cursor-pointer appearance-none rounded-2xl border border-white/50 bg-white/72 px-3 py-2.5 text-sm text-slate-900 focus:border-sky-300 focus:outline-none focus:ring-4 focus:ring-sky-100/60"
      >
        {options.length === 0 ? <option value="">No routes available</option> : null}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.kind === "custom" ? "Custom" : "GO"} · {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function ComparisonColumn({
  heading,
  metrics,
  loading,
  error,
}: {
  heading: string;
  metrics: RouteMetrics | null;
  loading: boolean;
  error: string | null;
}) {
  return (
    <div className="rounded-[22px] border border-white/45 bg-white/42 p-4">
      <div className="mb-3 text-[10px] uppercase tracking-widest text-slate-500">{heading}</div>
      {loading && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-[11px] font-medium text-slate-600">
            <LoaderCircle className="h-4 w-4 animate-spin text-sky-600" />
            Loading route data
          </div>
          <InlineSkeleton />
          <InlineSkeleton />
          <InlineSkeleton />
        </div>
      )}
      {!loading && error && (
        <div className="rounded-2xl border border-red-200 bg-red-50/70 px-3 py-3 text-[11px] text-red-600">
          {error}
        </div>
      )}
      {!loading && !error && !metrics && (
        <div className="rounded-2xl border border-white/40 bg-white/50 px-3 py-3 text-[11px] text-slate-500">
          Select a route
        </div>
      )}
      {!loading && !error && metrics && (
        <div className="space-y-2.5">
          <div>
            <div className="text-base font-semibold leading-6 text-slate-950">{metrics.title}</div>
            <div className="mt-1 text-[10px] uppercase tracking-[0.18em] text-slate-500">
              {metrics.sourceLabel}
            </div>
            <div className="mt-2 text-[12px] leading-5 text-slate-600">{metrics.subtitle}</div>
          </div>
          <MetricRow label="Stops" value={metrics.stops} />
          <MetricRow label="Duration" value={metrics.duration} />
          <MetricRow label="Headway" value={metrics.headway} />
          <MetricRow label="Daily trips" value={metrics.dailyTrips} />
          <MetricRow label="Trips/hr peak" value={metrics.peakTripsPerHour} />
        </div>
      )}
    </div>
  );
}

function MetricRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-white/40 bg-white/58 px-3 py-2.5">
      <span className="text-[11px] text-slate-500">{label}</span>
      <span className="text-[11px] font-semibold text-slate-900">{value}</span>
    </div>
  );
}

function InlineSkeleton() {
  return (
    <div className="rounded-xl border border-white/40 bg-white/55 px-3 py-3">
      <div className="h-3 w-24 animate-pulse rounded bg-slate-200" />
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-1 text-[9px] text-slate-500">
      <span className={`inline-block h-2 w-2 rounded-sm ${color}`} />
      {label}
    </div>
  );
}
