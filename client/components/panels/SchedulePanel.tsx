"use client";

import { useState, useCallback, useRef } from "react";
import {
  Train, Bus, ArrowLeft, Plus, X, Clock, ChevronRight,
  Copy, Check, Calendar, Zap, AlertCircle, Pencil, Eye,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  CustomRoute, CustomSchedule, ServiceBand, DaySchedule,
  migrateLegacySchedule, defaultBandedSchedule,
} from "@/lib/gtfs";
import { v4 as uuidv4 } from "uuid";

// ─── Types ─────────────────────────────────────────────────────────────────

type DayKey = "weekday" | "saturday" | "sunday";

// ─── Band role colours ──────────────────────────────────────────────────────

function bandRoleColor(startHour: number): {
  bg: string; text: string; dot: string; barFill: string; pill: string;
} {
  if (startHour >= 5  && startHour < 9)  return { bg: "bg-amber-50",   text: "text-amber-700",   dot: "bg-amber-400",   barFill: "#f59e0b", pill: "bg-amber-100 text-amber-700" };
  if (startHour >= 9  && startHour < 15) return { bg: "bg-sky-50",     text: "text-sky-700",     dot: "bg-sky-400",     barFill: "#38bdf8", pill: "bg-sky-100 text-sky-700" };
  if (startHour >= 15 && startHour < 19) return { bg: "bg-emerald-50", text: "text-emerald-700", dot: "bg-emerald-400", barFill: "#34d399", pill: "bg-emerald-100 text-emerald-700" };
  if (startHour >= 19 && startHour < 23) return { bg: "bg-indigo-50",  text: "text-indigo-700",  dot: "bg-indigo-400",  barFill: "#818cf8", pill: "bg-indigo-100 text-indigo-700" };
  return { bg: "bg-slate-50", text: "text-slate-600", dot: "bg-slate-400", barFill: "#94a3b8", pill: "bg-slate-100 text-slate-600" };
}

// ─── Templates ─────────────────────────────────────────────────────────────

const TEMPLATES: Record<string, { label: string; desc: string; bands: Omit<ServiceBand, "id">[] }> = {
  go_rail: {
    label: "GO Rail",
    desc: "Peak-heavy, hourly off-peak",
    bands: [
      { label: "Early morning", startHour: 5, startMin: 30, endHour: 6, endMin: 30, headwayMins: 60 },
      { label: "Morning peak",  startHour: 6, startMin: 30, endHour: 9, endMin: 30, headwayMins: 15 },
      { label: "Midday",        startHour: 9, startMin: 30, endHour: 15, endMin: 30, headwayMins: 60 },
      { label: "Afternoon peak",startHour: 15, startMin: 30, endHour: 18, endMin: 30, headwayMins: 15 },
      { label: "Evening",       startHour: 18, startMin: 30, endHour: 22, endMin: 30, headwayMins: 60 },
    ],
  },
  ttc_bus: {
    label: "TTC Bus",
    desc: "Frequent all-day service",
    bands: [
      { label: "Early morning", startHour: 5, startMin: 0, endHour: 6,  endMin: 30, headwayMins: 20 },
      { label: "Morning peak",  startHour: 6, startMin: 30, endHour: 9, endMin: 0,  headwayMins: 8  },
      { label: "Midday",        startHour: 9, startMin: 0, endHour: 15, endMin: 0,  headwayMins: 12 },
      { label: "Afternoon peak",startHour: 15, startMin: 0, endHour: 18, endMin: 30, headwayMins: 8  },
      { label: "Evening",       startHour: 18, startMin: 30, endHour: 23, endMin: 59, headwayMins: 15 },
    ],
  },
  express: {
    label: "Express",
    desc: "Rush-hour only",
    bands: [
      { label: "Morning peak",   startHour: 7, startMin: 0,  endHour: 9,  endMin: 0,  headwayMins: 20 },
      { label: "Afternoon peak", startHour: 16, startMin: 0, endHour: 18, endMin: 30, headwayMins: 20 },
    ],
  },
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function fmtHM(h: number, m: number): string {
  const ampm = h < 12 ? "AM" : "PM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
}

function fmtBandTime(b: ServiceBand): string {
  return `${fmtHM(b.startHour, b.startMin)} – ${fmtHM(b.endHour, b.endMin)}`;
}

function bandTotalMinutes(b: ServiceBand): number {
  return (b.endHour * 60 + b.endMin) - (b.startHour * 60 + b.startMin);
}

function tripsPerDay(bands: ServiceBand[]): number {
  return bands.reduce((sum, b) => {
    const mins = bandTotalMinutes(b);
    return sum + (mins > 0 && b.headwayMins > 0 ? Math.floor(mins / b.headwayMins) : 0);
  }, 0);
}

// ─── Mini band pill row (used in route list) ────────────────────────────────

function BandPillRow({ bands }: { bands: ServiceBand[] }) {
  if (bands.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1 mt-2">
      {bands.map((b) => {
        const { pill, dot } = bandRoleColor(b.startHour);
        const trips = bandTotalMinutes(b) > 0 && b.headwayMins > 0
          ? Math.floor(bandTotalMinutes(b) / b.headwayMins)
          : 0;
        return (
          <span
            key={b.id}
            className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-medium ${pill}`}
          >
            <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${dot}`} />
            <span>{b.label}</span>
            <span className="opacity-60">·</span>
            <span>{fmtHM(b.startHour, b.startMin)}–{fmtHM(b.endHour, b.endMin)}</span>
            <span className="opacity-60">·</span>
            <span>every {b.headwayMins}m</span>
            {trips > 0 && (
              <><span className="opacity-40 mx-0.5">·</span><span className="font-semibold">{trips} trips</span></>
            )}
          </span>
        );
      })}
    </div>
  );
}

