"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  expandSchedule,
  type CustomRoute,
  type Schedule,
  type ScheduleTrip,
  type ScheduleTrips,
} from "@/hooks/useRouteBuilder";

type ScheduleBuilderProps = {
  activeRoute: CustomRoute;
  routes: CustomRoute[];
  scheduleTargetIds: string[];
  setScheduleTargetIds: (ids: string[]) => void;
  scheduleTargetRoute: CustomRoute;
  scheduleTargetName: string;
  onApplySchedule: (schedule: Schedule | undefined) => void;
  onClose?: () => void;
  runtimeSeconds?: number | null;
};

type Mode = "simple" | "advanced";
type Filter = "all" | "peak" | "off-peak" | "edited";

const DEFAULT_RULES = {
  serviceWindow: { start: "06:00", end: "22:00" },
  peak: {
    intervalMinutes: 10,
    ranges: [
      { start: "06:30", end: "09:30" },
      { start: "15:30", end: "18:30" },
    ],
  },
  offPeak: { intervalMinutes: 20 },
  runtimeMinutes: 40,
};

function parseTimeToMinutes(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parts = trimmed.split(":");
  if (parts.length < 2) return null;
  const hours = Number(parts[0]);
  const minutes = Number(parts[1]);
  if ([hours, minutes].some((part) => Number.isNaN(part))) return null;
  if (minutes < 0 || minutes > 59) return null;
  if (hours < 0 || hours > 47) return null;
  return hours * 60 + minutes;
}

function formatMinutes(value: number): { time: string; dayOffset: number } {
  const total = Math.max(0, Math.round(value));
  const dayOffset = Math.floor(total / 1440);
  const minutesInDay = total % 1440;
  const hours = Math.floor(minutesInDay / 60);
  const minutes = minutesInDay % 60;
  return {
    time: `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`,
    dayOffset,
  };
}

function isWithinRange(mins: number, start: string, end: string): boolean {
  const s = parseTimeToMinutes(start);
  const e = parseTimeToMinutes(end);
  if (s == null || e == null) return false;
  return mins >= s && mins <= e;
}

function isPeak(mins: number, ranges: Array<{ start: string; end: string }>): boolean {
  return ranges.some((range) => isWithinRange(mins, range.start, range.end));
}

function generateTripsFromRules(rules: ScheduleTrips["rules"]): ScheduleTrip[] {
  const start = parseTimeToMinutes(rules.serviceWindow.start);
  const end = parseTimeToMinutes(rules.serviceWindow.end);
  if (start == null || end == null || end <= start) return [];
  const peakInterval = Math.max(1, Math.round(rules.peak.intervalMinutes));
  const offPeakInterval = Math.max(1, Math.round(rules.offPeak.intervalMinutes));
  const runtimeMinutes = Math.max(5, Math.round(rules.runtimeMinutes));
  const trips: ScheduleTrip[] = [];
  let t = start;
  let guard = 0;
  while (t <= end && guard < 2000) {
    const peak = isPeak(t, rules.peak.ranges);
    trips.push({
      id: `trip-${t}-${Math.random().toString(36).slice(2, 6)}`,
      departMinutes: t,
      runtimeMinutes,
      type: peak ? "peak" : "off-peak",
      status: "auto",
    });
    t += peak ? peakInterval : offPeakInterval;
    guard += 1;
  }
  return trips;
}

function estimateVehicles(trips: ScheduleTrip[]): number {
  if (!trips.length) return 0;
  const events: Array<{ t: number; delta: number }> = [];
  trips.forEach((trip) => {
    const start = trip.departMinutes;
    const end = trip.departMinutes + Math.max(1, trip.runtimeMinutes);
    events.push({ t: start, delta: 1 });
    events.push({ t: end, delta: -1 });
  });
  events.sort((a, b) => a.t - b.t || b.delta - a.delta);
  let current = 0;
  let max = 0;
  events.forEach((event) => {
    current += event.delta;
    max = Math.max(max, current);
  });
  return max;
}

