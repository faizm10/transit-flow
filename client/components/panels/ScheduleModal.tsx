"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import {
  X, Search, Train, Bus, Pencil, ChevronDown, Clock, AlertCircle,
  Loader2, CheckCircle, Lock,
} from "lucide-react";
import { toast } from "sonner";
import { GO_RAIL_LINES } from "@/lib/routeColors";
import {
  EnrichedRoute, CustomRoute, CustomSchedule, StopTimeEntry,
  defaultBandedSchedule,
} from "@/lib/gtfs";

// ─── Types ─────────────────────────────────────────────────────────────────

type FilterTab = "all" | "trains" | "buses" | "mine";

type SelectedRoute =
  | { kind: "go"; route: EnrichedRoute; variantId: string }
  | { kind: "custom"; route: CustomRoute };

interface StopRow {
  stopId: string;
  name: string;
  lat: number;
  lon: number;
  sequence: number;
  timeHHMM: string | null;
}

interface EditorState {
  rows: StopRow[];
  legDurations: number[];
  directionsStatus: "idle" | "loading" | "done" | "error";
  directionsError?: string;
  isDirty: boolean;
  isSaving: boolean;
}

// ─── Props ──────────────────────────────────────────────────────────────────

interface ScheduleModalProps {
  open: boolean;
  customRoutes: CustomRoute[];
  onSaveSchedule: (routeId: string, schedule: CustomSchedule) => void;
  onClose: () => void;
}

// ─── Time helpers ────────────────────────────────────────────────────────────

function hhmmToSec(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return (h ?? 0) * 3600 + (m ?? 0) * 60;
}

function secToHHMM(totalSec: number): string {
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

// ─── Directions API ──────────────────────────────────────────────────────────

function chunkStops(rows: StopRow[], size = 25): StopRow[][] {
  if (rows.length <= size) return [rows];
  const chunks: StopRow[][] = [];
  let i = 0;
  while (i < rows.length) {
    const end = Math.min(i + size, rows.length);
    chunks.push(rows.slice(i, end));
    if (end === rows.length) break;
    i = end - 1; // overlap by 1 so chunks share a boundary stop
  }
  return chunks;
}

async function fetchDirectionsChunk(stops: StopRow[], token: string): Promise<number[]> {
  const coords = stops.map((s) => `${s.lon},${s.lat}`).join(";");
  const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${coords}?access_token=${token}&overview=false`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Directions API ${res.status}`);
  const data = await res.json();
  const legs: { duration: number }[] = data.routes?.[0]?.legs ?? [];
  return legs.map((l) => l.duration);
}

// ─── Main component ──────────────────────────────────────────────────────────