// ─── 24-hour Timeline bar ───────────────────────────────────────────────────

function TimelineBar({ bands, color }: { bands: ServiceBand[]; color: string }) {
  const TOTAL = 24 * 60;
  return (
    <div className="relative w-full">
      <div className="h-5 w-full bg-slate-100 rounded-lg overflow-hidden flex">
        {bands.map((b) => {
          const startPct = ((b.startHour * 60 + b.startMin) / TOTAL) * 100;
          const widthPct = (bandTotalMinutes(b) / TOTAL) * 100;
          const opacity = Math.max(0.35, Math.min(1, 1 - (b.headwayMins - 5) / 60));
          const { barFill } = bandRoleColor(b.startHour);
          return (
            <div
              key={b.id}
              className="absolute top-0 h-full rounded-sm"
              style={{
                left: `${startPct}%`,
                width: `${widthPct}%`,
                backgroundColor: barFill,
                opacity,
              }}
            />
          );
        })}
      </div>
      <div className="flex justify-between mt-1 px-0.5">
        {[0, 3, 6, 9, 12, 15, 18, 21].map((h) => (
          <span key={h} className="text-[9px] text-slate-400 tabular-nums" style={{ width: "12.5%" }}>
            {h === 0 ? "12a" : h < 12 ? `${h}a` : h === 12 ? "12p" : `${h - 12}p`}
          </span>
        ))}
      </div>
    </div>
  );
}

// ─── Fixed departures editor ────────────────────────────────────────────────

