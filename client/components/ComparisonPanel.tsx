"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { X } from "lucide-react";
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
  const configs = Object.values(schedule.dayConfigs ?? {}).filter((c) => c?.enabled);
  if (configs.length === 0) return null;
  return configs[0]?.intervalMinutes ?? null;
}

function getDailyTripsFromSchedule(schedule?: Schedule): number {
  if (!schedule) return 0;
  if (schedule.type === "fixed") return schedule.departures.length;
  const configs = Object.values(schedule.dayConfigs ?? {}).filter((c) => c?.enabled);
  if (configs.length === 0) return 0;
  const config = configs[0]!;
  const hoursOfService =
    (parseInt(config.endTime.split(":")[0]) - parseInt(config.startTime.split(":")[0])) * 60 +
    (parseInt(config.endTime.split(":")[1]) - parseInt(config.startTime.split(":")[1]));
  return Math.floor(hoursOfService / config.intervalMinutes);
}

function buildCustomMetrics(route: CustomRoute): RouteMetrics {
  const headway = getIntervalMinutes(route.schedule);
  const dailyTrips = getDailyTripsFromSchedule(route.schedule);
  const durationMinutes = route.durationSeconds ? Math.round(route.durationSeconds / 60) : null;

  return {
    title: route.name || "Untitled Route",
    subtitle: route.stops.length > 1 ? `${route.stops[0]?.name ?? "Start"} → ${route.stops[route.stops.length - 1]?.name ?? "End"}` : "Custom route",
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
    compareOptions.find((option) => option.value !== defaultLeft)?.value ?? compareOptions[0]?.value ?? "";

  const [selectedLeft, setSelectedLeft] = useState(defaultLeft);
  const [selectedRight, setSelectedRight] = useState(defaultRight);
  const [frequencyCache, setFrequencyCache] = useState<Record<string, FrequencyData>>({});
  const [loadingKeys, setLoadingKeys] = useState<string[]>([]);
  const [errorByKey, setErrorByKey] = useState<Record<string, string | null>>({});

  useEffect(() => {
    setSelectedLeft(defaultLeft);
    setSelectedRight(defaultRight);
  }, [defaultLeft, defaultRight]);

  const fetchFrequency = useCallback(async (shortName: string) => {
    if (!shortName || frequencyCache[shortName]) return;

    setLoadingKeys((prev) => (prev.includes(shortName) ? prev : [...prev, shortName]));
    setErrorByKey((prev) => ({ ...prev, [shortName]: null }));

    try {
      const res = await fetch("/api/gotransit/frequency");
      if (!res.ok) throw new Error("Failed to fetch frequency data");
      const data = (await res.json()) as { results: FrequencyData[] };
      const match =
        data.results.find((item) => item.route_short_name === shortName && item.direction_id === 0) ??
        data.results.find((item) => item.route_short_name === shortName);

      if (!match) {
        setErrorByKey((prev) => ({ ...prev, [shortName]: `No frequency data found for route ${shortName}` }));
      } else {
        setFrequencyCache((prev) => ({ ...prev, [shortName]: match }));
      }
    } catch (error) {
      setErrorByKey((prev) => ({
        ...prev,
        [shortName]: error instanceof Error ? error.message : "Unknown error",
      }));
    } finally {
      setLoadingKeys((prev) => prev.filter((key) => key !== shortName));
    }
  }, [frequencyCache]);

  const leftOption = compareOptions.find((option) => option.value === selectedLeft) ?? null;
  const rightOption = compareOptions.find((option) => option.value === selectedRight) ?? null;

  useEffect(() => {
    if (leftOption?.kind === "go" && leftOption.goRoute?.route_short_name) {
      fetchFrequency(leftOption.goRoute.route_short_name);
    }
    if (rightOption?.kind === "go" && rightOption.goRoute?.route_short_name) {
      fetchFrequency(rightOption.goRoute.route_short_name);
    }
  }, [fetchFrequency, leftOption, rightOption]);

  const leftMetrics = buildMetrics(leftOption, frequencyCache);
  const rightMetrics = buildMetrics(rightOption, frequencyCache);

  const chartData =
    leftMetrics && rightMetrics
      ? [
          {
            metric: "Stops",
            route1: leftMetrics.chartStops,
            route2: rightMetrics.chartStops,
          },
          {
            metric: "Daily Trips",
            route1: leftMetrics.chartDailyTrips,
            route2: rightMetrics.chartDailyTrips,
          },
          {
            metric: "Headway (min)",
            route1: leftMetrics.chartHeadway,
            route2: rightMetrics.chartHeadway,
          },
          {
            metric: "Peak /hr",
            route1: leftMetrics.chartPeakTripsPerHour,
            route2: rightMetrics.chartPeakTripsPerHour,
          },
        ]
      : [];

  return (
    <div className="fixed bottom-24 right-4 z-50 w-[520px] max-w-[95vw] overflow-hidden rounded-[28px] border border-white/50 bg-[var(--glass-surface-strong)] text-sm text-slate-900 shadow-[var(--glass-shadow)] backdrop-blur-2xl">
      <div className="flex items-center justify-between border-b border-white/40 px-5 py-4">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.24em] text-slate-500">
            Benchmark
          </div>
          <span className="mt-1 block font-semibold text-slate-950">Route Comparison</span>
        </div>
        <button
          onClick={onClose}
          className="text-slate-400 transition-colors hover:text-slate-950"
        >
          <X size={16} />
        </button>
      </div>

      <div className="border-b border-white/35 px-5 py-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <RouteSelect
            label="Route 1"
            value={selectedLeft}
            onChange={setSelectedLeft}
            options={compareOptions}
          />
          <RouteSelect
            label="Route 2"
            value={selectedRight}
            onChange={setSelectedRight}
            options={compareOptions}
          />
        </div>
      </div>

      <div className="px-5 py-4">
        <div className="grid grid-cols-2 gap-3">
          <ComparisonColumn
            heading="Route 1"
            option={leftOption}
            metrics={leftMetrics}
            loading={isOptionLoading(leftOption, loadingKeys)}
            error={getOptionError(leftOption, errorByKey)}
          />
          <ComparisonColumn
            heading="Route 2"
            option={rightOption}
            metrics={rightMetrics}
            loading={isOptionLoading(rightOption, loadingKeys)}
            error={getOptionError(rightOption, errorByKey)}
          />
        </div>
      </div>

      {chartData.length > 0 && (
        <div className="border-t border-white/35 px-5 pb-5 pt-4">
          <div className="mb-2 text-[10px] uppercase tracking-widest text-slate-500">
            Key Metrics
          </div>
          <ResponsiveContainer width="100%" height={120}>
            <BarChart data={chartData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }} barGap={4}>
              <XAxis
                dataKey="metric"
                tick={{ fill: "rgba(71,85,105,0.8)", fontSize: 9 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: "rgba(100,116,139,0.8)", fontSize: 9 }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                contentStyle={{
                  background: "rgba(255,255,255,0.88)",
                  border: "1px solid rgba(255,255,255,0.65)",
                  borderRadius: 16,
                  fontSize: 11,
                }}
                labelStyle={{ color: "rgb(71,85,105)" }}
                itemStyle={{ color: "rgb(15,23,42)" }}
              />
              <Bar dataKey="route1" fill="#3b82f6" radius={[2, 2, 0, 0]} />
              <Bar dataKey="route2" fill="#22c55e" radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
          <div className="mt-1 flex justify-center gap-4">
            <LegendDot color="bg-blue-500" label="Route 1" />
            <LegendDot color="bg-green-500" label="Route 2" />
          </div>
        </div>
      )}
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

function isOptionLoading(option: CompareOption | null, loadingKeys: string[]) {
  return Boolean(option?.kind === "go" && option.goRoute && loadingKeys.includes(option.goRoute.route_short_name));
}

function getOptionError(option: CompareOption | null, errorByKey: Record<string, string | null>) {
  if (option?.kind !== "go" || !option.goRoute) return null;
  return errorByKey[option.goRoute.route_short_name] ?? null;
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
      <span className="mb-2 block text-[11px] uppercase tracking-wide text-slate-500">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full cursor-pointer appearance-none rounded-2xl border border-white/45 bg-white/70 px-3 py-2.5 text-sm text-slate-900 focus:border-sky-300 focus:outline-none focus:ring-4 focus:ring-sky-100/60"
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
  option,
  metrics,
  loading,
  error,
}: {
  heading: string;
  option: CompareOption | null;
  metrics: RouteMetrics | null;
  loading: boolean;
  error: string | null;
}) {
  return (
    <div className="space-y-2 rounded-[22px] border border-white/45 bg-white/45 p-4">
      <div className="mb-1 text-[10px] uppercase tracking-widest text-slate-500">{heading}</div>
      {!option && <div className="pt-4 text-[11px] text-slate-500">Select a route</div>}
      {loading && (
        <div className="space-y-2 pt-2">
          <div className="h-4 w-4/5 animate-pulse rounded bg-slate-200" />
          <SkeletonMetricRow />
          <SkeletonMetricRow />
          <SkeletonMetricRow />
          <SkeletonMetricRow />
          <SkeletonMetricRow />
        </div>
      )}
      {error && <div className="text-[11px] text-red-600">{error}</div>}
      {!loading && !error && metrics && (
        <>
          <div className="truncate text-[11px] font-semibold text-slate-800">{metrics.title}</div>
          <div className="text-[10px] uppercase tracking-wide text-slate-500">{metrics.sourceLabel}</div>
          <div className="text-[11px] text-slate-600">{metrics.subtitle}</div>
          <MetricRow label="Stops" value={metrics.stops} />
          <MetricRow label="Duration" value={metrics.duration} />
          <MetricRow label="Headway" value={metrics.headway} />
          <MetricRow label="Daily Trips" value={metrics.dailyTrips} />
          <MetricRow label="Trips/hr (peak)" value={metrics.peakTripsPerHour} />
        </>
      )}
    </div>
  );
}

function MetricRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-white/40 bg-white/55 px-2.5 py-2">
      <span className="text-[10px] text-slate-500">{label}</span>
      <span className="text-[11px] font-medium text-slate-900">{value}</span>
    </div>
  );
}

function SkeletonMetricRow() {
  return (
    <div className="flex items-center justify-between rounded-xl border border-white/40 bg-white/55 px-2.5 py-2">
      <div className="h-3 w-16 animate-pulse rounded bg-slate-200" />
      <div className="h-3 w-10 animate-pulse rounded bg-slate-200" />
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
