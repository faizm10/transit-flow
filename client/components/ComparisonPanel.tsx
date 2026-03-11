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
    <div className="fixed right-4 bottom-4 z-50 w-[480px] max-w-[95vw] rounded-xl bg-black/85 border border-white/10 backdrop-blur-md shadow-2xl text-white text-sm">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
        <span className="font-semibold text-white/90">Route Comparison</span>
        <button
          onClick={onClose}
          className="text-white/50 hover:text-white transition-colors"
        >
          <X size={16} />
        </button>
      </div>

      {/* GO Route Selector */}
      <div className="px-4 py-3 border-b border-white/10">
        <label className="text-[11px] text-white/50 mb-1 block uppercase tracking-wide">
          Compare against GO Transit route
        </label>
        <select
          value={selectedShortName}
          onChange={(e) => setSelectedShortName(e.target.value)}
          className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-1.5 text-sm text-white appearance-none cursor-pointer focus:outline-none focus:border-white/40"
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
      <div className="px-4 py-3">
        <div className="grid grid-cols-2 gap-3">
          {/* Custom Route Column */}
          <div className="space-y-2">
            <div className="text-[10px] text-white/40 uppercase tracking-widest mb-1">
              Custom Route
            </div>
            <div className="text-[11px] font-semibold text-white/80 truncate">
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
          <div className="space-y-2">
            <div className="text-[10px] text-white/40 uppercase tracking-widest mb-1">
              GO Transit
            </div>
            {loading && (
              <div className="text-white/40 text-[11px] pt-4">Loading…</div>
            )}
            {error && (
              <div className="text-red-400 text-[11px]">{error}</div>
            )}
            {frequencyData && (
              <>
                <div className="text-[11px] font-semibold text-white/80 truncate">
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
              <div className="text-white/30 text-[11px] pt-4">
                Select a GO route above
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Bar chart */}
      {frequencyData && chartData.length > 0 && (
        <div className="px-4 pb-4 border-t border-white/10 pt-3">
          <div className="text-[10px] text-white/40 uppercase tracking-widest mb-2">
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
                tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 9 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 9 }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                contentStyle={{
                  background: "rgba(0,0,0,0.8)",
                  border: "1px solid rgba(255,255,255,0.15)",
                  borderRadius: 6,
                  fontSize: 11,
                }}
                labelStyle={{ color: "rgba(255,255,255,0.7)" }}
                itemStyle={{ color: "rgba(255,255,255,0.9)" }}
              />
              <Bar dataKey="Custom" fill="#3b82f6" radius={[2, 2, 0, 0]} />
              <Bar dataKey="GO" fill="#22c55e" radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
          <div className="flex gap-4 justify-center mt-1">
            <div className="flex items-center gap-1 text-[9px] text-white/40">
              <span className="w-2 h-2 rounded-sm bg-blue-500 inline-block" />
              Custom
            </div>
            <div className="flex items-center gap-1 text-[9px] text-white/40">
              <span className="w-2 h-2 rounded-sm bg-green-500 inline-block" />
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
    <div className="flex justify-between items-center">
      <span className="text-[10px] text-white/40">{label}</span>
      <span className="text-[11px] text-white/80 font-medium">{value}</span>
    </div>
  );
}