function FixedDeparturesEditor({
  departures,
  onChange,
}: {
  departures: string[];
  onChange: (d: string[]) => void;
}) {
  const [newTime, setNewTime] = useState("");

  function addDeparture() {
    if (!newTime || departures.includes(newTime)) return;
    onChange([...departures, newTime].sort());
    setNewTime("");
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2">
        <input
          type="time"
          value={newTime}
          onChange={(e) => setNewTime(e.target.value)}
          className="flex-1 text-sm rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#007A33]/30 focus:border-[#007A33]"
        />
        <Button
          size="sm"
          className="rounded-xl bg-[#007A33] hover:bg-[#005f28] text-white px-4"
          onClick={addDeparture}
          disabled={!newTime}
        >
          <Plus className="w-3.5 h-3.5" />
        </Button>
      </div>

      {departures.length === 0 ? (
        <div className="flex flex-col items-center py-6 text-slate-400">
          <Clock className="w-7 h-7 mb-2 opacity-40" />
          <p className="text-sm font-medium">No departures added</p>
          <p className="text-xs mt-0.5">Add times using the picker above</p>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap gap-1.5">
            {departures.map((t) => (
              <span
                key={t}
                className="inline-flex items-center gap-1 bg-slate-100 text-slate-700 text-xs font-medium rounded-lg px-2.5 py-1.5"
              >
                {t}
                <button
                  onClick={() => onChange(departures.filter((d) => d !== t))}
                  className="text-slate-400 hover:text-red-500 transition-colors ml-0.5"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>

          <div className="relative h-6 w-full mt-1">
            <div className="absolute top-1/2 left-0 right-0 h-px bg-slate-200" />
            {departures.map((t) => {
              const [h, m] = t.split(":").map(Number);
              const pct = ((h * 60 + m) / (24 * 60)) * 100;
              return (
                <div
                  key={t}
                  className="absolute top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-[#007A33]"
                  style={{ left: `${pct}%` }}
                  title={t}
                />
              );
            })}
          </div>
          <p className="text-[10px] text-slate-400 -mt-1 text-center">
            {departures.length} departure{departures.length !== 1 ? "s" : ""}
            {" "}· first {departures[0]}, last {departures[departures.length - 1]}
          </p>
        </>
      )}
    </div>
  );
}

// ─── Single band editor card ────────────────────────────────────────────────

function BandCard({
  band,
  color,
  onChange,
  onDelete,
}: {
  band: ServiceBand;
  color: string;
  onChange: (b: ServiceBand) => void;
  onDelete: () => void;
}) {
  const { bg, text, dot } = bandRoleColor(band.startHour);

  function setField<K extends keyof ServiceBand>(key: K, value: ServiceBand[K]) {
    onChange({ ...band, [key]: value });
  }

  function adjustHeadway(delta: number) {
    const next = Math.max(1, Math.min(120, band.headwayMins + delta));
    onChange({ ...band, headwayMins: next });
  }

  return (
    <div className="rounded-2xl border border-slate-100 overflow-hidden">
      <div className="h-1 w-full" style={{ backgroundColor: color }} />
      <div className={`${bg} px-3.5 py-3`}>
        {/* Row 1: dot + editable label + delete */}
        <div className="flex items-center gap-2 mb-2.5">
          <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${dot}`} />
          <input
            value={band.label}
            onChange={(e) => setField("label", e.target.value)}
            className={`flex-1 text-sm font-semibold ${text} bg-transparent border-none outline-none focus:underline underline-offset-2 min-w-0`}
          />
          <button
            onClick={onDelete}
            className="text-slate-300 hover:text-red-400 transition-colors flex-shrink-0"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Row 2: time range */}
        <div className="flex items-center gap-2 mb-2.5">
          <Clock className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
          <div className="flex items-center gap-1.5 flex-1">
            <input
              type="time"
              value={`${String(band.startHour).padStart(2, "0")}:${String(band.startMin).padStart(2, "0")}`}
              onChange={(e) => {
                const [h, m] = e.target.value.split(":").map(Number);
                onChange({ ...band, startHour: h ?? 0, startMin: m ?? 0 });
              }}
              className="text-xs text-slate-700 bg-white border border-slate-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-[#007A33]/20 w-24"
            />
            <span className="text-xs text-slate-400">→</span>
            <input
              type="time"
              value={`${String(band.endHour).padStart(2, "0")}:${String(band.endMin).padStart(2, "0")}`}
              onChange={(e) => {
                const [h, m] = e.target.value.split(":").map(Number);
                onChange({ ...band, endHour: h ?? 0, endMin: m ?? 0 });
              }}
              className="text-xs text-slate-700 bg-white border border-slate-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-[#007A33]/20 w-24"
            />
          </div>
        </div>

        {/* Row 3: headway stepper */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500 flex-shrink-0">Every</span>
          <div className="flex items-center gap-2 bg-white rounded-xl border border-slate-200 px-1 py-0.5">
            <button
              onClick={() => adjustHeadway(-1)}
              className="w-6 h-6 rounded-lg flex items-center justify-center text-slate-500 hover:bg-slate-100 transition-colors text-sm font-bold"
            >
              −
            </button>
            <span className={`text-base font-bold tabular-nums ${text} w-8 text-center`}>
              {band.headwayMins}
            </span>
            <button
              onClick={() => adjustHeadway(1)}
              className="w-6 h-6 rounded-lg flex items-center justify-center text-slate-500 hover:bg-slate-100 transition-colors text-sm font-bold"
            >
              +
            </button>
          </div>
          <span className="text-xs text-slate-500">min</span>
          <span className="ml-auto text-[10px] text-slate-400 tabular-nums">
            {bandTotalMinutes(band) > 0 && band.headwayMins > 0
              ? `~${Math.floor(bandTotalMinutes(band) / band.headwayMins)} trips`
              : ""}
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── Day schedule editor ────────────────────────────────────────────────────

function DayScheduleEditor({
  dayKey,
  daySchedule,
  routeColor,
  onChange,
}: {
  dayKey: DayKey;
  daySchedule: DaySchedule;
  routeColor: string;
  onChange: (d: DaySchedule) => void;
}) {
  function updateBand(id: string, updated: ServiceBand) {
    onChange({
      ...daySchedule,
      bands: daySchedule.bands.map((b) => (b.id === id ? updated : b)),
    });
  }

  function deleteBand(id: string) {
    onChange({ ...daySchedule, bands: daySchedule.bands.filter((b) => b.id !== id) });
  }

  function addBand() {
    const newBand: ServiceBand = {
      id: uuidv4(),
      label: "New window",
      startHour: 8,
      startMin: 0,
      endHour: 12,
      endMin: 0,
      headwayMins: 20,
    };
    onChange({ ...daySchedule, bands: [...daySchedule.bands, newBand] });
  }

  function applyTemplate(key: string) {
    const tpl = TEMPLATES[key];
    if (!tpl) return;
    onChange({
      active: true,
      bands: tpl.bands.map((b) => ({ ...b, id: uuidv4() })),
    });
  }

  if (!daySchedule.active) {
    return (
      <div className="flex flex-col items-center py-10 gap-3">
        <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center">
          <Calendar className="w-6 h-6 text-slate-300" />
        </div>
        <div className="text-center">
          <p className="text-sm font-medium text-slate-500">No service</p>
          <p className="text-xs text-slate-400 mt-0.5">Activate to add service windows</p>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="rounded-xl mt-1"
          onClick={() => onChange({ ...daySchedule, active: true, bands: [] })}
        >
          <Plus className="w-3.5 h-3.5 mr-1.5" />
          Activate service
        </Button>
      </div>
    );
  }

  const totalTrips = tripsPerDay(daySchedule.bands);

  return (
    <div className="flex flex-col gap-3">
      {daySchedule.bands.length > 0 && (
        <TimelineBar bands={daySchedule.bands} color={routeColor} />
      )}

      {daySchedule.bands.length > 0 && (
        <p className="text-xs text-slate-400 text-center -mt-1">
          <span className="font-semibold text-slate-600">{totalTrips}</span> trips per day
        </p>
      )}

      {daySchedule.bands.length === 0 ? (
        <div className="flex flex-col items-center py-6 gap-2 text-slate-400">
          <Clock className="w-7 h-7 opacity-40" />
          <p className="text-sm font-medium">No service windows yet</p>
          <p className="text-xs">Add one below or use a template</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {daySchedule.bands.map((band) => (
            <BandCard
              key={band.id}
              band={band}
              color={routeColor}
              onChange={(b) => updateBand(b.id, b)}
              onDelete={() => deleteBand(band.id)}
            />
          ))}
        </div>
      )}

      <button
        onClick={addBand}
        className="flex items-center gap-2 text-sm text-[#007A33] font-medium py-2.5 px-3 rounded-xl border border-dashed border-emerald-200 hover:bg-emerald-50 transition-colors"
      >
        <Plus className="w-4 h-4" />
        Add time window
      </button>

      <div>
        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1.5">
          Quick templates
        </p>
        <div className="flex gap-1.5 flex-wrap">
          {Object.entries(TEMPLATES).map(([key, tpl]) => (
            <button
              key={key}
              onClick={() => applyTemplate(key)}
              title={tpl.desc}
              className="flex items-center gap-1.5 text-xs font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg px-2.5 py-1.5 transition-colors"
            >
              <Zap className="w-3 h-3 text-amber-500" />
              {tpl.label}
            </button>
          ))}
        </div>
      </div>

      <button
        onClick={() => onChange({ ...daySchedule, active: false })}
        className="text-xs text-slate-400 hover:text-slate-600 transition-colors text-center"
      >
        Mark as no service this day
      </button>
    </div>
  );
}

// ─── Schedule summary card (read-only preview) ──────────────────────────────

function ScheduleSummaryCard({
  schedule,
  routeColor,
  onEdit,
}: {
  schedule: CustomSchedule;
  routeColor: string;
  onEdit: () => void;
}) {
  const s = migrateLegacySchedule(schedule);

  if (s.type === "fixed") {
    const deps = s.fixedDepartures ?? [];
    return (
      <div className="flex flex-col gap-3">
        <div className="rounded-2xl bg-slate-50 border border-slate-100 px-4 py-3">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Fixed departures</p>
            <span className="text-xs font-semibold text-slate-700">{deps.length} times</span>
          </div>
          {deps.length > 0 ? (
            <>
              <div className="relative h-5 w-full my-2">
                <div className="absolute top-1/2 left-0 right-0 h-px bg-slate-200" />
                {deps.map((t) => {
                  const [h, m] = t.split(":").map(Number);
                  const pct = ((h * 60 + m) / (24 * 60)) * 100;
                  return (
                    <div
                      key={t}
                      className="absolute top-1/2 -translate-y-1/2 w-2 h-2 rounded-full border-2 border-white"
                      style={{ left: `${pct}%`, backgroundColor: routeColor }}
                      title={t}
                    />
                  );
                })}
              </div>
              <p className="text-[10px] text-slate-400 mt-1">
                First: {deps[0]} · Last: {deps[deps.length - 1]}
              </p>
            </>
          ) : (
            <p className="text-xs text-slate-400">No departures set</p>
          )}
        </div>
        <Button
          className="w-full rounded-xl bg-[#007A33] hover:bg-[#005f28] text-white h-10"
          onClick={onEdit}
        >
          <Pencil className="w-3.5 h-3.5 mr-2" />
          Edit schedule
        </Button>
      </div>
    );
  }

  // banded
  const days: { key: DayKey; label: string }[] = [
    { key: "weekday", label: "Weekdays" },
    { key: "saturday", label: "Saturday" },
    { key: "sunday", label: "Sunday" },
  ];

  return (
    <div className="flex flex-col gap-3">
      {days.map(({ key, label }) => {
        const ds = s[key];
        if (!ds?.active) {
          return (
            <div key={key} className="rounded-2xl bg-slate-50 border border-slate-100 px-4 py-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-slate-500">{label}</p>
                <span className="text-[10px] text-slate-400 bg-slate-200 rounded-md px-2 py-0.5">No service</span>
              </div>
            </div>
          );
        }
        const trips = tripsPerDay(ds.bands);
        return (
          <div key={key} className="rounded-2xl bg-slate-50 border border-slate-100 px-4 py-3">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{label}</p>
              <span className="text-xs font-semibold" style={{ color: routeColor }}>
                {trips} trips
              </span>
            </div>
            {ds.bands.length > 0 ? (
              <>
                <TimelineBar bands={ds.bands} color={routeColor} />
                <div className="flex flex-wrap gap-1 mt-2">
                  {ds.bands.map((b) => {
                    const { dot, pill } = bandRoleColor(b.startHour);
                    return (
                      <span
                        key={b.id}
                        className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-medium ${pill}`}
                      >
                        <span className={`w-1 h-1 rounded-full ${dot}`} />
                        {b.label} · {b.headwayMins}m
                      </span>
                    );
                  })}
                </div>
              </>
            ) : (
              <p className="text-xs text-slate-400">Active but no windows set</p>
            )}
          </div>
        );
      })}

      <Button
        className="w-full rounded-xl bg-[#007A33] hover:bg-[#005f28] text-white h-10"
        onClick={onEdit}
      >
        <Pencil className="w-3.5 h-3.5 mr-2" />
        Edit schedule
      </Button>
    </div>
  );
}