function deriveTripsFromSchedule(
  schedule: Schedule | undefined,
  rules: ScheduleTrips["rules"],
): ScheduleTrip[] {
  if (!schedule) return [];
  if (schedule.type === "trips") return schedule.trips ?? [];

  const departures = expandSchedule(schedule);
  const runtimeMinutes = Math.max(5, Math.round(rules.runtimeMinutes));
  return departures
    .map((time) => {
      const mins = parseTimeToMinutes(time);
      if (mins == null) return null;
      const peak = isPeak(mins, rules.peak.ranges);
      return {
        id: `trip-${mins}-${Math.random().toString(36).slice(2, 6)}`,
        departMinutes: mins,
        runtimeMinutes,
        type: peak ? "peak" : "off-peak",
        status: "auto",
      } as ScheduleTrip;
    })
    .filter(Boolean) as ScheduleTrip[];
}

export function ScheduleBuilder({
  activeRoute,
  routes,
  scheduleTargetIds,
  setScheduleTargetIds,
  scheduleTargetRoute,
  scheduleTargetName,
  onApplySchedule,
  onClose,
  runtimeSeconds,
}: ScheduleBuilderProps) {
  const runtimeAutoMinutes = useMemo(() => {
    if (!runtimeSeconds || !Number.isFinite(runtimeSeconds)) return 40;
    return Math.max(5, Math.round(runtimeSeconds / 60));
  }, [runtimeSeconds]);

  const [mode, setMode] = useState<Mode>("simple");
  const [filter, setFilter] = useState<Filter>("all");
  const [rules, setRules] = useState<ScheduleTrips["rules"]>({
    ...DEFAULT_RULES,
    runtimeMinutes: runtimeAutoMinutes,
  });
  const [trips, setTrips] = useState<ScheduleTrip[]>([]);
  const [editingTripId, setEditingTripId] = useState<string | null>(null);
  const [editingDepart, setEditingDepart] = useState("");
  const [editingRuntime, setEditingRuntime] = useState("");

  useEffect(() => {
    const existing = scheduleTargetRoute.schedule;
    const nextRules: ScheduleTrips["rules"] =
      existing && existing.type === "trips"
        ? existing.rules
        : {
            ...DEFAULT_RULES,
            runtimeMinutes: runtimeAutoMinutes,
          };
    setRules(nextRules);
    setTrips(deriveTripsFromSchedule(existing, nextRules));
    setMode("simple");
    setFilter("all");
    setEditingTripId(null);
  }, [scheduleTargetRoute.id, scheduleTargetRoute.schedule, runtimeAutoMinutes]);

  const previewTrips = useMemo(
    () => generateTripsFromRules(rules),
    [rules],
  );

  const summaryTrips = mode === "simple" ? previewTrips : trips;
  const summaryFirst = summaryTrips.length > 0 ? summaryTrips[0] : null;
  const summaryLast =
    summaryTrips.length > 0 ? summaryTrips[summaryTrips.length - 1] : null;
  const vehiclesNeeded = estimateVehicles(summaryTrips);

  const sortedTrips = useMemo(() => {
    return [...trips].sort((a, b) => a.departMinutes - b.departMinutes);
  }, [trips]);

  const filteredTrips = useMemo(() => {
    if (filter === "all") return sortedTrips;
    if (filter === "edited") {
      return sortedTrips.filter((trip) => trip.status === "edited");
    }
    return sortedTrips.filter((trip) => trip.type === filter);
  }, [sortedTrips, filter]);

  const handleGenerate = () => {
    const nextTrips = generateTripsFromRules(rules);
    setTrips(nextTrips);
    setMode("advanced");
  };

  const handleRegenerate = () => {
    setTrips(generateTripsFromRules(rules));
  };

  const handleAddTrip = () => {
    const last = sortedTrips[sortedTrips.length - 1];
    const base = last ? last.departMinutes : parseTimeToMinutes(rules.serviceWindow.start) ?? 0;
    const usePeak = isPeak(base, rules.peak.ranges);
    const interval = usePeak
      ? rules.peak.intervalMinutes
      : rules.offPeak.intervalMinutes;
    const nextDepart = base + Math.max(1, Math.round(interval));
    const runtimeMinutes = Math.max(5, Math.round(rules.runtimeMinutes));
    setTrips((prev) => [
      ...prev,
      {
        id: `trip-${nextDepart}-${Math.random().toString(36).slice(2, 6)}`,
        departMinutes: nextDepart,
        runtimeMinutes,
        type: usePeak ? "peak" : "off-peak",
        status: "edited",
      },
    ]);
  };

  const handleDeleteTrip = (id: string) => {
    setTrips((prev) => prev.filter((trip) => trip.id !== id));
  };

  const handleDuplicateTrip = (trip: ScheduleTrip) => {
    const nextDepart = trip.departMinutes + 5;
    setTrips((prev) => [
      ...prev,
      {
        ...trip,
        id: `trip-${nextDepart}-${Math.random().toString(36).slice(2, 6)}`,
        departMinutes: nextDepart,
        status: "edited",
      },
    ]);
  };

  const startEditingTrip = (trip: ScheduleTrip) => {
    const formatted = formatMinutes(trip.departMinutes);
    setEditingTripId(trip.id);
    setEditingDepart(formatted.time);
    setEditingRuntime(String(trip.runtimeMinutes));
  };

  const commitTripEdit = useCallback(() => {
    if (!editingTripId) return;
    const departMinutes = parseTimeToMinutes(editingDepart);
    const runtimeMinutes = Number(editingRuntime);
    if (departMinutes == null || !Number.isFinite(runtimeMinutes)) return;
    setTrips((prev) =>
      prev.map((trip) =>
        trip.id === editingTripId
          ? {
              ...trip,
              departMinutes,
              runtimeMinutes: Math.max(5, Math.round(runtimeMinutes)),
              status: "edited",
            }
          : trip,
      ),
    );
    setEditingTripId(null);
  }, [editingTripId, editingDepart, editingRuntime]);

  const cancelTripEdit = () => {
    setEditingTripId(null);
  };

  const handleSaveSchedule = () => {
    const schedule: ScheduleTrips = {
      type: "trips",
      trips: sortedTrips,
      rules,
    };
    onApplySchedule(schedule);
    onClose?.();
  };

  const updateRules = (patch: Partial<ScheduleTrips["rules"]>) => {
    setRules((prev) => ({
      ...prev,
      ...patch,
    }));
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-4 sm:p-6">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div className="relative z-10 w-full max-w-6xl max-h-[92vh] overflow-hidden rounded-2xl border border-white/10 bg-neutral-950/95 shadow-2xl text-white flex flex-col">
        <div className="pointer-events-none absolute -top-32 -right-28 h-72 w-72 rounded-full bg-emerald-500/15 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 -left-28 h-72 w-72 rounded-full bg-sky-500/15 blur-3xl" />

        <div className="flex items-start justify-between border-b border-white/10 px-6 py-5">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] uppercase tracking-[0.24em] text-white/60">
              Schedule Builder
            </div>
            <h3 className="mt-3 text-lg font-semibold">Service Plan</h3>
            <p className="text-xs text-white/60">
              Build an all-day schedule and immediately push it into simulation.
            </p>
          </div>
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-[0.2em] text-white/40">Editing</div>
            <div className="text-sm font-medium text-white/90">{scheduleTargetName}</div>
            <div className="mt-2 flex flex-wrap items-center justify-end gap-2 text-[11px] text-white/50">
              <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5">
                {summaryTrips.length} trips
              </span>
              <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5">
                {rules.serviceWindow.start}–{rules.serviceWindow.end}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between border-b border-white/10 px-6 py-3">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setMode("simple")}
              className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                mode === "simple"
                  ? "bg-white text-black"
                  : "border border-white/10 text-white/70 hover:text-white"
              }`}
            >
              Simple
            </button>
            <button
              onClick={() => setMode("advanced")}
              className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                mode === "advanced"
                  ? "bg-white text-black"
                  : "border border-white/10 text-white/70 hover:text-white"
              }`}
            >
              Advanced
            </button>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleSaveSchedule}
              className="rounded-full bg-emerald-400 px-4 py-1.5 text-xs font-semibold text-neutral-900 shadow-sm hover:bg-emerald-300"
            >
              Save Schedule
            </button>
            <button
              onClick={onClose}
              className="rounded-full border border-white/10 px-3 py-1.5 text-xs text-white/70 hover:text-white"
            >
              Close
            </button>
          </div>
        </div>

        {mode === "simple" && (
          <div className="grid gap-6 p-6 lg:grid-cols-[minmax(260px,360px)_1fr] overflow-y-auto">
            <div className="space-y-4">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="text-[11px] uppercase tracking-[0.2em] text-white/50">
                  Applies To
                </div>
                <select
                  multiple
                  value={scheduleTargetIds}
                  onChange={(e) => {
                    const selected = Array.from(e.target.selectedOptions).map(
                      (option) => option.value,
                    );
                    setScheduleTargetIds(
                      selected.length > 0 ? selected : [activeRoute.id],
                    );
                  }}
                  className="mt-3 h-32 w-full rounded-xl bg-black/40 border border-white/10 px-2 py-2 text-xs text-white/90 focus:outline-none focus:ring-1 focus:ring-emerald-300/40"
                >
                  {routes.map((route) => (
                    <option key={route.id} value={route.id}>
                      {route.name}
                    </option>
                  ))}
                </select>
                <div className="mt-2 text-[10px] text-white/40">
                  Hold Cmd/Ctrl to select multiple routes.
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/5 p-4 space-y-3">
                <div className="text-[11px] uppercase tracking-[0.2em] text-white/50">
                  Service Window
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="time"
                    value={rules.serviceWindow.start}
                    onChange={(e) =>
                      updateRules({
                        serviceWindow: {
                          ...rules.serviceWindow,
                          start: e.target.value,
                        },
                      })
                    }
                    className="rounded-xl bg-black/40 border border-white/10 px-2.5 py-2 text-xs text-white/90 focus:outline-none focus:ring-1 focus:ring-emerald-300/40"
                  />
                  <input
                    type="time"
                    value={rules.serviceWindow.end}
                    onChange={(e) =>
                      updateRules({
                        serviceWindow: {
                          ...rules.serviceWindow,
                          end: e.target.value,
                        },
                      })
                    }
                    className="rounded-xl bg-black/40 border border-white/10 px-2.5 py-2 text-xs text-white/90 focus:outline-none focus:ring-1 focus:ring-emerald-300/40"
                  />
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <div className="text-[11px] text-white/60">Peak frequency (min)</div>
                    <input
                      type="number"
                      min={1}
                      value={rules.peak.intervalMinutes}
                      onChange={(e) =>
                        updateRules({
                          peak: {
                            ...rules.peak,
                            intervalMinutes:
                              e.target.value === "" ? 0 : Number(e.target.value),
                          },
                        })
                      }
                      className="mt-2 w-full rounded-xl bg-black/40 border border-white/10 px-2.5 py-2 text-xs text-white/90 focus:outline-none focus:ring-1 focus:ring-emerald-300/40"
                    />
                  </div>
                  <div>
                    <div className="text-[11px] text-white/60">Off-peak frequency (min)</div>
                    <input
                      type="number"
                      min={1}
                      value={rules.offPeak.intervalMinutes}
                      onChange={(e) =>
                        updateRules({
                          offPeak: {
                            intervalMinutes:
                              e.target.value === "" ? 0 : Number(e.target.value),
                          },
                        })
                      }
                      className="mt-2 w-full rounded-xl bg-black/40 border border-white/10 px-2.5 py-2 text-xs text-white/90 focus:outline-none focus:ring-1 focus:ring-emerald-300/40"
                    />
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/5 p-4 space-y-3">
                <div className="text-[11px] uppercase tracking-[0.2em] text-white/50">
                  Peak Ranges
                </div>
                {rules.peak.ranges.map((range, idx) => (
                  <div key={`peak-${idx}`} className="grid grid-cols-2 gap-2">
                    <input
                      type="time"
                      value={range.start}
                      onChange={(e) => {
                        const next = [...rules.peak.ranges];
                        next[idx] = { ...next[idx], start: e.target.value };
                        updateRules({
                          peak: {
                            ...rules.peak,
                            ranges: next,
                          },
                        });
                      }}
                      className="rounded-xl bg-black/40 border border-white/10 px-2.5 py-2 text-xs text-white/90 focus:outline-none focus:ring-1 focus:ring-emerald-300/40"
                    />
                    <input
                      type="time"
                      value={range.end}
                      onChange={(e) => {
                        const next = [...rules.peak.ranges];
                        next[idx] = { ...next[idx], end: e.target.value };
                        updateRules({
                          peak: {
                            ...rules.peak,
                            ranges: next,
                          },
                        });
                      }}
                      className="rounded-xl bg-black/40 border border-white/10 px-2.5 py-2 text-xs text-white/90 focus:outline-none focus:ring-1 focus:ring-emerald-300/40"
                    />
                  </div>
                ))}
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/5 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="text-[11px] uppercase tracking-[0.2em] text-white/50">
                    Runtime
                  </div>
                  <button
                    onClick={() =>
                      updateRules({
                        runtimeMinutes: runtimeAutoMinutes,
                      })
                    }
                    className="text-[10px] text-emerald-300 hover:text-emerald-200"
                  >
                    Use auto ({runtimeAutoMinutes}m)
                  </button>
                </div>
                <input
                  type="number"
                  min={5}
                  value={rules.runtimeMinutes}
                  onChange={(e) =>
                    updateRules({
                      runtimeMinutes: e.target.value === "" ? 0 : Number(e.target.value),
                    })
                  }
                  className="w-full rounded-xl bg-black/40 border border-white/10 px-2.5 py-2 text-xs text-white/90 focus:outline-none focus:ring-1 focus:ring-emerald-300/40"
                />
              </div>

              <button
                onClick={handleGenerate}
                className="w-full rounded-xl bg-gradient-to-r from-emerald-400 to-sky-300 px-3 py-2.5 text-xs font-semibold text-neutral-900 shadow-lg shadow-emerald-500/10 transition hover:from-emerald-300 hover:to-sky-200"
              >
                Generate Schedule
              </button>
            </div>

            <div className="space-y-4">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
                <div className="text-[11px] uppercase tracking-[0.2em] text-white/50">
                  Live Summary
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-xl border border-white/10 bg-black/40 p-3">
                    <div className="text-[10px] uppercase tracking-[0.2em] text-white/40">
                      Runtime
                    </div>
                    <div className="mt-2 text-lg font-semibold text-white">
                      {Math.round(rules.runtimeMinutes)} min
                    </div>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-black/40 p-3">
                    <div className="text-[10px] uppercase tracking-[0.2em] text-white/40">
                      Trips
                    </div>
                    <div className="mt-2 text-lg font-semibold text-white">
                      {summaryTrips.length}
                    </div>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-black/40 p-3">
                    <div className="text-[10px] uppercase tracking-[0.2em] text-white/40">
                      First Departure
                    </div>
                    <div className="mt-2 text-lg font-semibold text-white">
                      {summaryFirst ? formatMinutes(summaryFirst.departMinutes).time : "--:--"}
                    </div>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-black/40 p-3">
                    <div className="text-[10px] uppercase tracking-[0.2em] text-white/40">
                      Last Departure
                    </div>
                    <div className="mt-2 text-lg font-semibold text-white">
                      {summaryLast ? formatMinutes(summaryLast.departMinutes).time : "--:--"}
                    </div>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-black/40 p-3 sm:col-span-2">
                    <div className="text-[10px] uppercase tracking-[0.2em] text-white/40">
                      Vehicles Needed
                    </div>
                    <div className="mt-2 text-lg font-semibold text-white">
                      {vehiclesNeeded}
                    </div>
                  </div>
                </div>
                <div className="mt-4 text-[11px] text-white/45">
                  Summary updates live as you adjust frequencies, peaks, and runtime.
                </div>
              </div>
            </div>
          </div>
        )}

        {mode === "advanced" && (
          <div className="p-6 space-y-4 overflow-y-auto">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                {(["all", "peak", "off-peak", "edited"] as Filter[]).map((opt) => (
                  <button
                    key={opt}
                    onClick={() => setFilter(opt)}
                    className={`rounded-full px-3 py-1 ${
                      filter === opt
                        ? "bg-white text-black"
                        : "border border-white/10 text-white/70 hover:text-white"
                    }`}
                  >
                    {opt === "all"
                      ? "All"
                      : opt === "peak"
                        ? "Peak"
                        : opt === "off-peak"
                          ? "Off-peak"
                          : "Edited"}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={handleRegenerate}
                  className="rounded-full border border-white/10 px-3 py-1.5 text-xs text-white/70 hover:text-white"
                >
                  Regenerate from rules
                </button>
                <button
                  onClick={handleAddTrip}
                  className="rounded-full bg-white/10 px-3 py-1.5 text-xs text-white/80 hover:bg-white/20"
                >
                  Add trip
                </button>
              </div>
            </div>

            <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/5">
              <div className="overflow-x-auto">
                <div className="min-w-[980px] grid grid-cols-[80px_160px_160px_120px_120px_120px_140px] gap-2 border-b border-white/10 bg-black/40 px-4 py-3 text-[10px] uppercase tracking-[0.2em] text-white/50 sticky top-0">
                <div>Trip</div>
                <div>Depart</div>
                <div>Arrival</div>
                <div>Runtime</div>
                <div>Type</div>
                <div>Status</div>
                <div>Actions</div>
              </div>
              <div className="max-h-[420px] overflow-y-auto min-w-[980px]">
                {filteredTrips.length === 0 ? (
                  <div className="px-4 py-6 text-center text-xs text-white/50">
                    No trips match this filter.
                  </div>
                ) : (
                  filteredTrips.map((trip, index) => {
                    const depart = formatMinutes(trip.departMinutes);
                    const arrival = formatMinutes(trip.departMinutes + trip.runtimeMinutes);
                    const isEditing = editingTripId === trip.id;
                    const outOfWindow =
                      parseTimeToMinutes(rules.serviceWindow.start) != null &&
                      parseTimeToMinutes(rules.serviceWindow.end) != null &&
                      (trip.departMinutes <
                        (parseTimeToMinutes(rules.serviceWindow.start) ?? 0) ||
                        trip.departMinutes >
                          (parseTimeToMinutes(rules.serviceWindow.end) ?? 0));

                    return (
                      <div
                        key={trip.id}
                        className={`grid grid-cols-[80px_160px_160px_120px_120px_120px_140px] gap-2 px-4 py-3 text-xs transition ${
                          trip.status === "edited"
                            ? "bg-white/5"
                            : "bg-transparent"
                        } hover:bg-white/10`}
                        onClick={() => {
                          if (!isEditing) startEditingTrip(trip);
                        }}
                      >
                        <div className="text-white/70">#{index + 1}</div>
                        <div className="text-white/90">
                          {isEditing ? (
                            <input
                              value={editingDepart}
                              onChange={(e) => setEditingDepart(e.target.value)}
                              className="w-full rounded-lg bg-black/40 border border-white/10 px-2 py-1 text-xs text-white"
                            />
                          ) : (
                            <div className="flex items-center gap-2">
                              <span>{depart.time}</span>
                              {depart.dayOffset > 0 && (
                                <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] text-white/60">
                                  +{depart.dayOffset}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                        <div className="text-white/90">
                          <div className="flex items-center gap-2">
                            <span>{arrival.time}</span>
                            {arrival.dayOffset > 0 && (
                              <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] text-white/60">
                                +{arrival.dayOffset}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="text-white/80">
                          {isEditing ? (
                            <input
                              value={editingRuntime}
                              onChange={(e) => setEditingRuntime(e.target.value)}
                              className="w-full rounded-lg bg-black/40 border border-white/10 px-2 py-1 text-xs text-white"
                            />
                          ) : (
                            `${Math.round(trip.runtimeMinutes)}m`
                          )}
                        </div>
                        <div className="text-white/70 capitalize">{trip.type}</div>
                        <div className="text-white/60">
                          <div className="flex items-center gap-2">
                            <span>{trip.status === "edited" ? "Edited" : "Auto"}</span>
                            {outOfWindow && (
                              <span className="rounded-full border border-amber-300/30 bg-amber-300/10 px-2 py-0.5 text-[10px] text-amber-200">
                                Out of window
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 text-[11px]">
                          {isEditing ? (
                            <>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  commitTripEdit();
                                }}
                                className="rounded-full bg-white/15 px-2 py-1 text-white/80 hover:bg-white/25"
                              >
                                Save
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  cancelTripEdit();
                                }}
                                className="rounded-full border border-white/10 px-2 py-1 text-white/60 hover:text-white"
                              >
                                Cancel
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDuplicateTrip(trip);
                                }}
                                className="rounded-full border border-white/10 px-2 py-1 text-white/60 hover:text-white"
                              >
                                Duplicate
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeleteTrip(trip.id);
                                }}
                                className="rounded-full border border-white/10 px-2 py-1 text-white/60 hover:text-white"
                              >
                                Delete
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
