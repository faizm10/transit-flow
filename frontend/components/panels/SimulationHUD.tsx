"use client";

import { useState } from "react";
import { Play, Pause, Loader2, Train, Bus, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { formatSimTime } from "@/lib/simulation";
import { GO_RAIL_LINES } from "@/lib/routeColors";

const RAIL_CODES = Object.keys(GO_RAIL_LINES).filter((k) => k !== "UP");

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
  date: string;
  onTogglePlay: () => void;
  onScrub: (t: number) => void;
  onCycleSpeed: () => void;
  onLoadSimulation: (params?: { routes?: string[]; date?: string }) => void;
  onRoutesChange: (routes: string[]) => void;
  onDateChange: (date: string) => void;
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
  date,
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

  function handleDateChange(newDate: string) {
    onDateChange(newDate);
    onLoadSimulation({ date: newDate });
    setEditingDate(false);
  }

  const scrubProgress = endTime > startTime
    ? (currentTime - startTime) / (endTime - startTime)
    : 0;

  // ── Onboarding state ──────────────────────────────────────────────────────
  if (!hasTrips && !loading) {
    return (
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-30 w-[min(480px,calc(100vw-32px))]">
        <div className="bg-white/95 backdrop-blur-xl rounded-2xl border border-slate-200 shadow-xl p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center">
              <Train className="w-5 h-5 text-emerald-700" />
            </div>
            <div>
              <p className="font-semibold text-slate-900 text-sm">Watch GO trains in real time</p>
              <p className="text-xs text-slate-400">Morning rush · {RAIL_CODES.length} rail lines</p>
            </div>
          </div>

          {/* Date selector */}
          <div className="flex items-center gap-2 mb-3">
            <label className="text-xs text-slate-500 font-medium whitespace-nowrap">Date</label>
            <input
              type="date"
              value={date}
              onChange={(e) => onDateChange(e.target.value)}
              className="flex-1 text-xs rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#007A33]/30"
            />
          </div>

          {error && (
            <p className="text-xs text-red-500 mb-3 bg-red-50 rounded-lg px-3 py-2">{error}</p>
          )}

          <Button
            className="w-full rounded-xl bg-[#007A33] hover:bg-[#005f28] text-white h-10"
            onClick={() => onLoadSimulation()}
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
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-30">
        <div className="bg-white/95 backdrop-blur-xl rounded-2xl border border-slate-200 shadow-xl px-6 py-3.5 flex items-center gap-3">
          <Loader2 className="w-4 h-4 text-emerald-600 animate-spin" />
          <span className="text-sm font-medium text-slate-700">Loading trips…</span>
        </div>
      </div>
    );
  }

  // ── Active playback HUD ───────────────────────────────────────────────────
  return (
    <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-30 w-[min(560px,calc(100vw-32px))]">
      <div className="bg-white/95 backdrop-blur-xl rounded-2xl border border-slate-200 shadow-xl px-4 py-3">
        {/* Top row: routes chip + time + speed */}
        <div className="flex items-center justify-between mb-2.5">
          {/* Route picker */}
          <Sheet open={routePickerOpen} onOpenChange={setRoutePickerOpen}>
            <SheetTrigger className="flex items-center gap-1.5 text-xs font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg px-2.5 py-1.5 transition-colors">
              <Train className="w-3.5 h-3.5" />
              {selectedRoutes.length} routes
              <ChevronUp className="w-3 h-3" />
            </SheetTrigger>
            <SheetContent side="bottom" className="rounded-t-2xl max-h-[70vh]">
              <SheetHeader className="pb-2">
                <SheetTitle className="text-base">Select routes</SheetTitle>
              </SheetHeader>
              <RoutePicker
                selected={selectedRoutes}
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
  onChange,
  onApply,
}: {
  selected: string[];
  onChange: (r: string[]) => void;
  onApply: (r: string[]) => void;
}) {
  const [local, setLocal] = useState<string[]>(selected);

  const allRailSelected = RAIL_CODES.every((c) => local.includes(c));

  function toggle(code: string) {
    setLocal((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]
    );
  }

  function toggleAllRail() {
    setLocal((prev) =>
      allRailSelected ? prev.filter((c) => !RAIL_CODES.includes(c)) : [...new Set([...prev, ...RAIL_CODES])]
    );
  }

  return (
    <div className="flex flex-col gap-4 pt-1 pb-6">
      {/* Train lines */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-sm font-medium text-slate-700 flex items-center gap-1.5">
            <Train className="w-4 h-4" /> Train lines
          </p>
          <button
            className="text-xs text-[#007A33] font-medium"
            onClick={toggleAllRail}
          >
            {allRailSelected ? "Deselect all" : "Select all"}
          </button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {RAIL_CODES.map((code) => {
            const info = GO_RAIL_LINES[code];
            const on = local.includes(code);
            return (
              <button
                key={code}
                onClick={() => toggle(code)}
                className={`flex items-center gap-2 rounded-xl border p-2.5 text-left transition-all ${
                  on
                    ? "border-transparent ring-2 ring-offset-1"
                    : "border-slate-100 hover:border-slate-200"
                }`}
                style={on ? { outlineColor: info.color } : {}}
              >
                <div
                  className="w-7 h-7 rounded-lg flex-shrink-0 flex items-center justify-center text-white text-xs font-bold"
                  style={{ backgroundColor: info.color }}
                >
                  {code}
                </div>
                <span className="text-xs font-medium text-slate-800 truncate">
                  {info.name.replace(" Line", "")}
                </span>
                {on && <div className="ml-auto w-2 h-2 rounded-full bg-emerald-500" />}
              </button>
            );
          })}
        </div>
      </div>

      <Button
        className="w-full rounded-xl bg-[#007A33] hover:bg-[#005f28] text-white"
        onClick={() => onApply(local)}
        disabled={local.length === 0}
      >
        Show {local.length} route{local.length !== 1 ? "s" : ""}
      </Button>
    </div>
  );
}