// ─── Main SchedulePanel ─────────────────────────────────────────────────────

interface SchedulePanelProps {
  routes: CustomRoute[];
  onSaveSchedule: (routeId: string, schedule: CustomSchedule) => void;
}

export default function SchedulePanel({ routes, onSaveSchedule }: SchedulePanelProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"view" | "edit">("view");
  const [activeDay, setActiveDay] = useState<DayKey>("weekday");
  const [scheduleMode, setScheduleMode] = useState<"banded" | "fixed">("banded");
  const [editedSchedule, setEditedSchedule] = useState<CustomSchedule | null>(null);
  const [savedSchedule, setSavedSchedule] = useState<CustomSchedule | null>(null);
  const [hasUnsaved, setHasUnsaved] = useState(false);
  const [justSaved, setJustSaved] = useState(false);

  const selectedRoute = routes.find((r) => r.id === selectedId);

  function openRoute(route: CustomRoute) {
    const base = route.schedule
      ? migrateLegacySchedule(route.schedule)
      : defaultBandedSchedule();
    setSavedSchedule(base);
    setEditedSchedule(JSON.parse(JSON.stringify(base))); // deep clone for editing
    setScheduleMode(base.type === "fixed" ? "fixed" : "banded");
    setActiveDay("weekday");
    setSelectedId(route.id);
    // If there's already a saved schedule, show it first (view mode)
    // If it's a default (no schedule), go straight to edit
    setViewMode(route.schedule ? "view" : "edit");
    setHasUnsaved(false);
    setJustSaved(false);
  }

  function closeRoute() {
    setSelectedId(null);
    setEditedSchedule(null);
    setSavedSchedule(null);
    setHasUnsaved(false);
    setJustSaved(false);
  }

  function enterEdit() {
    setViewMode("edit");
    setJustSaved(false);
  }

  function updateDay(key: DayKey, ds: DaySchedule) {
    if (!editedSchedule) return;
    setEditedSchedule({ ...editedSchedule, [key]: ds });
    setHasUnsaved(true);
    setJustSaved(false);
  }

  function copyDayTo(target: DayKey) {
    if (!editedSchedule) return;
    const src = editedSchedule[activeDay];
    if (!src) return;
    setEditedSchedule({
      ...editedSchedule,
      [target]: { ...src, bands: src.bands.map((b) => ({ ...b, id: uuidv4() })) },
    });
    setHasUnsaved(true);
    setJustSaved(false);
  }

  function handleSave() {
    if (!selectedId || !editedSchedule) return;
    const final: CustomSchedule = { ...editedSchedule, type: scheduleMode };
    onSaveSchedule(selectedId, final);
    setSavedSchedule(JSON.parse(JSON.stringify(final)));
    setHasUnsaved(false);
    setJustSaved(true);
    // Switch back to view mode after saving
    setTimeout(() => setViewMode("view"), 600);
  }

  // ── Empty state ────────────────────────────────────────────────────────────
  if (routes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 px-6 text-center">
        <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center">
          <Calendar className="w-7 h-7 text-slate-300" />
        </div>
        <div>
          <p className="font-semibold text-slate-700 text-sm">No custom routes yet</p>
          <p className="text-xs text-slate-400 mt-1 leading-relaxed">
            Design a route in the{" "}
            <span className="font-medium text-slate-600">Design</span> tab first,
            then come back to set its schedule.
          </p>
        </div>
      </div>
    );
  }

  // ── Route list ─────────────────────────────────────────────────────────────
  if (!selectedRoute || !editedSchedule || !savedSchedule) {
    return (
      <div className="flex flex-col h-full">
        <div className="px-4 pt-4 pb-3 border-b border-slate-100">
          <h2 className="font-semibold text-slate-900 text-base">Schedules</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            {routes.length} custom route{routes.length !== 1 ? "s" : ""}
          </p>
        </div>

        <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2">
          {routes.map((route) => {
            const Icon = route.type === "train" ? Train : Bus;
            const s = route.schedule ? migrateLegacySchedule(route.schedule) : null;
            const weekdayBands = s?.type === "banded" ? (s.weekday?.bands ?? []) : [];
            const trips = s?.type === "banded" ? tripsPerDay(weekdayBands) : null;
            const hasSchedule = !!s;

            return (
              <button
                key={route.id}
                onClick={() => openRoute(route)}
                className="w-full flex flex-col p-3.5 rounded-2xl border border-slate-100 hover:border-slate-200 hover:bg-slate-50/70 transition-all text-left group"
              >
                {/* Top row */}
                <div className="flex items-center gap-3">
                  <div
                    className="w-9 h-9 rounded-xl flex items-center justify-center text-white flex-shrink-0"
                    style={{ backgroundColor: route.color }}
                  >
                    <Icon className="w-4 h-4" />
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-900 truncate">{route.name || "Unnamed"}</p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      {hasSchedule ? (
                        <>
                          <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500" />
                          <span className="text-xs text-slate-500">
                            {s?.type === "fixed"
                              ? `${s.fixedDepartures?.length ?? 0} fixed departures`
                              : `~${trips} trips/weekday`}
                          </span>
                        </>
                      ) : (
                        <>
                          <AlertCircle className="w-3 h-3 text-amber-400" />
                          <span className="text-xs text-amber-600 font-medium">No schedule — tap to add</span>
                        </>
                      )}
                    </div>
                  </div>

                  <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-slate-400 flex-shrink-0 transition-colors" />
                </div>

                {/* Inline band pills — shown for banded schedules */}
                {hasSchedule && s?.type === "banded" && weekdayBands.length > 0 && (
                  <BandPillRow bands={weekdayBands} />
                )}

                {/* Fixed schedule dot preview */}
                {hasSchedule && s?.type === "fixed" && (s.fixedDepartures?.length ?? 0) > 0 && (
                  <div className="relative h-4 w-full mt-2 ml-12">
                    <div className="absolute top-1/2 left-0 right-0 h-px bg-slate-200" />
                    {(s.fixedDepartures ?? []).map((t) => {
                      const [h, m] = t.split(":").map(Number);
                      const pct = ((h * 60 + m) / (24 * 60)) * 100;
                      return (
                        <div
                          key={t}
                          className="absolute top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full"
                          style={{ left: `${pct}%`, backgroundColor: route.color }}
                          title={t}
                        />
                      );
                    })}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // ── Schedule view / edit ───────────────────────────────────────────────────
  const Icon = selectedRoute.type === "train" ? Train : Bus;
  const dayTabs: { key: DayKey; label: string }[] = [
    { key: "weekday", label: "Weekday" },
    { key: "saturday", label: "Sat" },
    { key: "sunday", label: "Sun" },
  ];

  const currentDaySchedule: DaySchedule = editedSchedule[activeDay] ?? {
    active: false,
    bands: [],
  };

  const copyTargets: DayKey[] = (["weekday", "saturday", "sunday"] as DayKey[]).filter(
    (k) => k !== activeDay
  );

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 pt-4 pb-3 border-b border-slate-100">
        <div className="flex items-center gap-2 mb-3">
          <button
            onClick={closeRoute}
            className="text-slate-400 hover:text-slate-600 transition-colors p-1 -ml-1 rounded-lg hover:bg-slate-100"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div
            className="w-8 h-8 rounded-xl flex items-center justify-center text-white flex-shrink-0"
            style={{ backgroundColor: selectedRoute.color }}
          >
            <Icon className="w-4 h-4" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-slate-900 truncate">
              {selectedRoute.name || "Unnamed route"}
            </p>
          </div>

          {/* State indicators */}
          {viewMode === "view" && (
            <span className="text-[10px] font-semibold text-emerald-600 bg-emerald-50 border border-emerald-100 rounded-lg px-2 py-1 flex items-center gap-1">
              <Check className="w-3 h-3" /> Saved
            </span>
          )}
          {viewMode === "edit" && justSaved && !hasUnsaved && (
            <span className="text-[10px] font-semibold text-emerald-600 bg-emerald-50 border border-emerald-100 rounded-lg px-2 py-1 flex items-center gap-1 animate-pulse">
              <Check className="w-3 h-3" /> Saved
            </span>
          )}
          {viewMode === "edit" && hasUnsaved && (
            <span className="text-[10px] font-semibold text-amber-600 bg-amber-50 border border-amber-100 rounded-lg px-2 py-1">
              Unsaved
            </span>
          )}
        </div>

        {/* View/Edit mode toggle — only show in edit mode */}
        {viewMode === "edit" && (
          <div className="flex gap-1 bg-slate-100 rounded-xl p-1">
            {(["banded", "fixed"] as const).map((m) => (
              <button
                key={m}
                onClick={() => { setScheduleMode(m); setHasUnsaved(true); setJustSaved(false); }}
                className={`flex-1 text-xs font-medium py-1.5 rounded-lg transition-all ${
                  scheduleMode === m
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-500 hover:text-slate-700"
                }`}
              >
                {m === "banded" ? "Frequency" : "Fixed times"}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Day tabs — only in edit + banded mode */}
      {viewMode === "edit" && scheduleMode === "banded" && (
        <div className="flex gap-1 px-4 pt-3 pb-0">
          {dayTabs.map(({ key, label }) => {
            const ds = editedSchedule[key];
            const isActive = key === activeDay;
            const hasService = ds?.active;
            return (
              <button
                key={key}
                onClick={() => setActiveDay(key)}
                className={`flex-1 flex flex-col items-center rounded-xl py-2 text-xs font-medium transition-all ${
                  isActive
                    ? "bg-slate-900 text-white"
                    : "text-slate-500 hover:bg-slate-100"
                }`}
              >
                {label}
                {!isActive && (
                  <span className={`text-[9px] mt-0.5 ${hasService ? "text-emerald-500" : "text-slate-300"}`}>
                    {hasService ? `${tripsPerDay(ds?.bands ?? [])} trips` : "off"}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {viewMode === "view" ? (
          /* Read-only summary */
          <ScheduleSummaryCard
            schedule={savedSchedule}
            routeColor={selectedRoute.color}
            onEdit={enterEdit}
          />
        ) : scheduleMode === "banded" ? (
          <DayScheduleEditor
            key={activeDay}
            dayKey={activeDay}
            daySchedule={currentDaySchedule}
            routeColor={selectedRoute.color}
            onChange={(ds) => updateDay(activeDay, ds)}
          />
        ) : (
          <FixedDeparturesEditor
            departures={editedSchedule.fixedDepartures ?? []}
            onChange={(d) => {
              setEditedSchedule({ ...editedSchedule, fixedDepartures: d });
              setHasUnsaved(true);
              setJustSaved(false);
            }}
          />
        )}
      </div>

      {/* Footer — only in edit mode */}
      {viewMode === "edit" && (
        <div className="px-4 pb-4 pt-3 border-t border-slate-100 flex flex-col gap-2">
          {scheduleMode === "banded" && currentDaySchedule.active && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400 flex-shrink-0">Copy to</span>
              {copyTargets.map((t) => (
                <button
                  key={t}
                  onClick={() => copyDayTo(t)}
                  className="flex items-center gap-1 text-xs font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg px-2.5 py-1.5 transition-colors"
                >
                  <Copy className="w-3 h-3" />
                  {t === "saturday" ? "Sat" : t === "sunday" ? "Sun" : "Weekday"}
                </button>
              ))}
            </div>
          )}

          <div className="flex gap-2">
            {selectedRoute.schedule && (
              <Button
                variant="outline"
                className="rounded-xl h-10 text-slate-600"
                onClick={() => { setViewMode("view"); setHasUnsaved(false); setJustSaved(false); }}
              >
                Cancel
              </Button>
            )}
            <Button
              className={`flex-1 rounded-xl h-10 transition-all ${
                hasUnsaved
                  ? "bg-[#007A33] hover:bg-[#005f28] text-white"
                  : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200"
              }`}
              onClick={handleSave}
            >
              {justSaved && !hasUnsaved ? (
                <><Check className="w-4 h-4 mr-1.5" /> Saved</>
              ) : (
                "Save schedule"
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
