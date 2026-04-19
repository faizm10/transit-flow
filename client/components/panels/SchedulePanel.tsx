"use client";

import { useState, useEffect } from "react";
import {
  Train, Bus, Plus, X, Clock, ChevronDown, ChevronUp,
  Copy, Check, Calendar, Zap, AlertCircle, Pencil, Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  CustomRoute, CustomSchedule, ServiceBand, DaySchedule, EnrichedRoute,
  migrateLegacySchedule, defaultBandedSchedule,
} from "@/lib/gtfs";
import { v4 as uuidv4 } from "uuid";

// ─── Types ───────────────────────────────────────────────────────────────────

type DayKey = "weekday" | "saturday" | "sunday";
type FilterTab = "all" | "train" | "bus" | "custom";

// ─── Colours ─────────────────────────────────────────────────────────────────

function bandRoleColor(startHour: number) {
  if (startHour >= 5  && startHour < 9)  return { bg: "bg-amber-50",   text: "text-amber-700",   dot: "bg-amber-400",   barFill: "#f59e0b" };
  if (startHour >= 9  && startHour < 15) return { bg: "bg-sky-50",     text: "text-sky-700",     dot: "bg-sky-400",     barFill: "#38bdf8" };
  if (startHour >= 15 && startHour < 19) return { bg: "bg-emerald-50", text: "text-emerald-700", dot: "bg-emerald-400", barFill: "#34d399" };
  if (startHour >= 19 && startHour < 23) return { bg: "bg-indigo-50",  text: "text-indigo-700",  dot: "bg-indigo-400",  barFill: "#818cf8" };
  return { bg: "bg-slate-50", text: "text-slate-600", dot: "bg-slate-400", barFill: "#94a3b8" };
}

// ─── Templates ───────────────────────────────────────────────────────────────

