"use client";

import { useState } from "react";
import {
  Train, Bus, Plus, X, Clock, ChevronDown, ChevronUp,
  Copy, Check, Calendar, Zap, AlertCircle, Pencil,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  CustomRoute, CustomSchedule, ServiceBand, DaySchedule,
  migrateLegacySchedule, defaultBandedSchedule,
} from "@/lib/gtfs";
import { v4 as uuidv4 } from "uuid";

// ─── Types ──────────────────────────────────────────────────────────────────

type DayKey = "weekday" | "saturday" | "sunday";

// ─── Per-route editor state ─────────────────────────────────────────────────

interface RouteEditorState {
  saved: CustomSchedule;       // the last-saved version
  draft: CustomSchedule;       // in-progress edits
  view: "summary" | "edit";
  activeDay: DayKey;
  scheduleMode: "banded" | "fixed";
  hasUnsaved: boolean;
  justSaved: boolean;
}

// ─── Band role colours ───────────────────────────────────────────────────────

function bandRoleColor(startHour: number) {
  if (startHour >= 5  && startHour < 9)  return { bg: "bg-amber-50",   text: "text-amber-700",   dot: "bg-amber-400",   barFill: "#f59e0b", pill: "bg-amber-100 text-amber-700" };
  if (startHour >= 9  && startHour < 15) return { bg: "bg-sky-50",     text: "text-sky-700",     dot: "bg-sky-400",     barFill: "#38bdf8", pill: "bg-sky-100 text-sky-700" };
  if (startHour >= 15 && startHour < 19) return { bg: "bg-emerald-50", text: "text-emerald-700", dot: "bg-emerald-400", barFill: "#34d399", pill: "bg-emerald-100 text-emerald-700" };
  if (startHour >= 19 && startHour < 23) return { bg: "bg-indigo-50",  text: "text-indigo-700",  dot: "bg-indigo-400",  barFill: "#818cf8", pill: "bg-indigo-100 text-indigo-700" };
  return { bg: "bg-slate-50", text: "text-slate-600", dot: "bg-slate-400", barFill: "#94a3b8", pill: "bg-slate-100 text-slate-600" };
}

// ─── Templates ──────────────────────────────────────────────────────────────

