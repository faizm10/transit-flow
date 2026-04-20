"use client";

import { useEffect, useState } from "react";
import { Play, Pause, Loader2, Train, Bus, ChevronUp, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { customRouteSelectionId, formatSimTime } from "@/lib/simulation";
import { GO_RAIL_LINES } from "@/lib/routeColors";
import { type CustomRoute, type EnrichedRoute } from "@/lib/gtfs";

interface SimulationHUDProps {
  trips: { trip_id: string }[];
  currentTime: number;
  startTime: number;
  endTime: number;
  playing: boolean;
  speed: 1 | 10 | 60;
  loading: boolean;
  error: string | null;
  selectedRoutes: string[];
  customRoutes: CustomRoute[];
  date: string;
  startHour: number;
  placement?: "bottom-center" | "bottom-right";
  onTogglePlay: () => void;
  onScrub: (t: number) => void;
  onCycleSpeed: () => void;
  onLoadSimulation: (params?: { routes?: string[]; startHour?: number; date?: string }) => void;
  onRoutesChange: (routes: string[]) => void;
  onDateChange: (date: string) => void;
  onStartHourChange: (hour: number) => void;
}

export default function SimulationHUD({
  trips,
  currentTime,
  startTime,
  endTime,
  playing,
  speed,
  loading,
  error,
  selectedRoutes,
  customRoutes,
  date,
  placement = "bottom-center",
  onTogglePlay,
  onScrub,
  onCycleSpeed,
  onLoadSimulation,
  onRoutesChange,
  onDateChange,
}: SimulationHUDProps) {
  const [routePickerOpen, setRoutePickerOpen] = useState(false);
  const [editingDate, setEditingDate] = useState(false);
  const hasTrips = trips.length > 0;
  const selectedHasBus = selectedRoutes.some((route) => /^\d/.test(route))
    || customRoutes.some((route) => route.type === "bus" && selectedRoutes.includes(customRouteSelectionId(route.id)));
  const baseShellClass = placement === "bottom-right"
    ? "absolute bottom-4 left-4 right-4 z-30 sm:left-auto sm:right-4 sm:bottom-6"
    : "absolute bottom-6 left-1/2 -translate-x-1/2 z-30";
  const cardWidthClass = placement === "bottom-right"
    ? "sm:w-[min(560px,calc(100vw-32px))]"
    : "";

  function handleDateChange(newDate: string) {
    onDateChange(newDate);
    onLoadSimulation({ date: newDate });
    setEditingDate(false);
  }

  const scrubProgress = endTime > startTime
    ? (currentTime - startTime) / (endTime - startTime)
    : 0;

  // ── Onboarding / empty state ──────────────────────────────────────────────
  // Distinguish "never started" from "started but no service on this date"
  const hasLoadedOnce = startTime !== endTime || error !== null;

  if (!hasTrips && !loading) {
    const noServiceOnDate = hasLoadedOnce && !error;

    return (
      <div className={`${baseShellClass} w-[min(480px,calc(100vw-32px))] ${placement === "bottom-right" ? "w-auto sm:w-[min(480px,calc(100vw-32px))]" : ""}`}>
        <div className="bg-white/95 backdrop-blur-xl rounded-2xl border border-slate-200 shadow-xl p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${noServiceOnDate ? "bg-amber-100" : "bg-emerald-100"}`}>
              <Train className={`w-5 h-5 ${noServiceOnDate ? "text-amber-700" : "text-emerald-700"}`} />
            </div>
            <div>
              <p className="font-semibold text-slate-900 text-sm">
                {noServiceOnDate ? "No service on this date" : "Watch GO service in real time"}
              </p>
              <p className="text-xs text-slate-400">
                {noServiceOnDate
                  ? "Try a weekday — some lines only run Mon–Fri"
                  : "Real GTFS schedule · trains and buses"}
              </p>
            </div>
          </div>

          {/* Date selector */}
          <div className="flex items-center gap-2 mb-3">
            <label className="text-xs text-slate-500 font-medium whitespace-nowrap">Date</label>
            <input
              type="date"
              value={date}
              min="2026-01-06"
              max="2026-04-24"
              onChange={(e) => onDateChange(e.target.value)}
              className="flex-1 text-xs rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#007A33]/30"
            />
          </div>

          {error && (
            <p className="text-xs text-red-500 mb-3 bg-red-50 rounded-lg px-3 py-2">{error}</p>
          )}

          <Sheet open={routePickerOpen} onOpenChange={setRoutePickerOpen}>
            <SheetTrigger className="mb-2 flex w-full items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100">
              <Bus className="h-4 w-4 text-slate-500" />
              {selectedRoutes.length} selected route{selectedRoutes.length !== 1 ? "s" : ""}
              <ChevronUp className="h-3.5 w-3.5 text-slate-400" />
            </SheetTrigger>
            <SheetContent
              side="bottom"
              className="max-h-[64vh] gap-2 overflow-y-auto rounded-t-lg sm:!bottom-4 sm:!left-1/2 sm:!right-auto sm:!w-[min(580px,calc(100vw-32px))] sm:!-translate-x-1/2 sm:rounded-lg sm:border"
            >
              <SheetHeader className="px-4 pb-1 pt-3">
                <SheetTitle className="text-sm">Select routes</SheetTitle>
              </SheetHeader>
              <RoutePicker
                selected={selectedRoutes}
                customRoutes={customRoutes}
                onChange={onRoutesChange}
                onApply={(routes) => {
                  onRoutesChange(routes);
                  setRoutePickerOpen(false);
                }}
              />
            </SheetContent>
          </Sheet>

          <Button
            className="w-full rounded-xl bg-[#007A33] hover:bg-[#005f28] text-white h-10"
            onClick={() => onLoadSimulation()}
            disabled={selectedRoutes.length === 0}
          >
            <Play className="w-4 h-4 mr-2" /> Start simulation
          </Button>

          <p className="text-center text-xs text-slate-400 mt-2">
            Showing estimated trips — real GTFS schedules coming soon
          </p>
        </div>
      </div>
    );
  }

  // ── Loading state ─────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className={baseShellClass}>
        <div className="bg-white/95 backdrop-blur-xl rounded-2xl border border-slate-200 shadow-xl px-6 py-3.5 flex items-center gap-3">
          <Loader2 className="w-4 h-4 text-emerald-600 animate-spin" />
          <span className="text-sm font-medium text-slate-700">Loading trips…</span>
        </div>
      </div>
    );
  }

  // ── Active playback HUD ───────────────────────────────────────────────────
  return (
    <div className={`${baseShellClass} w-[min(560px,calc(100vw-32px))] ${placement === "bottom-right" ? `w-auto ${cardWidthClass}` : ""}`}>
      <div className="bg-white/95 backdrop-blur-xl rounded-2xl border border-slate-200 shadow-xl px-4 py-3">
        {/* Top row: routes chip + time + speed */}
        <div className="flex items-center justify-between mb-2.5">
          {/* Route picker */}
          <Sheet open={routePickerOpen} onOpenChange={setRoutePickerOpen}>
            <SheetTrigger className="flex items-center gap-1.5 text-xs font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg px-2.5 py-1.5 transition-colors">
              {selectedHasBus ? <Bus className="w-3.5 h-3.5" /> : <Train className="w-3.5 h-3.5" />}
              {selectedRoutes.length} routes
              <ChevronUp className="w-3 h-3" />
            </SheetTrigger>
            <SheetContent
              side="bottom"
              className="max-h-[56vh] gap-2 overflow-y-auto rounded-t-lg sm:!bottom-4 sm:!left-1/2 sm:!right-auto sm:!w-[min(540px,calc(100vw-32px))] sm:!-translate-x-1/2 sm:rounded-lg sm:border"
            >
              <SheetHeader className="px-4 pb-1 pt-3">
                <SheetTitle className="text-sm">Select routes</SheetTitle>
              </SheetHeader>
              <RoutePicker
                selected={selectedRoutes}
                customRoutes={customRoutes}
                onChange={onRoutesChange}
                onApply={(routes) => {
                  onRoutesChange(routes);
                  onLoadSimulation({ routes });
                  setRoutePickerOpen(false);
                }}
              />
            </SheetContent>
          </Sheet>

          {/* Time display */}
          <span className="text-sm font-semibold text-slate-900 tabular-nums">
            {formatSimTime(currentTime)}
          </span>

          {/* Speed + play */}
          <div className="flex items-center gap-2">
            <button
              className="text-xs font-medium text-slate-500 bg-slate-100 hover:bg-slate-200 rounded-lg px-2 py-1.5 transition-colors tabular-nums w-10 text-center"
              onClick={onCycleSpeed}
            >
              {speed}x
            </button>
            <button
              className="w-8 h-8 rounded-xl bg-[#007A33] hover:bg-[#005f28] text-white flex items-center justify-center transition-colors"
              onClick={onTogglePlay}
            >
              {playing ? (
                <Pause className="w-4 h-4" />
              ) : (
                <Play className="w-4 h-4 ml-0.5" />
              )}
            </button>
          </div>
        </div>

        {/* Scrubber */}
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-slate-400 tabular-nums w-12 text-right">
            {formatSimTime(startTime)}
          </span>
          <input
            type="range"
            min={startTime}
            max={endTime}
            step={60}
            value={currentTime}
            onChange={(e) => onScrub(Number(e.target.value))}
            className="flex-1 h-1.5 accent-[#007A33] cursor-pointer"
          />
          <span className="text-[10px] text-slate-400 tabular-nums w-12">
            {formatSimTime(endTime)}
          </span>
        </div>

        <div className="flex items-center justify-center gap-2 mt-1.5">
          <span className="text-[10px] text-slate-300">{trips.length} trips</span>
          <span className="text-[10px] text-slate-200">·</span>
          {editingDate ? (
            <input
              autoFocus
              type="date"
              defaultValue={date}
              min="2026-01-06"
              max="2026-04-24"
              onBlur={(e) => handleDateChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleDateChange((e.target as HTMLInputElement).value);
                if (e.key === "Escape") setEditingDate(false);
              }}
              className="text-[10px] rounded border border-slate-200 bg-white px-1 py-0.5 text-slate-700 focus:outline-none focus:ring-1 focus:ring-[#007A33]/40"
            />
          ) : (
            <button
              onClick={() => setEditingDate(true)}
              className="text-[10px] text-slate-400 hover:text-slate-600 underline underline-offset-2 transition-colors"
            >
              {date}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Route picker sub-component ───────────────────────────────────────────────
function RoutePicker({
  selected,
  customRoutes,
  onChange,
  onApply,
}: {
  selected: string[];
  customRoutes: CustomRoute[];
  onChange: (r: string[]) => void;
  onApply: (r: string[]) => void;
}) {
  const [local, setLocal] = useState<string[]>(selected);
  const [routes, setRoutes] = useState<EnrichedRoute[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLocal(selected);
  }, [selected]);

  useEffect(() => {
    fetch("/api/routes")
      .then((r) => r.json())
      .then((d) => {
        setRoutes(d.routes ?? []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const railRoutes = routes.filter((route) => route.is_rail && route.short_name !== "UP");
  const busRoutes = routes.filter((route) => !route.is_rail);
  const railCodes = railRoutes.map((route) => route.short_name);
  const busCodes = busRoutes.map((route) => route.short_name);
  const customCodes = customRoutes.map((route) => customRouteSelectionId(route.id));
  const allRailSelected = railCodes.length > 0 && railCodes.every((c) => local.includes(c));
  const allBusSelected = busCodes.length > 0 && busCodes.every((c) => local.includes(c));
  const allCustomSelected = customCodes.length > 0 && customCodes.every((c) => local.includes(c));

  function toggle(code: string) {
    setLocal((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]
    );
  }

  function toggleGroup(codes: string[], selectedAll: boolean) {
    setLocal((prev) =>
      selectedAll
        ? prev.filter((c) => !codes.includes(c))
        : [...new Set([...prev, ...codes])]
    );
  }

  return (
    <div className="flex flex-col gap-3 px-4 pb-4 pt-0">
      <div>
        <div className="mb-2 flex items-center justify-between">
          <p className="flex items-center gap-1.5 text-xs font-medium text-slate-700">
            <Train className="h-3.5 w-3.5" /> Train lines
          </p>
          <button
            className="text-xs text-[#007A33] font-medium"
            onClick={() => toggleGroup(railCodes, allRailSelected)}
            disabled={railCodes.length === 0}
          >
            {allRailSelected ? "Deselect all" : "Select all"}
          </button>
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          {loading ? (
            <RoutePickerSkeleton count={7} />
          ) : (
            railRoutes.map((route) => (
              <RoutePickerOption
                key={route.short_name}
                code={route.short_name}
                label={(GO_RAIL_LINES[route.short_name]?.name ?? route.long_name).replace(" Line", "")}
                color={route.color}
                selected={local.includes(route.short_name)}
                onClick={() => toggle(route.short_name)}
              />
            ))
          )}
        </div>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <p className="flex items-center gap-1.5 text-xs font-medium text-slate-700">
            <Bus className="h-3.5 w-3.5" /> Bus routes
          </p>
          <button
            className="text-xs text-[#007A33] font-medium"
            onClick={() => toggleGroup(busCodes, allBusSelected)}
            disabled={busCodes.length === 0}
          >
            {allBusSelected ? "Deselect all" : "Select all"}
          </button>
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          {loading ? (
            <RoutePickerSkeleton count={8} />
          ) : (
            busRoutes.map((route) => (
              <RoutePickerOption
                key={route.short_name}
                code={route.short_name}
                label={route.long_name || `Route ${route.short_name}`}
                color={route.color}
                selected={local.includes(route.short_name)}
                onClick={() => toggle(route.short_name)}
              />
            ))
          )}
        </div>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <p className="flex items-center gap-1.5 text-xs font-medium text-slate-700">
            <Pencil className="h-3.5 w-3.5" /> Custom routes
          </p>
          <button
            className="text-xs text-[#007A33] font-medium"
            onClick={() => toggleGroup(customCodes, allCustomSelected)}
            disabled={customCodes.length === 0}
          >
            {allCustomSelected ? "Deselect all" : "Select all"}
          </button>
        </div>
        {customRoutes.length === 0 ? (
          <p className="rounded-lg border border-dashed border-slate-200 px-3 py-3 text-xs text-slate-400">
            Saved custom routes will appear here.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-1.5">
            {customRoutes.map((route) => {
              const code = customRouteSelectionId(route.id);
              return (
                <RoutePickerOption
                  key={route.id}
                  code={route.type === "train" ? "TR" : "BU"}
                  label={route.name || "Custom route"}
                  color={route.color}
                  selected={local.includes(code)}
                  onClick={() => toggle(code)}
                />
              );
            })}
          </div>
        )}
      </div>

      <Button
        className="h-9 w-full rounded-lg bg-[#007A33] text-sm text-white hover:bg-[#005f28]"
        onClick={() => onApply(local)}
        disabled={local.length === 0}
      >
        Show {local.length} route{local.length !== 1 ? "s" : ""}
      </Button>
    </div>
  );
}

function RoutePickerOption({
  code,
  label,
  color,
  selected,
  onClick,
}: {
  code: string;
  label: string;
  color: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex min-h-10 items-center gap-2 rounded-lg border px-2 py-1.5 text-left transition-all ${
        selected
          ? "bg-slate-50 shadow-sm"
          : "border-slate-100 hover:border-slate-200"
      }`}
      style={selected ? { borderColor: color } : {}}
    >
      <div
        className="flex h-6 w-7 flex-shrink-0 items-center justify-center rounded-md text-[11px] font-bold text-white"
        style={{ backgroundColor: color }}
      >
        {code.slice(0, 3)}
      </div>
      <span className="truncate text-xs font-medium text-slate-800">
        {label}
      </span>
      {selected && <div className="ml-auto h-2 w-2 rounded-full bg-emerald-500" />}
    </button>
  );
}

function RoutePickerSkeleton({ count }: { count: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className="h-10 rounded-lg bg-slate-100" />
      ))}
    </>
  );
}
