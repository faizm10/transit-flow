"use client";

import { useState, useEffect, useCallback } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
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

type ComparisonPanelProps = {
  customRoute: CustomRoute;
  goRoutes: GoRouteEntry[];
  onClose: () => void;
};

function getIntervalMinutes(schedule?: Schedule): number | null {
  if (!schedule || schedule.type !== "frequency") return null;
  const configs = Object.values(schedule.dayConfigs ?? {}).filter(
    (c) => c?.enabled
  );
  if (configs.length === 0) return null;
  return configs[0]?.intervalMinutes ?? null;
}

function getDailyTripsFromSchedule(schedule?: Schedule): number {
  if (!schedule) return 0;
  if (schedule.type === "fixed") return schedule.departures.length;
  const configs = Object.values(schedule.dayConfigs ?? {}).filter(
    (c) => c?.enabled
  );
  if (configs.length === 0) return 0;
  const c = configs[0]!;
  const hoursOfService =
    (parseInt(c.endTime.split(":")[0]) -
      parseInt(c.startTime.split(":")[0])) *
    60 +
    (parseInt(c.endTime.split(":")[1]) - parseInt(c.startTime.split(":")[1]));
  return Math.floor(hoursOfService / c.intervalMinutes);
}

export function ComparisonPanel({
  customRoute,
  goRoutes,
  onClose,
}: ComparisonPanelProps) {
  const [selectedShortName, setSelectedShortName] = useState<string>("");
  const [frequencyData, setFrequencyData] = useState<FrequencyData | null>(
    null
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchFrequency = useCallback(async (shortName: string) => {
    if (!shortName) return;
    setLoading(true);
    setError(null);
    setFrequencyData(null);
    try {
      const res = await fetch("/api/gotransit/frequency");
      if (!res.ok) throw new Error("Failed to fetch frequency data");
      const data = (await res.json()) as { results: FrequencyData[] };
      // Pick the first variant with direction_id 0 for the selected route
      const match = data.results.find(
        (r) => r.route_short_name === shortName && r.direction_id === 0
      ) ?? data.results.find((r) => r.route_short_name === shortName);
      if (!match) {
        setError(`No frequency data found for route ${shortName}`);
      } else {
        setFrequencyData(match);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedShortName) {
      fetchFrequency(selectedShortName);
    }
  }, [selectedShortName, fetchFrequency]);

  const customStops = customRoute.stops.length;
  const customDuration = customRoute.durationSeconds
    ? Math.round(customRoute.durationSeconds / 60)
    : null;
  const customHeadway = getIntervalMinutes(customRoute.schedule);
  const customDailyTrips = getDailyTripsFromSchedule(customRoute.schedule);

  // Build chart data
  const chartData = frequencyData
    ? [
        {
          metric: "Stops",
          Custom: customStops,
          GO: frequencyData
            ? undefined
            : undefined, // stop count not in freq data
        },
        {
          metric: "Daily Trips",
          Custom: customDailyTrips || 0,
          GO: frequencyData.totalTripsWeekday,
        },
        {
          metric: "Headway (min)",
          Custom: customHeadway ?? 0,
          GO: Math.round(frequencyData.averageHeadway),
        },
        {
          metric: "Peak /hr",
          Custom: customHeadway ? Math.floor(60 / customHeadway) : 0,
          GO: frequencyData.peakFrequencyWeekday,
        },
      ]
    : [];

  return (
    <div className="fixed bottom-24 right-4 z-50 w-[480px] max-w-[95vw] overflow-hidden rounded-[28px] border border-white/50 bg-[var(--glass-surface-strong)] text-sm text-slate-900 shadow-[var(--glass-shadow)] backdrop-blur-2xl">
      {/* Header */}
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

      {/* GO Route Selector */}
      <div className="border-b border-white/35 px-5 py-4">
        <label className="mb-2 block text-[11px] uppercase tracking-wide text-slate-500">
          Compare against GO Transit route
        </label>
        <select
          value={selectedShortName}
          onChange={(e) => setSelectedShortName(e.target.value)}
          className="w-full cursor-pointer appearance-none rounded-2xl border border-white/45 bg-white/70 px-3 py-2.5 text-sm text-slate-900 focus:border-sky-300 focus:outline-none focus:ring-4 focus:ring-sky-100/60"
        >
          <option value="">Select a route…</option>
          {goRoutes.map((r) => (
            <option key={r.route_id} value={r.route_short_name}>
              {r.route_short_name} — {r.route_long_name}
            </option>
          ))}
        </select>
      </div>

      {/* Side-by-side metrics */}
      <div className="px-5 py-4">
        <div className="grid grid-cols-2 gap-3">
          {/* Custom Route Column */}
          <div className="space-y-2 rounded-[22px] border border-white/45 bg-white/45 p-4">
            <div className="mb-1 text-[10px] uppercase tracking-widest text-slate-500">
              Custom Route
            </div>
            <div className="truncate text-[11px] font-semibold text-slate-800">
              {customRoute.name || "Untitled Route"}
            </div>
            <MetricRow label="Stops" value={String(customStops)} />
            <MetricRow
              label="Duration"
              value={customDuration != null ? `${customDuration} min` : "—"}
            />
            <MetricRow
              label="Headway"
              value={customHeadway != null ? `${customHeadway} min` : "—"}
            />
            <MetricRow
              label="Daily Trips"
              value={customDailyTrips > 0 ? String(customDailyTrips) : "—"}
            />
            <MetricRow
              label="Trips/hr (peak)"
              value={
                customHeadway
                  ? String(Math.floor(60 / customHeadway))
                  : "—"
              }
            />
          </div>

          {/* GO Route Column */}
          <div className="space-y-2 rounded-[22px] border border-white/45 bg-white/45 p-4">
            <div className="mb-1 text-[10px] uppercase tracking-widest text-slate-500">
              GO Transit
            </div>
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
            {error && (
              <div className="text-[11px] text-red-600">{error}</div>
            )}
            {frequencyData && (
              <>
                <div className="truncate text-[11px] font-semibold text-slate-800">
                  {frequencyData.route_short_name} —{" "}
                  {frequencyData.startStopName} → {frequencyData.endStopName}
                </div>
                <MetricRow label="Stops" value="—" />
                <MetricRow label="Duration" value="—" />
                <MetricRow
                  label="Headway"
                  value={`${Math.round(frequencyData.averageHeadway)} min`}
                />
                <MetricRow
                  label="Daily Trips"
                  value={String(frequencyData.totalTripsWeekday)}
                />
                <MetricRow
                  label="Trips/hr (peak)"
                  value={String(frequencyData.peakFrequencyWeekday)}
                />
              </>
            )}
            {!loading && !error && !frequencyData && (
              <div className="pt-4 text-[11px] text-slate-500">
                Select a GO route above
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Bar chart */}
      {frequencyData && chartData.length > 0 && (
        <div className="border-t border-white/35 px-5 pb-5 pt-4">
          <div className="mb-2 text-[10px] uppercase tracking-widest text-slate-500">
            Key Metrics
          </div>
          <ResponsiveContainer width="100%" height={120}>
            <BarChart
              data={chartData}
              margin={{ top: 0, right: 0, left: -20, bottom: 0 }}
              barGap={4}
            >
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
              <Bar dataKey="Custom" fill="#3b82f6" radius={[2, 2, 0, 0]} />
              <Bar dataKey="GO" fill="#22c55e" radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
          <div className="mt-1 flex justify-center gap-4">
            <div className="flex items-center gap-1 text-[9px] text-slate-500">
              <span className="inline-block h-2 w-2 rounded-sm bg-blue-500" />
              Custom
            </div>
            <div className="flex items-center gap-1 text-[9px] text-slate-500">
              <span className="inline-block h-2 w-2 rounded-sm bg-green-500" />
              GO Transit
            </div>
          </div>
        </div>
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