const TEMPLATES: Record<string, { label: string; desc: string; bands: Omit<ServiceBand, "id">[] }> = {
  go_rail: {
    label: "GO Rail",
    desc: "Peak-heavy, hourly off-peak",
    bands: [
      { label: "Early morning", startHour: 5,  startMin: 30, endHour: 6,  endMin: 30, headwayMins: 60 },
      { label: "Morning peak",  startHour: 6,  startMin: 30, endHour: 9,  endMin: 30, headwayMins: 15 },
      { label: "Midday",        startHour: 9,  startMin: 30, endHour: 15, endMin: 30, headwayMins: 60 },
      { label: "Afternoon peak",startHour: 15, startMin: 30, endHour: 18, endMin: 30, headwayMins: 15 },
      { label: "Evening",       startHour: 18, startMin: 30, endHour: 22, endMin: 30, headwayMins: 60 },
    ],
  },
  ttc_bus: {
    label: "TTC Bus",
    desc: "Frequent all-day service",
    bands: [
      { label: "Early morning", startHour: 5,  startMin: 0,  endHour: 6,  endMin: 30, headwayMins: 20 },
      { label: "Morning peak",  startHour: 6,  startMin: 30, endHour: 9,  endMin: 0,  headwayMins: 8  },
      { label: "Midday",        startHour: 9,  startMin: 0,  endHour: 15, endMin: 0,  headwayMins: 12 },
      { label: "Afternoon peak",startHour: 15, startMin: 0,  endHour: 18, endMin: 30, headwayMins: 8  },
      { label: "Evening",       startHour: 18, startMin: 30, endHour: 23, endMin: 59, headwayMins: 15 },
    ],
  },
  express: {
    label: "Express",
    desc: "Rush-hour only",
    bands: [
      { label: "Morning peak",   startHour: 7,  startMin: 0, endHour: 9,  endMin: 0,  headwayMins: 20 },
      { label: "Afternoon peak", startHour: 16, startMin: 0, endHour: 18, endMin: 30, headwayMins: 20 },
    ],
  },
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtHM(h: number, m: number) {
  const ampm = h < 12 ? "AM" : "PM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
}

function bandTotalMinutes(b: ServiceBand) {
  return (b.endHour * 60 + b.endMin) - (b.startHour * 60 + b.startMin);
}

function tripsPerDay(bands: ServiceBand[]) {
  return bands.reduce((sum, b) => {
    const mins = bandTotalMinutes(b);
    return sum + (mins > 0 && b.headwayMins > 0 ? Math.floor(mins / b.headwayMins) : 0);
  }, 0);
}

function cloneSchedule(s: CustomSchedule): CustomSchedule {
  return JSON.parse(JSON.stringify(s));
}

// ─── 24h timeline bar ────────────────────────────────────────────────────────

function TimelineBar({ bands }: { bands: ServiceBand[] }) {
  const TOTAL = 24 * 60;
  return (
    <div className="relative w-full">
      <div className="h-4 w-full bg-slate-100 rounded-lg overflow-hidden">
        {bands.map((b) => {
          const startPct = ((b.startHour * 60 + b.startMin) / TOTAL) * 100;
          const widthPct = (bandTotalMinutes(b) / TOTAL) * 100;
          const opacity = Math.max(0.4, Math.min(1, 1 - (b.headwayMins - 5) / 60));
          const { barFill } = bandRoleColor(b.startHour);
          return (
            <div
              key={b.id}
              className="absolute top-0 h-full rounded-sm"
              style={{ left: `${startPct}%`, width: `${widthPct}%`, backgroundColor: barFill, opacity }}
            />
          );
        })}
      </div>
      <div className="flex justify-between mt-0.5">
        {[0, 6, 12, 18].map((h) => (
          <span key={h} className="text-[9px] text-slate-400">
            {h === 0 ? "12a" : h === 12 ? "12p" : h < 12 ? `${h}a` : `${h - 12}p`}
          </span>
        ))}
      </div>
    </div>
  );
}

// ─── BandCard (edit) ─────────────────────────────────────────────────────────

function BandCard({ band, color, onChange, onDelete }: {
  band: ServiceBand;
  color: string;
  onChange: (b: ServiceBand) => void;
  onDelete: () => void;
}) {
  const { bg, text, dot } = bandRoleColor(band.startHour);

  function adjustHeadway(delta: number) {
    onChange({ ...band, headwayMins: Math.max(1, Math.min(120, band.headwayMins + delta)) });
  }

  return (
    <div className="rounded-xl border border-slate-100 overflow-hidden">
      <div className="h-0.5 w-full" style={{ backgroundColor: color }} />
      <div className={`${bg} px-3 py-2.5`}>
        {/* Label + delete */}
        <div className="flex items-center gap-2 mb-2">
          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${dot}`} />
          <input
            value={band.label}
            onChange={(e) => onChange({ ...band, label: e.target.value })}
            className={`flex-1 text-xs font-semibold ${text} bg-transparent border-none outline-none min-w-0`}
          />
          <button onClick={onDelete} className="text-slate-300 hover:text-red-400 transition-colors">
            <X className="w-3 h-3" />
          </button>
        </div>
        {/* Times */}
        <div className="flex items-center gap-1.5 mb-2">
          <Clock className="w-3 h-3 text-slate-400 flex-shrink-0" />
          <input
            type="time"
            value={`${String(band.startHour).padStart(2,"0")}:${String(band.startMin).padStart(2,"0")}`}
            onChange={(e) => {
              const [h,m] = e.target.value.split(":").map(Number);
              onChange({ ...band, startHour: h ?? 0, startMin: m ?? 0 });
            }}
            className="text-xs text-slate-700 bg-white border border-slate-200 rounded-lg px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-[#007A33]/30 w-[84px]"
          />
          <span className="text-xs text-slate-400">–</span>
          <input
            type="time"
            value={`${String(band.endHour).padStart(2,"0")}:${String(band.endMin).padStart(2,"0")}`}
            onChange={(e) => {
              const [h,m] = e.target.value.split(":").map(Number);
              onChange({ ...band, endHour: h ?? 0, endMin: m ?? 0 });
            }}
            className="text-xs text-slate-700 bg-white border border-slate-200 rounded-lg px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-[#007A33]/30 w-[84px]"
          />
        </div>
        {/* Headway */}
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] text-slate-500">Every</span>
          <div className="flex items-center gap-1.5 bg-white rounded-lg border border-slate-200 px-1 py-0.5">
            <button onClick={() => adjustHeadway(-1)} className="w-5 h-5 rounded flex items-center justify-center text-slate-500 hover:bg-slate-100 text-xs font-bold">−</button>
            <span className={`text-sm font-bold tabular-nums ${text} w-7 text-center`}>{band.headwayMins}</span>
            <button onClick={() => adjustHeadway(1)} className="w-5 h-5 rounded flex items-center justify-center text-slate-500 hover:bg-slate-100 text-xs font-bold">+</button>
          </div>
          <span className="text-[11px] text-slate-500">min</span>
          <span className="ml-auto text-[10px] text-slate-400 tabular-nums">
            {bandTotalMinutes(band) > 0 && band.headwayMins > 0 ? `~${Math.floor(bandTotalMinutes(band) / band.headwayMins)} trips` : ""}
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── DayScheduleEditor ───────────────────────────────────────────────────────

function DayScheduleEditor({ daySchedule, routeColor, onChange }: {
  daySchedule: DaySchedule;
  routeColor: string;
  onChange: (d: DaySchedule) => void;
}) {
  function updateBand(id: string, updated: ServiceBand) {
    onChange({ ...daySchedule, bands: daySchedule.bands.map((b) => b.id === id ? updated : b) });
  }
  function deleteBand(id: string) {
    onChange({ ...daySchedule, bands: daySchedule.bands.filter((b) => b.id !== id) });
  }
  function addBand() {
    onChange({ ...daySchedule, bands: [...daySchedule.bands, { id: uuidv4(), label: "New window", startHour: 8, startMin: 0, endHour: 12, endMin: 0, headwayMins: 20 }] });
  }
  function applyTemplate(key: string) {
    const tpl = TEMPLATES[key];
    if (!tpl) return;
    onChange({ active: true, bands: tpl.bands.map((b) => ({ ...b, id: uuidv4() })) });
  }

  if (!daySchedule.active) {
    return (
      <div className="flex flex-col items-center py-6 gap-2.5">
        <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center">
          <Calendar className="w-5 h-5 text-slate-300" />
        </div>
        <p className="text-xs text-slate-500 font-medium">No service this day</p>
        <Button size="sm" variant="outline" className="rounded-xl text-xs h-8"
          onClick={() => onChange({ ...daySchedule, active: true, bands: [] })}>
          <Plus className="w-3 h-3 mr-1.5" /> Activate service
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2.5">
      {daySchedule.bands.length > 0 && <TimelineBar bands={daySchedule.bands} />}
      {daySchedule.bands.length > 0 && (
        <p className="text-[11px] text-slate-400 text-center">
          <span className="font-semibold text-slate-600">{tripsPerDay(daySchedule.bands)}</span> trips/day
        </p>
      )}
      {daySchedule.bands.length === 0 && (
        <div className="flex flex-col items-center py-4 gap-1.5 text-slate-400">
          <Clock className="w-6 h-6 opacity-40" />
          <p className="text-xs font-medium">No windows yet — add one below</p>
        </div>
      )}
      <div className="flex flex-col gap-1.5">
        {daySchedule.bands.map((b) => (
          <BandCard key={b.id} band={b} color={routeColor}
            onChange={(u) => updateBand(u.id, u)} onDelete={() => deleteBand(b.id)} />
        ))}
      </div>
      <button onClick={addBand}
        className="flex items-center gap-1.5 text-xs text-[#007A33] font-medium py-2 px-2.5 rounded-xl border border-dashed border-emerald-200 hover:bg-emerald-50 transition-colors">
        <Plus className="w-3.5 h-3.5" /> Add time window
      </button>
      <div>
        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1">Quick templates</p>
        <div className="flex gap-1 flex-wrap">
          {Object.entries(TEMPLATES).map(([key, tpl]) => (
            <button key={key} onClick={() => applyTemplate(key)} title={tpl.desc}
              className="flex items-center gap-1 text-[11px] font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg px-2 py-1 transition-colors">
              <Zap className="w-2.5 h-2.5 text-amber-500" /> {tpl.label}
            </button>
          ))}
        </div>
      </div>
      <button onClick={() => onChange({ ...daySchedule, active: false })}
        className="text-[11px] text-slate-400 hover:text-slate-600 transition-colors text-center">
        Mark as no service this day
      </button>
    </div>
  );
}

// ─── FixedDeparturesEditor ───────────────────────────────────────────────────

function FixedDeparturesEditor({ departures, onChange }: {
  departures: string[];
  onChange: (d: string[]) => void;
}) {
  const [newTime, setNewTime] = useState("");

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex gap-2">
        <input type="time" value={newTime} onChange={(e) => setNewTime(e.target.value)}
          className="flex-1 text-xs rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#007A33]/30 focus:border-[#007A33]" />
        <Button size="sm" className="rounded-xl bg-[#007A33] hover:bg-[#005f28] text-white px-3 h-9"
          disabled={!newTime}
          onClick={() => { if (!newTime || departures.includes(newTime)) return; onChange([...departures, newTime].sort()); setNewTime(""); }}>
          <Plus className="w-3 h-3" />
        </Button>
      </div>
      {departures.length === 0 ? (
        <div className="flex flex-col items-center py-4 text-slate-400">
          <Clock className="w-6 h-6 mb-1.5 opacity-40" />
          <p className="text-xs font-medium">No departures added</p>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap gap-1">
            {departures.map((t) => (
              <span key={t} className="inline-flex items-center gap-1 bg-slate-100 text-slate-700 text-xs font-medium rounded-lg px-2 py-1">
                {t}
                <button onClick={() => onChange(departures.filter((d) => d !== t))} className="text-slate-400 hover:text-red-500 transition-colors">
                  <X className="w-2.5 h-2.5" />
                </button>
              </span>
            ))}
          </div>
          <div className="relative h-5 w-full">
            <div className="absolute top-1/2 left-0 right-0 h-px bg-slate-200" />
            {departures.map((t) => {
              const [h, m] = t.split(":").map(Number);
              const pct = ((h * 60 + m) / (24 * 60)) * 100;
              return (
                <div key={t} className="absolute top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-[#007A33]"
                  style={{ left: `${pct}%` }} title={t} />
              );
            })}
          </div>
          <p className="text-[10px] text-slate-400 text-center">
            {departures.length} departure{departures.length !== 1 ? "s" : ""} · first {departures[0]}, last {departures[departures.length - 1]}
          </p>
        </>
      )}
    </div>
  );
}

// ─── Inline schedule summary (view mode) ────────────────────────────────────

function ScheduleSummary({ schedule, routeColor }: { schedule: CustomSchedule; routeColor: string }) {
  const s = migrateLegacySchedule(schedule);

  if (s.type === "fixed") {
    const deps = s.fixedDepartures ?? [];
    return (
      <div className="flex flex-col gap-2">
        <div className="relative h-5 w-full">
          <div className="absolute top-1/2 left-0 right-0 h-px bg-slate-200" />
          {deps.map((t) => {
            const [h, m] = t.split(":").map(Number);
            const pct = ((h * 60 + m) / (24 * 60)) * 100;
            return (
              <div key={t} className="absolute top-1/2 -translate-y-1/2 w-2 h-2 rounded-full border-2 border-white"
                style={{ left: `${pct}%`, backgroundColor: routeColor }} title={t} />
            );
          })}
        </div>
        <p className="text-[10px] text-slate-400">{deps.length} fixed departures</p>
      </div>
    );
  }

  const days: { key: DayKey; short: string }[] = [
    { key: "weekday", short: "Wkd" },
    { key: "saturday", short: "Sat" },
    { key: "sunday", short: "Sun" },
  ];

  return (
    <div className="flex flex-col gap-2">
      {days.map(({ key, short }) => {
        const ds = s[key];
        if (!ds?.active || ds.bands.length === 0) {
          return (
            <div key={key} className="flex items-center gap-2">
              <span className="text-[10px] font-semibold text-slate-400 w-7">{short}</span>
              <span className="text-[10px] text-slate-300">No service</span>
            </div>
          );
        }
        const trips = tripsPerDay(ds.bands);
        return (
          <div key={key} className="flex items-center gap-2">
            <span className="text-[10px] font-semibold text-slate-500 w-7 flex-shrink-0">{short}</span>
            <div className="flex-1">
              <TimelineBar bands={ds.bands} />
            </div>
            <span className="text-[10px] font-semibold tabular-nums flex-shrink-0" style={{ color: routeColor }}>
              {trips}t
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ─── Single route accordion row ──────────────────────────────────────────────

function RouteScheduleRow({
  route,
  state,
  expanded,
  onToggle,
  onUpdateState,
  onSave,
}: {
  route: CustomRoute;
  state: RouteEditorState | null;
  expanded: boolean;
  onToggle: () => void;
  onUpdateState: (s: RouteEditorState) => void;
  onSave: (schedule: CustomSchedule) => void;
}) {
  const Icon = route.type === "train" ? Train : Bus;
  const s = route.schedule ? migrateLegacySchedule(route.schedule) : null;
  const weekdayTrips = s?.type === "banded" ? tripsPerDay(s.weekday?.bands ?? []) : null;
  const hasSchedule = !!s;

  // Initialize state when expanding for the first time
  function handleToggle() {
    if (!expanded && !state) {
      const base = route.schedule ? migrateLegacySchedule(route.schedule) : defaultBandedSchedule();
      onUpdateState({
        saved: cloneSchedule(base),
        draft: cloneSchedule(base),
        view: route.schedule ? "summary" : "edit",
        activeDay: "weekday",
        scheduleMode: base.type === "fixed" ? "fixed" : "banded",
        hasUnsaved: false,
        justSaved: false,
      });
    }
    onToggle();
  }

  function patch(partial: Partial<RouteEditorState>) {
    if (!state) return;
    onUpdateState({ ...state, ...partial });
  }

  function updateDay(key: DayKey, ds: DaySchedule) {
    if (!state) return;
    patch({ draft: { ...state.draft, [key]: ds }, hasUnsaved: true, justSaved: false });
  }

  function copyDayTo(target: DayKey) {
    if (!state) return;
    const src = state.draft[state.activeDay];
    if (!src) return;
    patch({
      draft: { ...state.draft, [target]: { ...src, bands: src.bands.map((b) => ({ ...b, id: uuidv4() })) } },
      hasUnsaved: true,
      justSaved: false,
    });
  }

  function handleSave() {
    if (!state) return;
    const final: CustomSchedule = { ...state.draft, type: state.scheduleMode };
    onSave(final);
    const saved = cloneSchedule(final);
    patch({ saved, draft: cloneSchedule(final), hasUnsaved: false, justSaved: true, view: "summary" });
  }

  function handleCancel() {
    if (!state) return;
    patch({ draft: cloneSchedule(state.saved), hasUnsaved: false, justSaved: false, view: "summary" });
  }

  const currentDaySchedule: DaySchedule = state
    ? (state.draft[state.activeDay] ?? { active: false, bands: [] })
    : { active: false, bands: [] };

  const dayTabs: { key: DayKey; label: string }[] = [
    { key: "weekday", label: "Weekday" },
    { key: "saturday", label: "Sat" },
    { key: "sunday", label: "Sun" },
  ];

  const copyTargets: DayKey[] = (["weekday", "saturday", "sunday"] as DayKey[]).filter(
    (k) => k !== (state?.activeDay ?? "weekday")
  );

  return (
    <div className={`rounded-2xl border transition-all overflow-hidden ${
      expanded ? "border-slate-200 shadow-sm" : "border-slate-100 hover:border-slate-200"
    }`}>
      {/* ── Row header (always visible) ──────────────────────────────────── */}
      <button
        onClick={handleToggle}
        className="w-full flex items-center gap-3 px-3.5 py-3 text-left hover:bg-slate-50/60 transition-colors"
      >
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
                    : `~${weekdayTrips} trips/weekday`}
                </span>
              </>
            ) : (
              <>
                <AlertCircle className="w-3 h-3 text-amber-400" />
                <span className="text-xs text-amber-600 font-medium">No schedule</span>
              </>
            )}
          </div>
        </div>

        {/* Unsaved/saved badge */}
        {state?.hasUnsaved && <span className="text-[10px] font-semibold text-amber-600 bg-amber-50 border border-amber-100 rounded-md px-1.5 py-0.5 flex-shrink-0">Unsaved</span>}
        {state?.justSaved && !state.hasUnsaved && <span className="text-[10px] font-semibold text-emerald-600 bg-emerald-50 border border-emerald-100 rounded-md px-1.5 py-0.5 flex-shrink-0 flex items-center gap-1"><Check className="w-2.5 h-2.5" />Saved</span>}

        {expanded
          ? <ChevronUp className="w-4 h-4 text-slate-400 flex-shrink-0" />
          : <ChevronDown className="w-4 h-4 text-slate-300 flex-shrink-0" />
        }
      </button>

      {/* ── Expanded content ─────────────────────────────────────────────── */}
      {expanded && state && (
        <div className="px-3.5 pb-4 pt-1 border-t border-slate-100">

          {/* Summary view */}
          {state.view === "summary" && (
            <div className="flex flex-col gap-3 pt-2">
              <ScheduleSummary schedule={state.saved} routeColor={route.color} />
              <Button
                size="sm"
                className="w-full rounded-xl bg-[#007A33] hover:bg-[#005f28] text-white h-9"
                onClick={() => patch({ view: "edit", justSaved: false })}
              >
                <Pencil className="w-3 h-3 mr-1.5" /> Edit schedule
              </Button>
            </div>
          )}

          {/* Edit view */}
          {state.view === "edit" && (
            <div className="flex flex-col gap-3 pt-2">
              {/* Mode toggle */}
              <div className="flex gap-1 bg-slate-100 rounded-xl p-1">
                {(["banded", "fixed"] as const).map((m) => (
                  <button key={m}
                    onClick={() => patch({ scheduleMode: m, hasUnsaved: true, justSaved: false })}
                    className={`flex-1 text-xs font-medium py-1.5 rounded-lg transition-all ${
                      state.scheduleMode === m ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
                    }`}>
                    {m === "banded" ? "Frequency" : "Fixed times"}
                  </button>
                ))}
              </div>

              {/* Day tabs — banded only */}
              {state.scheduleMode === "banded" && (
                <div className="flex gap-1">
                  {dayTabs.map(({ key, label }) => {
                    const ds = state.draft[key];
                    const isActive = key === state.activeDay;
                    return (
                      <button key={key}
                        onClick={() => patch({ activeDay: key })}
                        className={`flex-1 flex flex-col items-center rounded-xl py-1.5 text-xs font-medium transition-all ${
                          isActive ? "bg-slate-900 text-white" : "text-slate-500 hover:bg-slate-100"
                        }`}>
                        {label}
                        {!isActive && (
                          <span className={`text-[9px] mt-0.5 ${ds?.active ? "text-emerald-500" : "text-slate-300"}`}>
                            {ds?.active ? `${tripsPerDay(ds.bands ?? [])}t` : "off"}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Day editor / fixed editor */}
              {state.scheduleMode === "banded" ? (
                <DayScheduleEditor
                  key={state.activeDay}
                  daySchedule={currentDaySchedule}
                  routeColor={route.color}
                  onChange={(ds) => updateDay(state.activeDay, ds)}
                />
              ) : (
                <FixedDeparturesEditor
                  departures={state.draft.fixedDepartures ?? []}
                  onChange={(d) => patch({ draft: { ...state.draft, fixedDepartures: d }, hasUnsaved: true, justSaved: false })}
                />
              )}

              {/* Copy to day */}
              {state.scheduleMode === "banded" && currentDaySchedule.active && (
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] text-slate-400 flex-shrink-0">Copy to</span>
                  {copyTargets.map((t) => (
                    <button key={t} onClick={() => copyDayTo(t)}
                      className="flex items-center gap-1 text-[11px] font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg px-2 py-1 transition-colors">
                      <Copy className="w-2.5 h-2.5" />
                      {t === "saturday" ? "Sat" : t === "sunday" ? "Sun" : "Weekday"}
                    </button>
                  ))}
                </div>
              )}

              {/* Save / Cancel */}
              <div className="flex gap-2">
                {route.schedule && (
                  <Button variant="outline" size="sm" className="rounded-xl h-9 text-xs" onClick={handleCancel}>
                    Cancel
                  </Button>
                )}
                <Button size="sm"
                  className={`flex-1 rounded-xl h-9 text-xs transition-all ${
                    state.hasUnsaved
                      ? "bg-[#007A33] hover:bg-[#005f28] text-white"
                      : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200"
                  }`}
                  onClick={handleSave}>
                  {state.justSaved && !state.hasUnsaved
                    ? <><Check className="w-3.5 h-3.5 mr-1" /> Saved</>
                    : "Save schedule"}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main SchedulePanel ──────────────────────────────────────────────────────

interface SchedulePanelProps {
  routes: CustomRoute[];
  onSaveSchedule: (routeId: string, schedule: CustomSchedule) => void;
}

export default function SchedulePanel({ routes, onSaveSchedule }: SchedulePanelProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editorStates, setEditorStates] = useState<Record<string, RouteEditorState>>({});

  function toggleRoute(id: string) {
    setExpandedId((prev) => (prev === id ? null : id));
  }

  function updateState(id: string, s: RouteEditorState) {
    setEditorStates((prev) => ({ ...prev, [id]: s }));
  }

  if (routes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 px-6 text-center">
        <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center">
          <Calendar className="w-7 h-7 text-slate-300" />
        </div>
        <div>
          <p className="font-semibold text-slate-700 text-sm">No custom routes yet</p>
          <p className="text-xs text-slate-400 mt-1 leading-relaxed">
            Design a route in the <span className="font-medium text-slate-600">Design</span> tab first,
            then come back to set its schedule.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 pt-4 pb-3 border-b border-slate-100">
        <h2 className="font-semibold text-slate-900 text-base">Schedules</h2>
        <p className="text-xs text-slate-400 mt-0.5">
          {routes.length} custom route{routes.length !== 1 ? "s" : ""}
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2">
        {routes.map((route) => (
          <RouteScheduleRow
            key={route.id}
            route={route}
            state={editorStates[route.id] ?? null}
            expanded={expandedId === route.id}
            onToggle={() => toggleRoute(route.id)}
            onUpdateState={(s) => updateState(route.id, s)}
            onSave={(schedule) => onSaveSchedule(route.id, schedule)}
          />
        ))}
      </div>
    </div>
  );
}