const TEMPLATES: Record<string, { label: string; desc: string; bands: Omit<ServiceBand, "id">[] }> = {
  go_rail: {
    label: "GO Rail", desc: "Peak-heavy, hourly off-peak",
    bands: [
      { label: "Early morning", startHour: 5,  startMin: 30, endHour: 6,  endMin: 30, headwayMins: 60 },
      { label: "Morning peak",  startHour: 6,  startMin: 30, endHour: 9,  endMin: 30, headwayMins: 15 },
      { label: "Midday",        startHour: 9,  startMin: 30, endHour: 15, endMin: 30, headwayMins: 60 },
      { label: "Afternoon peak",startHour: 15, startMin: 30, endHour: 18, endMin: 30, headwayMins: 15 },
      { label: "Evening",       startHour: 18, startMin: 30, endHour: 22, endMin: 30, headwayMins: 60 },
    ],
  },
  ttc_bus: {
    label: "TTC Bus", desc: "Frequent all-day service",
    bands: [
      { label: "Early morning", startHour: 5,  startMin: 0,  endHour: 6,  endMin: 30, headwayMins: 20 },
      { label: "Morning peak",  startHour: 6,  startMin: 30, endHour: 9,  endMin: 0,  headwayMins: 8  },
      { label: "Midday",        startHour: 9,  startMin: 0,  endHour: 15, endMin: 0,  headwayMins: 12 },
      { label: "Afternoon peak",startHour: 15, startMin: 0,  endHour: 18, endMin: 30, headwayMins: 8  },
      { label: "Evening",       startHour: 18, startMin: 30, endHour: 23, endMin: 59, headwayMins: 15 },
    ],
  },
  express: {
    label: "Express", desc: "Rush-hour only",
    bands: [
      { label: "Morning peak",   startHour: 7,  startMin: 0, endHour: 9,  endMin: 0,  headwayMins: 20 },
      { label: "Afternoon peak", startHour: 16, startMin: 0, endHour: 18, endMin: 30, headwayMins: 20 },
    ],
  },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

function fmtTrips(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

// ─── 24h timeline bar ─────────────────────────────────────────────────────────

function TimelineBar({ bands, compact = false }: { bands: ServiceBand[]; compact?: boolean }) {
  const TOTAL = 24 * 60;
  return (
    <div className="relative w-full">
      <div className={`${compact ? "h-3" : "h-4"} w-full bg-slate-100 rounded-full overflow-hidden`}>
        {bands.map((b) => {
          const startPct = ((b.startHour * 60 + b.startMin) / TOTAL) * 100;
          const widthPct  = (bandTotalMinutes(b) / TOTAL) * 100;
          const opacity   = Math.max(0.4, Math.min(1, 1 - (b.headwayMins - 5) / 60));
          const { barFill } = bandRoleColor(b.startHour);
          return (
            <div key={b.id} className="absolute top-0 h-full"
              style={{ left: `${startPct}%`, width: `${widthPct}%`, backgroundColor: barFill, opacity }} />
          );
        })}
      </div>
      {!compact && (
        <div className="flex justify-between mt-0.5">
          {[0, 6, 12, 18].map((h) => (
            <span key={h} className="text-[9px] text-slate-400">
              {h === 0 ? "12a" : h === 12 ? "12p" : h < 12 ? `${h}a` : `${h - 12}p`}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── GO Transit route card (read-only) ───────────────────────────────────────

function GORouteCard({ route }: { route: EnrichedRoute }) {
  const [expanded, setExpanded] = useState(false);
  const Icon = route.is_rail ? Train : Bus;
  const weeklyTrips = route.weekly_trips ?? route.total_trips ?? 0;

  // Rough daily estimate: divide weekly by number of active days
  const dailyEst = Math.round(weeklyTrips / 5);

  return (
    <div className={`rounded-2xl border overflow-hidden transition-all ${expanded ? "border-slate-200 shadow-sm" : "border-slate-100 hover:border-slate-200"}`}>
      {/* Header */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-3 px-3.5 py-3 text-left hover:bg-slate-50/60 transition-colors"
      >
        {/* Coloured icon */}
        <div className="w-9 h-9 rounded-xl flex items-center justify-center text-white flex-shrink-0"
          style={{ backgroundColor: route.color }}>
          <Icon className="w-4 h-4" />
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <p className="text-sm font-semibold text-slate-900 truncate">
              {route.long_name || route.short_name}
            </p>
          </div>
          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
            {route.from_stop && route.to_stop ? (
              <span className="text-[11px] text-slate-400 truncate">
                {route.from_stop} → {route.to_stop}
              </span>
            ) : null}
          </div>
        </div>

        {/* Trip count badge */}
        <div className="flex flex-col items-end gap-0.5 flex-shrink-0">
          <span className="text-xs font-semibold tabular-nums" style={{ color: route.color }}>
            {fmtTrips(weeklyTrips)}
          </span>
          <span className="text-[9px] text-slate-400">trips/wk</span>
        </div>

        {expanded
          ? <ChevronUp className="w-4 h-4 text-slate-400 flex-shrink-0 ml-1" />
          : <ChevronDown className="w-4 h-4 text-slate-300 flex-shrink-0 ml-1" />}
      </button>

      {/* Expanded: variant breakdown */}
      {expanded && (
        <div className="px-3.5 pb-3.5 border-t border-slate-100">
          <div className="pt-3 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">
                Route variants
              </p>
              <span className="text-[10px] text-slate-400">{route.variants.length} variants</span>
            </div>

            <div className="flex flex-col gap-1">
              {route.variants.slice(0, 6).map((v) => {
                const trips = v.weekly_trip_count ?? v.trip_count ?? 0;
                const barPct = weeklyTrips > 0 ? Math.round((trips / weeklyTrips) * 100) : 0;
                return (
                  <div key={v.variant_id} className="flex items-center gap-2">
                    <p className="text-[11px] text-slate-600 flex-1 truncate">{v.label}</p>
                    <div className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden flex-shrink-0">
                      <div className="h-full rounded-full" style={{ width: `${barPct}%`, backgroundColor: route.color, opacity: 0.7 }} />
                    </div>
                    <span className="text-[10px] text-slate-400 tabular-nums w-10 text-right flex-shrink-0">
                      {fmtTrips(trips)}/wk
                    </span>
                  </div>
                );
              })}
              {route.variants.length > 6 && (
                <p className="text-[10px] text-slate-400 text-center mt-1">
                  +{route.variants.length - 6} more variants
                </p>
              )}
            </div>

            <div className="flex items-center gap-1.5 mt-1 pt-2 border-t border-slate-50">
              <span className="text-[10px] text-slate-400">GO Transit GTFS data · read-only</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Custom route editor card ──────────────────────────────────────────────────

interface RouteState {
  editing: boolean;
  draft: CustomSchedule;
  savedSchedule: CustomSchedule | null;
  hasUnsaved: boolean;
  justSaved: boolean;
  activeDay: DayKey;
  scheduleMode: "banded" | "fixed";
}

function initRouteState(route: CustomRoute): RouteState {
  const base = route.schedule ? migrateLegacySchedule(route.schedule) : null;
  const draft = base ? cloneSchedule(base) : cloneSchedule(defaultBandedSchedule());
  return {
    editing: !base,
    draft,
    savedSchedule: base,
    hasUnsaved: false,
    justSaved: false,
    activeDay: "weekday",
    scheduleMode: base?.type === "fixed" ? "fixed" : "banded",
  };
}

function BandCard({ band, color, onChange, onDelete }: {
  band: ServiceBand; color: string;
  onChange: (b: ServiceBand) => void; onDelete: () => void;
}) {
  const { bg, text, dot } = bandRoleColor(band.startHour);
  function adjustHeadway(delta: number) {
    onChange({ ...band, headwayMins: Math.max(1, Math.min(120, band.headwayMins + delta)) });
  }
  return (
    <div className="rounded-xl border border-slate-100 overflow-hidden">
      <div className="h-0.5 w-full" style={{ backgroundColor: color }} />
      <div className={`${bg} px-3 py-2.5`}>
        <div className="flex items-center gap-2 mb-2">
          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${dot}`} />
          <input value={band.label} onChange={(e) => onChange({ ...band, label: e.target.value })}
            className={`flex-1 text-xs font-semibold ${text} bg-transparent border-none outline-none min-w-0`} />
          <button onClick={onDelete} className="text-slate-300 hover:text-red-400 transition-colors">
            <X className="w-3 h-3" />
          </button>
        </div>
        <div className="flex items-center gap-1.5 mb-2">
          <Clock className="w-3 h-3 text-slate-400 flex-shrink-0" />
          <input type="time"
            value={`${String(band.startHour).padStart(2,"0")}:${String(band.startMin).padStart(2,"0")}`}
            onChange={(e) => { const [h,m]=e.target.value.split(":").map(Number); onChange({...band,startHour:h??0,startMin:m??0}); }}
            className="text-xs text-slate-700 bg-white border border-slate-200 rounded-lg px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-[#007A33]/30 w-[84px]" />
          <span className="text-xs text-slate-400">–</span>
          <input type="time"
            value={`${String(band.endHour).padStart(2,"0")}:${String(band.endMin).padStart(2,"0")}`}
            onChange={(e) => { const [h,m]=e.target.value.split(":").map(Number); onChange({...band,endHour:h??0,endMin:m??0}); }}
            className="text-xs text-slate-700 bg-white border border-slate-200 rounded-lg px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-[#007A33]/30 w-[84px]" />
        </div>
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

function DayScheduleEditor({ daySchedule, routeColor, onChange }: {
  daySchedule: DaySchedule; routeColor: string; onChange: (d: DaySchedule) => void;
}) {
  function updateBand(id: string, u: ServiceBand) { onChange({ ...daySchedule, bands: daySchedule.bands.map((b) => b.id===id ? u : b) }); }
  function deleteBand(id: string) { onChange({ ...daySchedule, bands: daySchedule.bands.filter((b) => b.id!==id) }); }
  function addBand() { onChange({ ...daySchedule, bands: [...daySchedule.bands, { id: uuidv4(), label: "New window", startHour: 8, startMin: 0, endHour: 12, endMin: 0, headwayMins: 20 }] }); }
  function applyTemplate(key: string) {
    const tpl = TEMPLATES[key]; if (!tpl) return;
    onChange({ active: true, bands: tpl.bands.map((b) => ({ ...b, id: uuidv4() })) });
  }
  if (!daySchedule.active) return (
    <div className="flex flex-col items-center py-5 gap-2">
      <div className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center"><Calendar className="w-4 h-4 text-slate-300" /></div>
      <p className="text-xs text-slate-500 font-medium">No service this day</p>
      <Button size="sm" variant="outline" className="rounded-xl text-xs h-8"
        onClick={() => onChange({ ...daySchedule, active: true, bands: [] })}>
        <Plus className="w-3 h-3 mr-1.5" /> Activate service
      </Button>
    </div>
  );
  return (
    <div className="flex flex-col gap-2.5">
      {daySchedule.bands.length > 0 && <TimelineBar bands={daySchedule.bands} />}
      {daySchedule.bands.length > 0 && (
        <p className="text-[11px] text-slate-400 text-center -mt-0.5">
          <span className="font-semibold text-slate-600">{tripsPerDay(daySchedule.bands)}</span> trips/day
        </p>
      )}
      {daySchedule.bands.length === 0 && (
        <div className="flex flex-col items-center py-4 gap-1.5 text-slate-400">
          <Clock className="w-6 h-6 opacity-40" /><p className="text-xs font-medium">No windows yet</p>
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

function FixedDeparturesEditor({ departures, onChange }: { departures: string[]; onChange: (d: string[]) => void }) {
  const [newTime, setNewTime] = useState("");
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex gap-2">
        <input type="time" value={newTime} onChange={(e) => setNewTime(e.target.value)}
          className="flex-1 text-xs rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#007A33]/30 focus:border-[#007A33]" />
        <Button size="sm" className="rounded-xl bg-[#007A33] hover:bg-[#005f28] text-white px-3 h-9" disabled={!newTime}
          onClick={() => { if (!newTime || departures.includes(newTime)) return; onChange([...departures, newTime].sort()); setNewTime(""); }}>
          <Plus className="w-3 h-3" />
        </Button>
      </div>
      {departures.length === 0 ? (
        <div className="flex flex-col items-center py-4 text-slate-400">
          <Clock className="w-6 h-6 mb-1.5 opacity-40" /><p className="text-xs font-medium">No departures added</p>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap gap-1">
            {departures.map((t) => (
              <span key={t} className="inline-flex items-center gap-1 bg-slate-100 text-slate-700 text-xs font-medium rounded-lg px-2 py-1">
                {t}
                <button onClick={() => onChange(departures.filter((d) => d!==t))} className="text-slate-400 hover:text-red-500 transition-colors"><X className="w-2.5 h-2.5" /></button>
              </span>
            ))}
          </div>
          <div className="relative h-5 w-full">
            <div className="absolute top-1/2 left-0 right-0 h-px bg-slate-200" />
            {departures.map((t) => {
              const [h,m] = t.split(":").map(Number);
              const pct = ((h*60+m)/(24*60))*100;
              return <div key={t} className="absolute top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-[#007A33]" style={{ left:`${pct}%` }} title={t} />;
            })}
          </div>
          <p className="text-[10px] text-slate-400 text-center">
            {departures.length} departure{departures.length!==1?"s":""} · first {departures[0]}, last {departures[departures.length-1]}
          </p>
        </>
      )}
    </div>
  );
}

function CustomRouteCard({
  route, state, onPatch, onSave,
}: {
  route: CustomRoute;
  state: RouteState;
  onPatch: (p: Partial<RouteState>) => void;
  onSave: () => void;
}) {
  const Icon = route.type === "train" ? Train : Bus;
  const { editing, draft, savedSchedule, hasUnsaved, justSaved, activeDay, scheduleMode } = state;

  const displaySchedule = savedSchedule ? migrateLegacySchedule(savedSchedule) : null;
  const weekdayBands = displaySchedule?.type === "banded" ? (displaySchedule.weekday?.bands ?? []) : [];
  const satBands     = displaySchedule?.type === "banded" ? (displaySchedule.saturday?.bands ?? []) : [];
  const sunBands     = displaySchedule?.type === "banded" ? (displaySchedule.sunday?.bands ?? []) : [];
  const fixedDeps    = displaySchedule?.type === "fixed"  ? (displaySchedule.fixedDepartures ?? []) : [];

  const currentDaySchedule: DaySchedule = draft[activeDay] ?? { active: false, bands: [] };
  const copyTargets: DayKey[] = (["weekday","saturday","sunday"] as DayKey[]).filter((k) => k !== activeDay);

  return (
    <div className={`rounded-2xl border overflow-hidden transition-all ${editing ? "border-slate-300 shadow-sm" : "border-slate-100 hover:border-slate-200"}`}>
      {/* Header */}
      <div className="flex items-start gap-3 px-3.5 pt-3.5 pb-3">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center text-white flex-shrink-0 mt-0.5"
          style={{ backgroundColor: route.color }}>
          <Icon className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold text-slate-900 truncate">{route.name || "Unnamed"}</p>
            {hasUnsaved && <span className="text-[10px] font-semibold text-amber-600 bg-amber-50 border border-amber-100 rounded-md px-1.5 py-0.5 flex-shrink-0">Unsaved</span>}
            {justSaved && !hasUnsaved && (
              <span className="text-[10px] font-semibold text-emerald-600 bg-emerald-50 border border-emerald-100 rounded-md px-1.5 py-0.5 flex-shrink-0 flex items-center gap-1">
                <Check className="w-2.5 h-2.5" /> Saved
              </span>
            )}
          </div>

          {!displaySchedule ? (
            <div className="flex items-center gap-1 mt-1">
              <AlertCircle className="w-3 h-3 text-amber-400" />
              <span className="text-xs text-amber-600 font-medium">No schedule set</span>
            </div>
          ) : displaySchedule.type === "fixed" ? (
            <div className="mt-1.5">
              <div className="relative h-4 w-full">
                <div className="absolute top-1/2 left-0 right-0 h-px bg-slate-200" />
                {fixedDeps.map((t) => {
                  const [h,m] = t.split(":").map(Number);
                  const pct = ((h*60+m)/(24*60))*100;
                  return <div key={t} className="absolute top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full border border-white"
                    style={{ left:`${pct}%`, backgroundColor: route.color }} title={t} />;
                })}
              </div>
              <p className="text-[10px] text-slate-400 mt-0.5">{fixedDeps.length} fixed departure{fixedDeps.length!==1?"s":""}</p>
            </div>
          ) : (
            <div className="flex flex-col gap-1.5 mt-2">
              {([["weekday","Wkd",weekdayBands],["saturday","Sat",satBands],["sunday","Sun",sunBands]] as const).map(([key,label,bands]) => {
                const isActive = displaySchedule[key as DayKey]?.active;
                const trips = tripsPerDay(bands as ServiceBand[]);
                return (
                  <div key={key} className="flex items-center gap-2">
                    <span className="text-[10px] font-semibold text-slate-400 w-6 flex-shrink-0">{label}</span>
                    {!isActive || (bands as ServiceBand[]).length === 0 ? (
                      <span className="text-[10px] text-slate-300">no service</span>
                    ) : (
                      <>
                        <div className="flex-1"><TimelineBar bands={bands as ServiceBand[]} compact /></div>
                        <span className="text-[10px] font-semibold tabular-nums flex-shrink-0" style={{ color: route.color }}>{trips}t</span>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Pencil / close */}
        <button
          onClick={() => editing
            ? onPatch({ editing: false, draft: savedSchedule ? cloneSchedule(savedSchedule) : cloneSchedule(defaultBandedSchedule()), hasUnsaved: false, justSaved: false })
            : onPatch({ editing: true, justSaved: false })
          }
          className={`flex-shrink-0 mt-0.5 w-7 h-7 rounded-lg flex items-center justify-center transition-colors ${editing ? "bg-slate-100 hover:bg-slate-200 text-slate-500" : "hover:bg-slate-100 text-slate-400 hover:text-slate-600"}`}
        >
          {editing ? <ChevronUp className="w-4 h-4" /> : <Pencil className="w-3.5 h-3.5" />}
        </button>
      </div>

      {/* Editor */}
      {editing && (
        <div className="px-3.5 pb-4 pt-0 border-t border-slate-100">
          <div className="flex flex-col gap-3 pt-3">
            <div className="flex gap-1 bg-slate-100 rounded-xl p-1">
              {(["banded","fixed"] as const).map((m) => (
                <button key={m} onClick={() => onPatch({ scheduleMode: m, hasUnsaved: true, justSaved: false })}
                  className={`flex-1 text-xs font-medium py-1.5 rounded-lg transition-all ${scheduleMode===m ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>
                  {m==="banded" ? "Frequency bands" : "Fixed times"}
                </button>
              ))}
            </div>

            {scheduleMode === "banded" && (
              <div className="flex gap-1">
                {([ {key:"weekday",label:"Weekday"}, {key:"saturday",label:"Sat"}, {key:"sunday",label:"Sun"} ] as {key:DayKey;label:string}[]).map(({ key, label }) => {
                  const ds = draft[key];
                  const isActive = key === activeDay;
                  return (
                    <button key={key} onClick={() => onPatch({ activeDay: key })}
                      className={`flex-1 flex flex-col items-center rounded-xl py-1.5 text-xs font-medium transition-all ${isActive ? "bg-slate-900 text-white" : "text-slate-500 hover:bg-slate-100"}`}>
                      {label}
                      {!isActive && (
                        <span className={`text-[9px] mt-0.5 ${ds?.active ? "text-emerald-500" : "text-slate-300"}`}>
                          {ds?.active ? `${tripsPerDay(ds.bands??[])}t` : "off"}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}

            {scheduleMode === "banded" ? (
              <DayScheduleEditor key={activeDay} daySchedule={currentDaySchedule} routeColor={route.color}
                onChange={(ds) => onPatch({ draft: { ...draft, [activeDay]: ds }, hasUnsaved: true, justSaved: false })} />
            ) : (
              <FixedDeparturesEditor departures={draft.fixedDepartures ?? []}
                onChange={(d) => onPatch({ draft: { ...draft, fixedDepartures: d }, hasUnsaved: true, justSaved: false })} />
            )}

            {scheduleMode === "banded" && currentDaySchedule.active && (
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] text-slate-400 flex-shrink-0">Copy to</span>
                {copyTargets.map((t) => (
                  <button key={t}
                    onClick={() => {
                      const src = draft[activeDay];
                      if (!src) return;
                      onPatch({ draft: { ...draft, [t]: { ...src, bands: src.bands.map((b) => ({ ...b, id: uuidv4() })) } }, hasUnsaved: true, justSaved: false });
                    }}
                    className="flex items-center gap-1 text-[11px] font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg px-2 py-1 transition-colors">
                    <Copy className="w-2.5 h-2.5" />
                    {t==="saturday"?"Sat":t==="sunday"?"Sun":"Weekday"}
                  </button>
                ))}
              </div>
            )}

            <div className="flex gap-2">
              {savedSchedule && (
                <Button variant="outline" size="sm" className="rounded-xl h-9 text-xs"
                  onClick={() => onPatch({ editing: false, draft: cloneSchedule(savedSchedule), hasUnsaved: false, justSaved: false })}>
                  Cancel
                </Button>
              )}
              <Button size="sm" onClick={onSave}
                className={`flex-1 rounded-xl h-9 text-xs transition-all ${hasUnsaved ? "bg-[#007A33] hover:bg-[#005f28] text-white" : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200"}`}>
                {justSaved && !hasUnsaved ? <><Check className="w-3.5 h-3.5 mr-1" /> Saved</> : "Save schedule"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

interface SchedulePanelProps {
  routes: CustomRoute[];
  onSaveSchedule: (routeId: string, schedule: CustomSchedule) => void;
}

export default function SchedulePanel({ routes: customRoutes, onSaveSchedule }: SchedulePanelProps) {
  const [goRoutes, setGoRoutes] = useState<EnrichedRoute[]>([]);
  const [loadingGO, setLoadingGO] = useState(true);
  const [filter, setFilter] = useState<FilterTab>("all");
  const [search, setSearch] = useState("");
  const [routeStates, setRouteStates] = useState<Record<string, RouteState>>({});

  // Fetch GO Transit routes once
  useEffect(() => {
    fetch("/api/routes")
      .then((r) => r.json())
      .then((d) => { setGoRoutes(d.routes ?? []); setLoadingGO(false); })
      .catch(() => setLoadingGO(false));
  }, []);

  function getState(route: CustomRoute): RouteState {
    return routeStates[route.id] ?? initRouteState(route);
  }

  function patchState(id: string, partial: Partial<RouteState>) {
    setRouteStates((prev) => ({
      ...prev,
      [id]: { ...(prev[id] ?? initRouteState(customRoutes.find((r) => r.id === id)!)), ...partial },
    }));
  }

  function handleSave(route: CustomRoute) {
    const s = getState(route);
    const final: CustomSchedule = { ...s.draft, type: s.scheduleMode };
    onSaveSchedule(route.id, final);
    const saved = cloneSchedule(final);
    patchState(route.id, { savedSchedule: saved, draft: cloneSchedule(final), hasUnsaved: false, justSaved: true, editing: false });
  }

  // Filter GO routes
  const filteredGO = goRoutes.filter((r) => {
    const matchesFilter =
      filter === "all" ||
      filter === "custom" ? false :
      filter === "train" ? r.is_rail :
      filter === "bus"   ? !r.is_rail : true;
    const matchesSearch = !search ||
      r.long_name.toLowerCase().includes(search.toLowerCase()) ||
      r.short_name.toLowerCase().includes(search.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  // Filter custom routes
  const filteredCustom = customRoutes.filter((r) => {
    const matchesFilter =
      filter === "all" ||
      filter === "custom" ||
      (filter === "train" && r.type === "train") ||
      (filter === "bus"   && r.type === "bus");
    const matchesSearch = !search || r.name.toLowerCase().includes(search.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  const totalCount = filteredGO.length + filteredCustom.length;

  const TABS: { id: FilterTab; label: string }[] = [
    { id: "all",    label: "All" },
    { id: "train",  label: "Train" },
    { id: "bus",    label: "Bus" },
    { id: "custom", label: "My routes" },
  ];

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 pt-4 pb-3 border-b border-slate-100">
        <h2 className="font-semibold text-slate-900 text-base">Schedules</h2>
        <p className="text-xs text-slate-400 mt-0.5">
          {loadingGO ? "Loading…" : `${totalCount} route${totalCount !== 1 ? "s" : ""}`}
        </p>

        {/* Search */}
        <div className="relative mt-2.5">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
          <input
            type="text"
            placeholder="Search routes…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full text-xs pl-8 pr-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#007A33]/20 focus:border-[#007A33]"
          />
        </div>

        {/* Filter tabs */}
        <div className="flex gap-1 mt-2.5 bg-slate-100 rounded-xl p-1">
          {TABS.map((t) => (
            <button key={t.id} onClick={() => setFilter(t.id)}
              className={`flex-1 text-[11px] font-medium py-1 rounded-lg transition-all ${filter === t.id ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Route list */}
      <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2">

        {/* My custom routes */}
        {filteredCustom.length > 0 && (
          <>
            {filter !== "custom" && (
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide px-1 pt-1">
                My routes
              </p>
            )}
            {filteredCustom.map((route) => {
              const s = getState(route);
              return (
                <CustomRouteCard
                  key={route.id}
                  route={route}
                  state={s}
                  onPatch={(p) => patchState(route.id, p)}
                  onSave={() => handleSave(route)}
                />
              );
            })}
          </>
        )}

        {/* GO Transit routes */}
        {filter !== "custom" && (
          <>
            {filteredCustom.length > 0 && filteredGO.length > 0 && (
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide px-1 pt-2">
                GO Transit
              </p>
            )}
            {filteredGO.length === 0 && filteredCustom.length === 0 && (
              <div className="flex flex-col items-center py-10 text-slate-400 gap-2">
                <Search className="w-7 h-7 opacity-30" />
                <p className="text-sm font-medium">No routes found</p>
              </div>
            )}
            {loadingGO && filteredCustom.length === 0 && (
              <div className="flex flex-col gap-2">
                {[1,2,3].map((i) => (
                  <div key={i} className="h-16 rounded-2xl bg-slate-100 animate-pulse" />
                ))}
              </div>
            )}
            {filteredGO.map((route) => (
              <GORouteCard key={route.route_id} route={route} />
            ))}
          </>
        )}

        {/* Empty: custom only filter with no routes */}
        {filter === "custom" && filteredCustom.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 gap-3 text-center px-4">
            <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center">
              <Calendar className="w-6 h-6 text-slate-300" />
            </div>
            <p className="text-sm font-semibold text-slate-700">No custom routes yet</p>
            <p className="text-xs text-slate-400 leading-relaxed">
              Design a route in the <span className="font-medium text-slate-600">Design</span> tab first.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
