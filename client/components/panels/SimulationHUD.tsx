"use client";

import { useEffect, useState, type ComponentType, type ReactNode } from "react";
import { Play, Pause, Loader2, Train, Bus, ChevronDown, Pencil, X, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
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
  hasEverLoaded: boolean;
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
  onClear: () => void;
}

// Preset start times shown in the time picker
const START_PRESETS = [
  { label: "12 AM", hour: 0 },
  { label: "6 AM",  hour: 6 },
  { label: "8 AM",  hour: 8 },
  { label: "12 PM", hour: 12 },
  { label: "6 PM",  hour: 18 },
  { label: "8 PM",  hour: 20 },
  { label: "10 PM", hour: 22 },
];

function hourToHHMM(hour: number): string {
  const h = Math.floor(hour) % 24;
  const m = Math.round((hour % 1) * 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function hhmmToHour(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h + (m || 0) / 60;
}

function formatEndWindow(startHour: number): { label: string; nextDay: boolean } {
  const endHour = (startHour + 12) % 24;
  const nextDay = startHour + 12 >= 24;
  const h = Math.floor(endHour);
  const ampm = h < 12 ? "AM" : "PM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return { label: `${h12}:00 ${ampm}`, nextDay };
}

function formatHudDate(iso: string): string {
  const [y, m, d] = iso.split("-").map((x) => Number(x));
  if (!y || !m || !d) return iso;
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
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
  hasEverLoaded,
  selectedRoutes,
  customRoutes,
  date,
  startHour,
  placement = "bottom-center",
  onTogglePlay,
  onScrub,
  onCycleSpeed,
  onLoadSimulation,
  onRoutesChange,
  onDateChange,
  onStartHourChange,
  onClear,
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
    onLoadSimulation({ date: newDate, startHour });
    setEditingDate(false);
  }

  // ── Onboarding / empty state ──────────────────────────────────────────────
  // Distinguish "never started" from "started but no service on this date"
  const hasLoadedOnce = hasEverLoaded;

  if (!hasTrips && !loading) {
    const noServiceOnDate = hasLoadedOnce && !error;

    return (
      <div className={`${baseShellClass} w-[min(480px,calc(100vw-32px))] ${placement === "bottom-right" ? "w-auto sm:w-[min(480px,calc(100vw-32px))]" : ""}`}>
        <div className="rounded-xl border border-slate-200/90 bg-white/95 p-4 shadow-lg shadow-slate-900/6 backdrop-blur-xl">
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

          {/* Start time selector */}
          <div className="mb-3">
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs text-slate-500 font-medium">Start time</label>
              {(() => {
                const { label, nextDay } = formatEndWindow(startHour);
                return (
                  <span className="text-[10px] text-slate-400">
                    ends {label}{nextDay && <span className="ml-1 rounded bg-amber-100 px-1 py-0.5 text-[9px] font-semibold text-amber-700">+1 day</span>}
                  </span>
                );
              })()}
            </div>
            {/* Preset chips */}
            <div className="flex flex-wrap gap-1 mb-1.5">
              {START_PRESETS.map((p) => (
                <button
                  key={p.hour}
                  onClick={() => onStartHourChange(p.hour)}
                  className={`rounded-md px-2 py-1 text-[11px] font-medium transition-colors ${
                    startHour === p.hour
                      ? "bg-[#007A33] text-white"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
            {/* Custom time input */}
            <input
              type="time"
              value={hourToHHMM(startHour)}
              onChange={(e) => onStartHourChange(hhmmToHour(e.target.value))}
              className="w-full text-xs rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#007A33]/30"
            />
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
              <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
            </SheetTrigger>
            <SheetContent
              side="bottom"
              className="flex max-h-[min(72vh,640px)] flex-col gap-0 overflow-hidden rounded-t-2xl border-t border-slate-200/90 bg-white/98 p-0 shadow-2xl supports-backdrop-filter:backdrop-blur-md sm:!bottom-4 sm:!left-1/2 sm:!right-auto sm:!w-[min(480px,calc(100vw-20px))] sm:!-translate-x-1/2 sm:rounded-xl sm:border sm:border-slate-200/80"
            >
              <SheetHeader className="shrink-0 border-b border-slate-100 px-4 pb-3 pt-3 text-left">
                <SheetTitle className="text-base font-semibold tracking-tight text-slate-900">
                  Simulation routes
                </SheetTitle>
                <SheetDescription className="text-xs leading-relaxed text-slate-500">
                  Pick train and bus lines, then apply to update the map.
                </SheetDescription>
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
            onClick={() => onLoadSimulation({ startHour })}
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
        <div className="flex items-center gap-2.5 rounded-xl border border-slate-200/90 bg-white/95 px-4 py-2.5 shadow-md shadow-slate-900/5 backdrop-blur-xl">
          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-emerald-600" />
          <span className="text-xs font-medium text-slate-600">Loading trips…</span>
        </div>
      </div>
    );
  }

  // ── Active playback HUD ───────────────────────────────────────────────────
  return (
    <div className={`${baseShellClass} w-[min(500px,calc(100vw-24px))] ${placement === "bottom-right" ? `w-auto ${cardWidthClass}` : ""}`}>
      <div className="rounded-xl border border-slate-200/90 bg-white/95 px-3 py-2 shadow-lg shadow-slate-900/8 ring-1 ring-slate-900/[0.04] backdrop-blur-xl">
        {/* Row 1: routes · clock · controls */}
        <div className="flex items-center gap-2">
          <Sheet open={routePickerOpen} onOpenChange={setRoutePickerOpen}>
            <SheetTrigger className="inline-flex max-w-[40%] shrink-0 items-center gap-1 rounded-lg border border-slate-200/90 bg-slate-50/90 py-1 pl-2 pr-1.5 text-[11px] font-semibold text-slate-700 shadow-sm transition-colors hover:border-slate-300 hover:bg-slate-100 sm:max-w-[46%]">
              {selectedHasBus ? <Bus className="h-3.5 w-3.5 text-slate-500" /> : <Train className="h-3.5 w-3.5 text-slate-500" />}
              <span className="truncate">{selectedRoutes.length} routes</span>
              <ChevronDown className="h-3 w-3 shrink-0 text-slate-400" />
            </SheetTrigger>
            <SheetContent
              side="bottom"
              className="flex max-h-[min(72vh,640px)] flex-col gap-0 overflow-hidden rounded-t-2xl border-t border-slate-200/90 bg-white/98 p-0 shadow-2xl supports-backdrop-filter:backdrop-blur-md sm:!bottom-4 sm:!left-1/2 sm:!right-auto sm:!w-[min(480px,calc(100vw-20px))] sm:!-translate-x-1/2 sm:rounded-xl sm:border sm:border-slate-200/80"
            >
              <SheetHeader className="shrink-0 border-b border-slate-100 px-4 pb-3 pt-3 text-left">
                <SheetTitle className="text-base font-semibold tracking-tight text-slate-900">
                  Simulation routes
                </SheetTitle>
                <SheetDescription className="text-xs leading-relaxed text-slate-500">
                  Pick lines to show on the map. Apply reloads trips for your selection.
                </SheetDescription>
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

          <div className="min-w-0 flex-1 text-center">
            <p className="font-mono text-xl font-bold leading-none tracking-tight text-slate-900 tabular-nums">
              {formatSimTime(currentTime)}
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              className="rounded-full border border-slate-200/90 bg-white px-2 py-1 text-[10px] font-bold tabular-nums text-slate-600 shadow-sm transition-colors hover:border-slate-300 hover:bg-slate-50"
              onClick={onCycleSpeed}
              title="Playback speed"
            >
              {speed}×
            </button>
            <button
              type="button"
              className="flex h-9 w-9 items-center justify-center rounded-full bg-[#007A33] text-white shadow-md shadow-emerald-900/25 transition-transform hover:bg-[#006b2d] active:scale-95"
              onClick={onTogglePlay}
              title={playing ? "Pause" : "Play"}
            >
              {playing ? <Pause className="h-4 w-4" /> : <Play className="ml-0.5 h-4 w-4" />}
            </button>
            <button
              type="button"
              className="flex h-8 w-8 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-red-50 hover:text-red-500"
              onClick={onClear}
              title="Clear simulation"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Row 2: scrubber + meta */}
        <div className="mt-1.5 border-t border-slate-100 pt-1.5">
          <div className="flex items-center gap-2">
            <span className="w-10 shrink-0 text-right text-[10px] font-semibold tabular-nums text-slate-400">
              {formatSimTime(startTime)}
            </span>
            <input
              type="range"
              min={startTime}
              max={endTime}
              step={60}
              value={currentTime}
              onChange={(e) => onScrub(Number(e.target.value))}
              className="sim-hud-slider flex-1"
              aria-label="Simulation time"
            />
            <span className="flex w-12 shrink-0 items-center justify-end gap-0.5 text-[10px] font-semibold tabular-nums text-slate-400">
              {formatSimTime(endTime)}
              {endTime > 86400 && (
                <span className="rounded bg-amber-100 px-0.5 text-[8px] font-bold text-amber-800">+1</span>
              )}
            </span>
          </div>

          <div className="mt-1 flex items-center justify-center gap-2 text-[11px] text-slate-500">
            <span>
              <span className="font-semibold text-slate-700 tabular-nums">{trips.length.toLocaleString()}</span>{" "}
              trips
            </span>
            <span className="text-slate-300">·</span>
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
                className="rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-[11px] text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#007A33]/25"
              />
            ) : (
              <button
                type="button"
                onClick={() => setEditingDate(true)}
                className="rounded-md px-1 py-0.5 font-medium text-slate-600 underline decoration-slate-300 underline-offset-2 transition-colors hover:bg-slate-100 hover:text-slate-900 hover:decoration-slate-400"
              >
                {formatHudDate(date)}
              </button>
            )}
          </div>
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
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 pb-2 pt-2">
        {loading ? (
          <RoutePickerSkeleton />
        ) : (
          <>
            <PickerSection
              title="Train lines"
              icon={Train}
              actionLabel={allRailSelected ? "Clear" : "All"}
              onAction={() => toggleGroup(railCodes, allRailSelected)}
              disabled={railCodes.length === 0}
            >
              <div className="divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200/80 bg-white">
                {railRoutes.map((route) => (
                  <RoutePickerRow
                    key={route.short_name}
                    code={route.short_name}
                    label={(GO_RAIL_LINES[route.short_name]?.name ?? route.long_name).replace(" Line", "")}
                    color={route.color}
                    selected={local.includes(route.short_name)}
                    onClick={() => toggle(route.short_name)}
                  />
                ))}
              </div>
            </PickerSection>

            <PickerSection
              title="Bus routes"
              icon={Bus}
              actionLabel={allBusSelected ? "Clear" : "All"}
              onAction={() => toggleGroup(busCodes, allBusSelected)}
              disabled={busCodes.length === 0}
            >
              <div className="max-h-[min(40vh,320px)] divide-y divide-slate-100 overflow-y-auto overscroll-contain rounded-lg border border-slate-200/80 bg-white shadow-[inset_0_1px_0_rgb(255_255_255/0.6)]">
                {busRoutes.map((route) => (
                  <RoutePickerRow
                    key={route.short_name}
                    code={route.short_name}
                    label={route.long_name || `Route ${route.short_name}`}
                    color={route.color}
                    selected={local.includes(route.short_name)}
                    onClick={() => toggle(route.short_name)}
                  />
                ))}
              </div>
            </PickerSection>

            <PickerSection
              title="Custom routes"
              icon={Pencil}
              actionLabel={allCustomSelected ? "Clear" : "All"}
              onAction={() => toggleGroup(customCodes, allCustomSelected)}
              disabled={customCodes.length === 0}
            >
              {customRoutes.length === 0 ? (
                <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50/60 px-3 py-2.5 text-center text-[11px] text-slate-400">
                  Saved custom routes appear here.
                </p>
              ) : (
                <div className="divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200/80 bg-white">
                  {customRoutes.map((route) => {
                    const code = customRouteSelectionId(route.id);
                    return (
                      <RoutePickerRow
                        key={route.id}
                        code={route.type === "train" ? "TR" : "CU"}
                        label={route.name || "Custom route"}
                        color={route.color}
                        selected={local.includes(code)}
                        onClick={() => toggle(code)}
                      />
                    );
                  })}
                </div>
              )}
            </PickerSection>
          </>
        )}
      </div>

      <div className="shrink-0 border-t border-slate-100 bg-slate-50/95 px-3 py-2.5">
        <Button
          className="h-9 w-full rounded-lg bg-[#007A33] text-sm font-semibold text-white shadow-sm hover:bg-[#005f28]"
          onClick={() => onApply(local)}
          disabled={local.length === 0}
        >
          Apply · {local.length} route{local.length !== 1 ? "s" : ""}
        </Button>
      </div>
    </div>
  );
}

function PickerSection({
  title,
  icon: Icon,
  actionLabel,
  onAction,
  disabled,
  children,
}: {
  title: string;
  icon: ComponentType<{ className?: string }>;
  actionLabel: string;
  onAction: () => void;
  disabled: boolean;
  children: ReactNode;
}) {
  return (
    <section>
      <div className="mb-1 flex items-center justify-between gap-2">
        <h3 className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
          <Icon className="h-3 w-3 text-slate-400" aria-hidden />
          {title}
        </h3>
        <button
          type="button"
          className="rounded-md px-1.5 py-0.5 text-[11px] font-semibold text-[#006b2d] transition-colors hover:bg-emerald-50 hover:underline disabled:pointer-events-none disabled:opacity-35"
          onClick={onAction}
          disabled={disabled}
        >
          {actionLabel}
        </button>
      </div>
      {children}
    </section>
  );
}

function RoutePickerRow({
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
  const badgeText = code.length <= 4 ? code : code.slice(0, 3);
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2 px-2.5 py-1.5 text-left transition-colors outline-none",
        "focus-visible:bg-slate-50 focus-visible:ring-2 focus-visible:ring-emerald-500/25 focus-visible:ring-inset",
        selected ? "bg-emerald-50/80" : "hover:bg-slate-50/90 active:bg-slate-100/80",
      )}
    >
      <span
        className="flex h-5 min-w-[1.5rem] max-w-[2.75rem] shrink-0 items-center justify-center rounded px-0.5 text-[10px] font-bold leading-none text-white tabular-nums shadow-sm"
        style={{ backgroundColor: color }}
      >
        <span className="truncate">{badgeText}</span>
      </span>
      <span className="min-w-0 flex-1 truncate text-[11px] font-medium leading-snug text-slate-800">
        {label}
      </span>
      <span
        className={cn(
          "flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors",
          selected
            ? "border-emerald-600 bg-emerald-600 text-white"
            : "border-slate-200 bg-white",
        )}
        aria-hidden
      >
        {selected ? <Check className="h-2.5 w-2.5" strokeWidth={3} /> : null}
      </span>
    </button>
  );
}

function RoutePickerSkeleton() {
  return (
    <div className="space-y-3">
      {[0, 1].map((block) => (
        <div key={block} className="overflow-hidden rounded-lg border border-slate-100">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="h-9 animate-pulse border-b border-slate-50 bg-gradient-to-r from-slate-50 to-slate-100/80 last:border-b-0"
            />
          ))}
        </div>
      ))}
    </div>
  );
}