export default function ScheduleModal({
  open, customRoutes, onSaveSchedule, onClose,
}: ScheduleModalProps) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterTab>("all");
  const [goRoutes, setGoRoutes] = useState<EnrichedRoute[]>([]);
  const [loadingGO, setLoadingGO] = useState(false);
  const [selected, setSelected] = useState<SelectedRoute | null>(null);
  const [editor, setEditor] = useState<EditorState | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // ── Fetch GO routes on open ──────────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    setLoadingGO(true);
    fetch("/api/routes")
      .then((r) => r.json())
      .then((d) => { setGoRoutes(d.routes ?? []); setLoadingGO(false); })
      .catch(() => setLoadingGO(false));
  }, [open]);

  // ── Keyboard: Escape closes ──────────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // ── Fetch leg durations ──────────────────────────────────────────────────
  const fetchLegDurations = useCallback(async (rows: StopRow[]) => {
    const token = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;
    if (!token || rows.length < 2) {
      setEditor((e) => e && { ...e, directionsStatus: "done" });
      return;
    }
    setEditor((e) => e && { ...e, directionsStatus: "loading", legDurations: [] });
    try {
      const chunks = chunkStops(rows, 25);
      const results = await Promise.all(chunks.map((c) => fetchDirectionsChunk(c, token)));
      const legDurations = results.flat();
      setEditor((e) => e && { ...e, directionsStatus: "done", legDurations });
    } catch (err) {
      setEditor((e) => e && {
        ...e,
        directionsStatus: "error",
        directionsError: err instanceof Error ? err.message : "Directions fetch failed",
      });
    }
  }, []);

  // ── Select a route ───────────────────────────────────────────────────────
  const handleSelectRoute = useCallback(async (sel: SelectedRoute) => {
    setSelected(sel);
    setEditor({ rows: [], legDurations: [], directionsStatus: "idle", isDirty: false, isSaving: false });

    let rows: StopRow[] = [];

    if (sel.kind === "go") {
      try {
        const res = await fetch(`/api/schedule?variant_id=${sel.variantId}`);
        const data = await res.json();
        rows = (data.stops ?? []).map((s: {
          stop_id?: string; stop_name: string; lat: number; lon: number; sequence: number; estimated_time: string;
        }) => ({
          stopId: s.stop_id ?? String(s.sequence),
          name: s.stop_name,
          lat: s.lat,
          lon: s.lon,
          sequence: s.sequence,
          timeHHMM: s.estimated_time,
        }));
      } catch {
        rows = [];
      }
    } else {
      // Custom route — derive initial times from existing timetable if present
      const existingTimes: Record<string, string> = {};
      if (sel.route.schedule?.type === "timetable" && sel.route.schedule.stopTimes) {
        for (const st of sel.route.schedule.stopTimes) {
          existingTimes[st.stopId] = secToHHMM(st.arrivalSec);
        }
      }
      rows = sel.route.stops.map((s) => ({
        stopId: s.id,
        name: s.name,
        lat: s.lat,
        lon: s.lon,
        sequence: s.sequence,
        timeHHMM: existingTimes[s.id] ?? (s.sequence === 0 ? "06:00" : null),
      }));
    }

    setEditor({ rows, legDurations: [], directionsStatus: "idle", isDirty: false, isSaving: false });
    fetchLegDurations(rows);
  }, [fetchLegDurations]);

  // ── Variant change ───────────────────────────────────────────────────────
  const handleVariantChange = useCallback((variantId: string) => {
    if (selected?.kind !== "go") return;
    handleSelectRoute({ kind: "go", route: selected.route, variantId });
  }, [selected, handleSelectRoute]);

  // ── Time edit + cascade ──────────────────────────────────────────────────
  const handleTimeEdit = useCallback((rowIndex: number, newHHMM: string) => {
    setEditor((prev) => {
      if (!prev) return prev;
      const rows = [...prev.rows];
      rows[rowIndex] = { ...rows[rowIndex], timeHHMM: newHHMM };

      if (prev.legDurations.length >= rows.length - 1 && prev.legDurations.length > 0) {
        let sec = hhmmToSec(newHHMM);
        for (let k = rowIndex + 1; k < rows.length; k++) {
          sec += prev.legDurations[k - 1] ?? 0;
          rows[k] = { ...rows[k], timeHHMM: secToHHMM(sec) };
        }
      }
      return { ...prev, rows, isDirty: true };
    });
  }, []);

  // ── Save ─────────────────────────────────────────────────────────────────
  const handleSave = useCallback(() => {
    if (selected?.kind !== "custom" || !editor) return;
    setEditor((e) => e && { ...e, isSaving: true });

    const stopTimes: StopTimeEntry[] = editor.rows
      .filter((r) => r.timeHHMM !== null)
      .map((r) => ({
        stopId: r.stopId,
        stopName: r.name,
        arrivalSec: hhmmToSec(r.timeHHMM!),
      }));

    const schedule: CustomSchedule = {
      ...(selected.route.schedule ?? defaultBandedSchedule()),
      type: "timetable",
      stopTimes,
      firstDepartureSec: stopTimes[0]?.arrivalSec ?? hhmmToSec("06:00"),
      direction: "one-way",
    };

    onSaveSchedule(selected.route.id, schedule);
    toast.success("Schedule saved");
    setEditor((e) => e && { ...e, isDirty: false, isSaving: false });
  }, [selected, editor, onSaveSchedule]);

  // ── Filtered route list ──────────────────────────────────────────────────
  const q = search.toLowerCase();
  const filteredGO = goRoutes.filter((r) => {
    if (filter === "trains" && !r.is_rail) return false;
    if (filter === "buses" && r.is_rail) return false;
    if (filter === "mine") return false;
    if (q) {
      const lineInfo = GO_RAIL_LINES[r.short_name];
      return (
        (lineInfo?.name ?? r.long_name).toLowerCase().includes(q) ||
        r.short_name.toLowerCase().includes(q)
      );
    }
    return true;
  });
  const filteredCustom = customRoutes.filter((r) => {
    if (filter === "trains" || filter === "buses") return false;
    if (q) return (r.name || "Custom route").toLowerCase().includes(q);
    return true;
  });

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      {/* Modal panel */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Schedule editor"
        className="relative z-10 flex w-full h-full max-w-7xl rounded-2xl bg-white shadow-2xl overflow-hidden"
        style={{ maxHeight: "92vh" }}
      >
        {/* ── Close button ──────────────────────────────────────────────── */}
        <button
          onClick={onClose}
          className="absolute top-3 right-3 z-20 w-8 h-8 rounded-xl flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
          aria-label="Close schedule editor"
        >
          <X className="w-4 h-4" />
        </button>

        {/* ── Left sidebar ──────────────────────────────────────────────── */}
        <div className="w-72 flex-shrink-0 border-r border-slate-100 flex flex-col bg-slate-50/50">
          {/* Header */}
          <div className="px-4 pt-5 pb-3">
            <h2 className="text-base font-semibold text-slate-900">Schedules</h2>
            <p className="text-xs text-slate-400 mt-0.5">Select a route to view or edit stop times</p>
          </div>

          {/* Search */}
          <div className="px-3 pb-2">
            <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-3 py-2 shadow-sm">
              <Search className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
              <input
                type="text"
                placeholder="Search routes…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="flex-1 text-xs bg-transparent outline-none text-slate-700 placeholder:text-slate-400"
              />
            </div>
          </div>

          {/* Filter tabs */}
          <div className="px-3 pb-2 flex gap-1">
            {(["all", "trains", "buses", "mine"] as FilterTab[]).map((tab) => (
              <button
                key={tab}
                onClick={() => setFilter(tab)}
                className={`flex-1 rounded-lg py-1 text-[10px] font-semibold transition-colors capitalize ${
                  filter === tab
                    ? "bg-slate-900 text-white"
                    : "text-slate-500 hover:bg-slate-100"
                }`}
              >
                {tab === "mine" ? "Mine" : tab === "all" ? "All" : tab === "trains" ? "Train" : "Bus"}
              </button>
            ))}
          </div>

          {/* Route list */}
          <div className="flex-1 overflow-y-auto px-2 pb-4">
            {loadingGO && (
              <div className="flex items-center gap-2 px-2 py-4 text-xs text-slate-400">
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading routes…
              </div>
            )}

            {/* GO routes */}
            {filteredGO.length > 0 && (
              <>
                {filter === "all" && (
                  <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide px-2 pt-3 pb-1">
                    GO Transit
                  </p>
                )}
                {filteredGO.map((route) => {
                  const lineInfo = GO_RAIL_LINES[route.short_name];
                  const color = lineInfo?.color ?? route.color;
                  const name = lineInfo?.name ?? route.long_name;
                  const defaultVariant = route.variants[0]?.variant_id ?? "";
                  const isSel =
                    selected?.kind === "go" && selected.route.route_id === route.route_id;
                  return (
                    <RouteListItem
                      key={route.route_id}
                      color={color}
                      icon={route.is_rail ? "train" : "bus"}
                      label={name}
                      sublabel={route.from_stop && route.to_stop ? `${route.from_stop} → ${route.to_stop}` : undefined}
                      shortName={!route.is_rail ? route.short_name : undefined}
                      isSelected={isSel}
                      onClick={() => handleSelectRoute({ kind: "go", route, variantId: defaultVariant })}
                    />
                  );
                })}
              </>
            )}

            {/* Custom routes */}
            {filteredCustom.length > 0 && (
              <>
                {filter === "all" && (
                  <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide px-2 pt-3 pb-1">
                    My routes
                  </p>
                )}
                {filteredCustom.map((route) => {
                  const isSel =
                    selected?.kind === "custom" && selected.route.id === route.id;
                  return (
                    <RouteListItem
                      key={route.id}
                      color={route.color}
                      icon={route.type === "train" ? "train" : "bus"}
                      label={route.name || "Custom route"}
                      sublabel={`${route.stops.length} stop${route.stops.length !== 1 ? "s" : ""}`}
                      isSelected={isSel}
                      onClick={() => handleSelectRoute({ kind: "custom", route })}
                    />
                  );
                })}
              </>
            )}

            {!loadingGO && filteredGO.length === 0 && filteredCustom.length === 0 && (
              <p className="text-xs text-slate-400 px-2 pt-4">No routes found.</p>
            )}
          </div>
        </div>

        {/* ── Right panel ───────────────────────────────────────────────── */}
        <div className="flex-1 flex flex-col min-w-0">
          {!selected ? (
            <EmptyState />
          ) : (
            <>
              {/* Header */}
              <EditorHeader
                selected={selected}
                onVariantChange={handleVariantChange}
                directionsStatus={editor?.directionsStatus ?? "idle"}
                directionsError={editor?.directionsError}
              />

              {/* Stop times table */}
              {editor && editor.rows.length > 0 ? (
                <StopTimesTable
                  rows={editor.rows}
                  directionsStatus={editor.directionsStatus}
                  isReadOnly={selected.kind === "go"}
                  onTimeEdit={handleTimeEdit}
                />
              ) : editor && editor.rows.length === 0 ? (
                <div className="flex-1 flex items-center justify-center text-sm text-slate-400">
                  <Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading stops…
                </div>
              ) : null}

              {/* Footer */}
              <EditorFooter
                selected={selected}
                editor={editor}
                onSave={handleSave}
              />
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

// ─── RouteListItem ────────────────────────────────────────────────────────────

function RouteListItem({
  color, icon, label, sublabel, shortName, isSelected, onClick,
}: {
  color: string; icon: "train" | "bus"; label: string; sublabel?: string;
  shortName?: string; isSelected: boolean; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-2.5 px-2 py-2 rounded-xl text-left transition-colors group ${
        isSelected
          ? "bg-slate-900 text-white"
          : "hover:bg-white hover:shadow-sm text-slate-700"
      }`}
    >
      <div
        className="w-8 h-8 rounded-lg flex-shrink-0 flex items-center justify-center text-white text-[10px] font-bold"
        style={{ backgroundColor: color }}
      >
        {shortName ? shortName.slice(0, 3) : icon === "train" ? <Train className="w-4 h-4" /> : <Bus className="w-4 h-4" />}
      </div>
      <div className="flex-1 min-w-0">
        <p className={`text-xs font-semibold truncate ${isSelected ? "text-white" : "text-slate-800"}`}>
          {label}
        </p>
        {sublabel && (
          <p className={`text-[10px] truncate mt-0.5 ${isSelected ? "text-white/60" : "text-slate-400"}`}>
            {sublabel}
          </p>
        )}
      </div>
    </button>
  );
}

// ─── EmptyState ───────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center px-8">
      <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center">
        <Clock className="w-5 h-5 text-slate-400" />
      </div>
      <div>
        <p className="text-sm font-semibold text-slate-700">Select a route</p>
        <p className="text-xs text-slate-400 mt-1 max-w-xs">
          Choose a GO Transit or custom route from the sidebar to view and edit its stop-by-stop schedule.
        </p>
      </div>
    </div>
  );
}

// ─── EditorHeader ─────────────────────────────────────────────────────────────

function EditorHeader({
  selected, onVariantChange, directionsStatus, directionsError,
}: {
  selected: SelectedRoute;
  onVariantChange: (variantId: string) => void;
  directionsStatus: EditorState["directionsStatus"];
  directionsError?: string;
}) {
  const isGO = selected.kind === "go";
  const route = selected.kind === "go" ? selected.route : selected.route;
  const lineInfo = isGO ? GO_RAIL_LINES[(route as EnrichedRoute).short_name] : null;
  const color = isGO
    ? (lineInfo?.color ?? (route as EnrichedRoute).color)
    : (route as CustomRoute).color;
  const name = isGO
    ? (lineInfo?.name ?? (route as EnrichedRoute).long_name)
    : ((route as CustomRoute).name || "Custom route");

  return (
    <div className="px-6 pt-5 pb-4 border-b border-slate-100 flex items-start justify-between gap-4">
      <div className="flex items-center gap-3 min-w-0">
        <div
          className="w-10 h-10 rounded-xl flex-shrink-0 flex items-center justify-center text-white font-bold text-sm"
          style={{ backgroundColor: color }}
        >
          {isGO ? (route as EnrichedRoute).short_name : (route as CustomRoute).type === "train" ? "TR" : "BU"}
        </div>
        <div className="min-w-0">
          <h3 className="text-base font-semibold text-slate-900 truncate">{name}</h3>
          {isGO && (route as EnrichedRoute).from_stop && (
            <p className="text-xs text-slate-400 mt-0.5 truncate">
              {(route as EnrichedRoute).from_stop} → {(route as EnrichedRoute).to_stop}
            </p>
          )}
        </div>
      </div>

      <div className="flex flex-col items-end gap-2 flex-shrink-0">
        {/* Variant picker (GO only) */}
        {isGO && (
          <div className="relative">
            <select
              value={(selected as { kind: "go"; route: EnrichedRoute; variantId: string }).variantId}
              onChange={(e) => onVariantChange(e.target.value)}
              className="text-xs rounded-xl border border-slate-200 bg-white pl-3 pr-7 py-1.5 text-slate-700 appearance-none focus:outline-none focus:ring-2 focus:ring-slate-200 max-w-[220px] truncate"
            >
              {[...(route as EnrichedRoute).variants]
                .sort((a, b) => (b.weekly_trip_count ?? 0) - (a.weekly_trip_count ?? 0))
                .map((v) => (
                  <option key={v.variant_id} value={v.variant_id}>
                    {v.label} · {(v.weekly_trip_count ?? v.trip_count).toLocaleString()} trips/wk
                  </option>
                ))}
            </select>
            <ChevronDown className="w-3 h-3 text-slate-400 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>
        )}

        {/* Directions status badge */}
        <DirectionsStatusBadge status={directionsStatus} error={directionsError} />
      </div>
    </div>
  );
}

function DirectionsStatusBadge({
  status, error,
}: {
  status: EditorState["directionsStatus"]; error?: string;
}) {
  if (status === "idle") return null;
  if (status === "loading") {
    return (
      <span className="flex items-center gap-1 text-[10px] text-slate-400">
        <Loader2 className="w-3 h-3 animate-spin" /> Calculating travel times…
      </span>
    );
  }
  if (status === "done") {
    return (
      <span className="flex items-center gap-1 text-[10px] text-emerald-600">
        <CheckCircle className="w-3 h-3" /> Travel times ready · edit a time to cascade
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1 text-[10px] text-amber-500" title={error}>
      <AlertCircle className="w-3 h-3" /> Travel times unavailable
    </span>
  );
}

// ─── StopTimesTable ───────────────────────────────────────────────────────────

function StopTimesTable({
  rows, directionsStatus, isReadOnly, onTimeEdit,
}: {
  rows: StopRow[];
  directionsStatus: EditorState["directionsStatus"];
  isReadOnly: boolean;
  onTimeEdit: (index: number, hhmm: string) => void;
}) {
  return (
    <div className="flex-1 overflow-y-auto">
      <table className="w-full text-sm border-collapse">
        <thead className="sticky top-0 bg-white border-b border-slate-100 z-10">
          <tr>
            <th className="text-left text-[10px] font-semibold text-slate-400 uppercase tracking-wide px-6 py-2.5 w-12">#</th>
            <th className="text-left text-[10px] font-semibold text-slate-400 uppercase tracking-wide px-3 py-2.5">Stop name</th>
            <th className="text-left text-[10px] font-semibold text-slate-400 uppercase tracking-wide px-3 py-2.5 w-36">
              Departure
              {isReadOnly && <Lock className="w-2.5 h-2.5 inline ml-1 text-slate-300" />}
            </th>
            <th className="w-8" />
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <StopRow
              key={row.stopId + i}
              row={row}
              index={i}
              isReadOnly={isReadOnly}
              directionsLoading={directionsStatus === "loading"}
              onTimeEdit={onTimeEdit}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── StopRow ──────────────────────────────────────────────────────────────────

function StopRow({
  row, index, isReadOnly, directionsLoading, onTimeEdit,
}: {
  row: StopRow; index: number; isReadOnly: boolean;
  directionsLoading: boolean;
  onTimeEdit: (index: number, hhmm: string) => void;
}) {
  const isFirst = index === 0;

  return (
    <tr className="group border-b border-slate-50 hover:bg-slate-50/60 transition-colors">
      {/* Stop number */}
      <td className="px-6 py-2.5 text-xs font-medium text-slate-400 tabular-nums">
        {index + 1}
      </td>

      {/* Stop name */}
      <td className="px-3 py-2.5">
        <div className="flex items-center gap-2">
          {/* Connector line */}
          <div className="flex flex-col items-center w-4 flex-shrink-0">
            <div className={`w-2.5 h-2.5 rounded-full border-2 ${isFirst ? "border-slate-700 bg-white" : "border-slate-300 bg-white"}`} />
          </div>
          <span className="text-sm text-slate-800">{row.name}</span>
        </div>
      </td>

      {/* Time input */}
      <td className="px-3 py-2.5">
        {isReadOnly ? (
          <span className={`text-sm tabular-nums font-mono ${
            directionsLoading ? "text-slate-300 animate-pulse" : "text-slate-500"
          }`}>
            {row.timeHHMM ?? "—"}
          </span>
        ) : (
          <input
            type="time"
            value={row.timeHHMM ?? ""}
            onChange={(e) => onTimeEdit(index, e.target.value)}
            className={`text-sm font-mono tabular-nums rounded-lg border px-2 py-1 w-28 outline-none transition-colors focus:ring-2 focus:ring-[#007A33]/20 focus:border-[#007A33] ${
              directionsLoading
                ? "border-slate-100 text-slate-300 animate-pulse"
                : "border-slate-200 text-slate-800"
            }`}
          />
        )}
      </td>

      <td />
    </tr>
  );
}

// ─── EditorFooter ─────────────────────────────────────────────────────────────

function EditorFooter({
  selected, editor, onSave,
}: {
  selected: SelectedRoute;
  editor: EditorState | null;
  onSave: () => void;
}) {
  if (selected.kind === "go") {
    return (
      <div className="px-6 py-3 border-t border-slate-100 bg-slate-50/50 flex items-center gap-2 text-[11px] text-slate-400">
        <Lock className="w-3 h-3" />
        GO Transit · read-only · times are estimates based on stop sequences
      </div>
    );
  }

  const hasTimetable = selected.route.schedule?.type === "timetable";

  return (
    <div className="px-6 py-3 border-t border-slate-100 flex items-center justify-between gap-3">
      <div className="flex items-center gap-3 text-xs text-slate-400">
        {editor?.isDirty && (
          <span className="text-amber-600 font-medium flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 inline-block" />
            Unsaved changes
          </span>
        )}
        {!editor?.isDirty && hasTimetable && (
          <span className="text-emerald-600 flex items-center gap-1">
            <CheckCircle className="w-3 h-3" /> Timetable saved
          </span>
        )}
        {editor?.directionsStatus === "loading" && (
          <span className="flex items-center gap-1">
            <Loader2 className="w-3 h-3 animate-spin" /> Fetching travel times…
          </span>
        )}
      </div>
      <button
        onClick={onSave}
        disabled={!editor?.isDirty || editor?.isSaving}
        className="flex items-center gap-1.5 rounded-xl bg-[#007A33] px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#005f28] disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {editor?.isSaving ? (
          <><Loader2 className="w-3 h-3 animate-spin" /> Saving…</>
        ) : (
          "Save schedule"
        )}
      </button>
    </div>
  );
}
