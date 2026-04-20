"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { createPortal } from "react-dom";
import {
  X, Search, Train, Bus, ChevronDown, Clock, AlertCircle,
  Loader2, CheckCircle, Lock, CalendarDays, TableProperties,
  ArrowRight, ArrowLeft, MapPin, Plus, Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { GO_RAIL_LINES } from "@/lib/routeColors";
import {
  EnrichedRoute, CustomRoute, CustomSchedule, CustomTimetableTrip, StopTimeEntry,
  defaultBandedSchedule,
} from "@/lib/gtfs";

// ─── Types ─────────────────────────────────────────────────────────────────

type FilterTab = "all" | "trains" | "buses" | "mine";
type GoViewMode = "departures" | "stoptimes";

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

interface DepartureDestination {
  headsign: string;
  departures: { time: string }[];
}

interface DepartureDirection {
  directionId: number;
  /** Dominant (most-trips) headsign for this direction */
  headsign: string;
  /** Per-destination breakdown, sorted most-trips-first */
  destinations: DepartureDestination[];
  /** All departures tagged with their individual headsign */
  departures: { time: string; headsign: string }[];
}

interface DeparturesState {
  status: "idle" | "loading" | "done" | "error";
  directions: DepartureDirection[];
  availableDays: number[];
  error?: string;
  /** true only on the very first load (building the 3M-line index) */
  isFirstLoad: boolean;
}

// ─── Props ──────────────────────────────────────────────────────────────────

interface ScheduleModalProps {
  open: boolean;
  customRoutes: CustomRoute[];
  onSaveSchedule: (routeId: string, schedule: CustomSchedule) => void;
  onClose: () => void;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DAY_FULL   = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

// ─── Custom schedule departure computation ────────────────────────────────────

/**
 * Derive a flat list of "HH:MM" departure times from a CustomSchedule for
 * the given day of week (0=Sun … 6=Sat).  Works for banded, fixed, timetable
 * and legacy frequency types.
 */
function computeCustomDepartures(schedule: CustomSchedule | undefined, dayOfWeek: number): string[] {
  if (!schedule) return [];

  // fixed type — explicit departure list
  if (schedule.type === "fixed" && schedule.fixedDepartures?.length) {
    return [...schedule.fixedDepartures].sort();
  }

  // timetable type — one trip whose first stop time is the departure
  if (schedule.type === "timetable") {
    if (schedule.timetableTrips) {
      return [...schedule.timetableTrips]
        .sort((a, b) => a.departureSec - b.departureSec)
        .map((trip) => secToHHMM(trip.departureSec));
    }
    if (schedule.firstDepartureSec !== undefined) {
      return [secToHHMM(schedule.firstDepartureSec)];
    }
    const first = schedule.stopTimes?.[0];
    return first ? [secToHHMM(first.arrivalSec)] : [];
  }

  // banded type — expand each band's headway into individual trips
  if (schedule.type === "banded") {
    const daySchedule =
      dayOfWeek === 0 ? schedule.sunday
      : dayOfWeek === 6 ? schedule.saturday
      : schedule.weekday;
    if (!daySchedule?.active || !daySchedule.bands.length) return [];

    const times: string[] = [];
    for (const band of daySchedule.bands) {
      let sec = band.startHour * 3600 + band.startMin * 60;
      const endSec = band.endHour * 3600 + band.endMin * 60;
      const step = (band.headwayMins || 30) * 60;
      while (sec <= endSec) {
        times.push(secToHHMM(sec));
        sec += step;
      }
    }
    // de-dupe and sort
    return [...new Set(times)].sort();
  }

  // legacy frequency type
  if (schedule.type === "frequency") {
    const freq =
      dayOfWeek === 0 || dayOfWeek === 6
        ? schedule.frequency?.weekend
        : schedule.frequency?.weekday;
    if (!freq) return [];
    const times: string[] = [];
    let sec = hhmmToSec(freq.start);
    const endSec = hhmmToSec(freq.end);
    const step = (freq.interval || 30) * 60;
    while (sec <= endSec) {
      times.push(secToHHMM(sec));
      sec += step;
    }
    return times;
  }

  return [];
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

/** "09:03" → "9:03 AM" */
function toDisplayTime(hhmm: string): string {
  const [hStr, mStr] = hhmm.split(":");
  let h = parseInt(hStr ?? "0");
  const m = mStr ?? "00";
  if (h >= 24) h -= 24; // overnight wrap
  const ampm = h < 12 ? "AM" : "PM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${m} ${ampm}`;
}

function makeTimetableTripId(departureSec: number): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `trip-${departureSec}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function sortTimetableTrips(trips: CustomTimetableTrip[]): CustomTimetableTrip[] {
  return [...trips].sort((a, b) => a.departureSec - b.departureSec);
}

function blankRowsForRoute(route: CustomRoute): StopRow[] {
  return route.stops.map((s) => ({
    stopId: s.id,
    name: s.name,
    lat: s.lat,
    lon: s.lon,
    sequence: s.sequence,
    timeHHMM: null,
  }));
}

function rowsToStopTimes(rows: StopRow[]): StopTimeEntry[] {
  return rows
    .filter((row) => row.timeHHMM !== null)
    .map((row) => ({
      stopId: row.stopId,
      stopName: row.name,
      arrivalSec: hhmmToSec(row.timeHHMM!),
    }));
}

function rowsForTimetableTrip(route: CustomRoute, trip: CustomTimetableTrip): StopRow[] {
  const timeByStop = new Map(trip.stopTimes.map((st) => [st.stopId, st.arrivalSec]));
  return route.stops.map((s, index) => ({
    stopId: s.id,
    name: s.name,
    lat: s.lat,
    lon: s.lon,
    sequence: s.sequence,
    timeHHMM: timeByStop.has(s.id)
      ? secToHHMM(timeByStop.get(s.id)!)
      : index === 0
        ? secToHHMM(trip.departureSec)
        : null,
  }));
}

function cascadeRowsFromIndex(
  rows: StopRow[],
  rowIndex: number,
  newHHMM: string,
  legDurations: number[],
): StopRow[] {
  if (!rows[rowIndex]) return rows;
  const nextRows = [...rows];
  nextRows[rowIndex] = { ...nextRows[rowIndex], timeHHMM: newHHMM };
  if (legDurations.length >= nextRows.length - 1 && legDurations.length > 0) {
    let sec = hhmmToSec(newHHMM);
    for (let k = rowIndex + 1; k < nextRows.length; k++) {
      sec += legDurations[k - 1] ?? 0;
      nextRows[k] = { ...nextRows[k], timeHHMM: secToHHMM(sec) };
    }
  }
  return nextRows;
}

function shiftRowsToDeparture(rows: StopRow[], nextDepartureSec: number): StopRow[] {
  const firstTime = rows[0]?.timeHHMM;
  if (!firstTime) {
    return rows.map((row, index) => ({
      ...row,
      timeHHMM: index === 0 ? secToHHMM(nextDepartureSec) : row.timeHHMM,
    }));
  }
  const delta = nextDepartureSec - hhmmToSec(firstTime);
  return rows.map((row, index) => ({
    ...row,
    timeHHMM: row.timeHHMM
      ? secToHHMM(hhmmToSec(row.timeHHMM) + delta)
      : index === 0
        ? secToHHMM(nextDepartureSec)
        : null,
  }));
}

function normalizeTimetableTrips(route: CustomRoute): CustomTimetableTrip[] {
  const schedule = route.schedule;
  if (!schedule) return [];

  if (schedule.type === "timetable") {
    if (schedule.timetableTrips) {
      return sortTimetableTrips(
        schedule.timetableTrips.map((trip) => ({
          ...trip,
          departureSec: trip.departureSec ?? trip.stopTimes[0]?.arrivalSec ?? 0,
          stopTimes: trip.stopTimes ?? [],
        })),
      );
    }
    if (schedule.stopTimes?.length) {
      const departureSec = schedule.firstDepartureSec ?? schedule.stopTimes[0]?.arrivalSec ?? hhmmToSec("06:00");
      return [{
        id: makeTimetableTripId(departureSec),
        departureSec,
        stopTimes: schedule.stopTimes,
      }];
    }
    return [];
  }

  if (schedule.type === "fixed" && schedule.fixedDepartures?.length) {
    const firstStop = route.stops[0];
    return sortTimetableTrips(schedule.fixedDepartures.map((departure, index) => {
      const departureSec = hhmmToSec(departure);
      return {
        id: `fixed-${departureSec}-${index}`,
        departureSec,
        stopTimes: firstStop
          ? [{
              stopId: firstStop.id,
              stopName: firstStop.name,
              arrivalSec: departureSec,
            }]
          : [],
      };
    }));
  }

  return [];
}

// ─── Directions API helpers ───────────────────────────────────────────────────

function chunkStops(rows: StopRow[], size = 25): StopRow[][] {
  if (rows.length <= size) return [rows];
  const chunks: StopRow[][] = [];
  let i = 0;
  while (i < rows.length) {
    const end = Math.min(i + size, rows.length);
    chunks.push(rows.slice(i, end));
    if (end === rows.length) break;
    i = end - 1;
  }
  return chunks;
}

async function fetchDirectionsChunk(stops: StopRow[], token: string): Promise<number[]> {
  const coords = stops.map((s) => `${s.lon},${s.lat}`).join(";");
  const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${coords}?access_token=${token}&overview=false`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Directions API ${res.status}`);
  const data = await res.json();
  return (data.routes?.[0]?.legs ?? []).map((l: { duration: number }) => l.duration);
}

// ─── Main component ──────────────────────────────────────────────────────────

export default function ScheduleModal({
  open, customRoutes, onSaveSchedule, onClose,
}: ScheduleModalProps) {
  // ── Route list state ─────────────────────────────────────────────────────
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterTab>("all");
  const [goRoutes, setGoRoutes] = useState<EnrichedRoute[]>([]);
  const [loadingGO, setLoadingGO] = useState(false);

  // ── Selection state ──────────────────────────────────────────────────────
  const [selected, setSelected] = useState<SelectedRoute | null>(null);

  // ── GO route view mode ───────────────────────────────────────────────────
  const [goViewMode, setGoViewMode] = useState<GoViewMode>("departures");

  // ── Departures state (GO routes only) ────────────────────────────────────
  const [deptDay, setDeptDay] = useState(1); // 1 = Monday
  const [deptDirection, setDeptDirection] = useState<number>(0);
  const [deptState, setDeptState] = useState<DeparturesState>({
    status: "idle", directions: [], availableDays: [], isFirstLoad: true,
  });

  // ── Selected departure time (for stop-times tab offset) ──────────────────
  const [selectedDeparture, setSelectedDeparture] = useState<string | null>(null);

  // ── Selected destination / sub-route within a direction ──────────────────
  // e.g. "Kitchener GO" vs "Georgetown GO" on the Kitchener line
  const [selectedDestination, setSelectedDestination] = useState<string | null>(null);

  // ── Stop-times editor state ──────────────────────────────────────────────
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [customTrips, setCustomTrips] = useState<CustomTimetableTrip[]>([]);
  const [selectedCustomTripId, setSelectedCustomTripId] = useState<string | null>(null);

  const panelRef = useRef<HTMLDivElement>(null);
  const hasFetchedIndex = useRef(false);

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

  // ── Auto-set first departure when departures load ─────────────────────────
  useEffect(() => {
    if (deptState.status !== "done") return;
    const dir = deptState.directions.find((d) => d.directionId === deptDirection);
    const dest = selectedDestination
      ? dir?.destinations.find((d) => d.headsign === selectedDestination)
      : dir?.destinations[0]; // dominant destination
    const firstTime = dest?.departures[0]?.time ?? dir?.departures[0]?.time;
    if (firstTime) setSelectedDeparture(firstTime);
  }, [deptState.status, deptDirection, selectedDestination]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Fetch departures for a GO route ──────────────────────────────────────
  const fetchDepartures = useCallback(async (shortName: string, day: number) => {
    const isFirst = !hasFetchedIndex.current;
    setDeptState((prev) => ({
      ...prev, status: "loading", isFirstLoad: isFirst,
    }));
    try {
      const res = await fetch(`/api/departures?route=${shortName}&day=${day}`);
      const data = await res.json();
      hasFetchedIndex.current = true;
      const directions: DepartureDirection[] = data.directions ?? [];
      setDeptState({
        status: "done",
        directions,
        availableDays: data.availableDays ?? [],
        isFirstLoad: false,
      });
      // Default to first direction available
      if (directions.length > 0) {
        setDeptDirection(directions[0].directionId);
      }
    } catch {
      setDeptState((prev) => ({
        ...prev, status: "error", error: "Failed to load departures", isFirstLoad: false,
      }));
    }
  }, []);

  // ── Fetch leg durations (Mapbox Directions) ───────────────────────────────
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
      setEditor((e) => e && { ...e, directionsStatus: "done", legDurations: results.flat() });
    } catch {
      setEditor((e) => e && { ...e, directionsStatus: "error" });
    }
  }, []);

  // ── Select a route ────────────────────────────────────────────────────────
  const handleSelectRoute = useCallback(async (sel: SelectedRoute) => {
    setSelected(sel);
    setEditor(null);
    setSelectedDeparture(null);
    setSelectedDestination(null);
    setCustomTrips([]);
    setSelectedCustomTripId(null);

    if (sel.kind === "go") {
      setGoViewMode("departures");
      fetchDepartures(sel.route.short_name, deptDay);
    } else {
      setEditor({ rows: [], legDurations: [], directionsStatus: "idle", isDirty: false, isSaving: false });

      const trips = normalizeTimetableTrips(sel.route);
      const activeTrip = trips[0] ?? null;
      const rows = activeTrip ? rowsForTimetableTrip(sel.route, activeTrip) : blankRowsForRoute(sel.route);
      setCustomTrips(trips);
      setSelectedCustomTripId(activeTrip?.id ?? null);
      setEditor({ rows, legDurations: [], directionsStatus: "idle", isDirty: false, isSaving: false });
      fetchLegDurations(rows);
    }
  }, [deptDay, fetchDepartures, fetchLegDurations]);

  // ── Variant change (GO only) ──────────────────────────────────────────────
  const handleVariantChange = useCallback(async (variantId: string) => {
    if (selected?.kind !== "go") return;
    const newSel: SelectedRoute = { kind: "go", route: selected.route, variantId };
    setSelected(newSel);
    setSelectedDeparture(null);
    if (goViewMode === "stoptimes") {
      setEditor({ rows: [], legDurations: [], directionsStatus: "idle", isDirty: false, isSaving: false });
      try {
        const res = await fetch(`/api/schedule?variant_id=${variantId}`);
        const data = await res.json();
        const rows: StopRow[] = (data.stops ?? []).map((s: {
          stop_id?: string; stop_name: string; lat: number; lon: number; sequence: number; estimated_time: string;
        }) => ({
          stopId: s.stop_id ?? String(s.sequence), name: s.stop_name,
          lat: s.lat, lon: s.lon, sequence: s.sequence, timeHHMM: s.estimated_time,
        }));
        setEditor({ rows, legDurations: [], directionsStatus: "idle", isDirty: false, isSaving: false });
        fetchLegDurations(rows);
      } catch { /* ignore */ }
    }
  }, [selected, goViewMode, fetchLegDurations]);

  // ── Switch GO view mode ───────────────────────────────────────────────────
  const handleGoViewModeChange = useCallback(async (mode: GoViewMode) => {
    setGoViewMode(mode);
    if (mode === "departures" && selected?.kind === "go") {
      if (deptState.status !== "done") {
        fetchDepartures(selected.route.short_name, deptDay);
      }
      return;
    }
    if (mode === "stoptimes" && selected?.kind === "go") {
      // Pick the best-matching variant for the currently selected destination
      let variantId = (selected as { kind: "go"; variantId: string }).variantId;
      if (selectedDestination) {
        const dest = selectedDestination.toLowerCase().replace(/\s+go\b/g, "").trim();
        const match = selected.route.variants.find((v) =>
          v.direction_id === deptDirection &&
          (v.label.toLowerCase().includes(dest) || dest.includes(v.label.toLowerCase().replace(/.*to\s*/i, "")))
        );
        if (match) {
          variantId = match.variant_id;
          setSelected({ kind: "go", route: selected.route, variantId });
        }
      }

      if (!editor) {
        setEditor({ rows: [], legDurations: [], directionsStatus: "idle", isDirty: false, isSaving: false });
        try {
          const res = await fetch(`/api/schedule?variant_id=${variantId}`);
          const data = await res.json();
          const rows: StopRow[] = (data.stops ?? []).map((s: {
            stop_id?: string; stop_name: string; lat: number; lon: number; sequence: number; estimated_time: string;
          }) => ({
            stopId: s.stop_id ?? String(s.sequence), name: s.stop_name,
            lat: s.lat, lon: s.lon, sequence: s.sequence, timeHHMM: s.estimated_time,
          }));
          setEditor({ rows, legDurations: [], directionsStatus: "idle", isDirty: false, isSaving: false });
          fetchLegDurations(rows);
        } catch { /* ignore */ }
      }
    }
  }, [selected, editor, deptState.status, deptDay, deptDirection, selectedDestination, fetchDepartures, fetchLegDurations]);

  // ── Day change ────────────────────────────────────────────────────────────
  const handleDayChange = useCallback((day: number) => {
    setDeptDay(day);
    setSelectedDeparture(null);
    setSelectedDestination(null);
    if (selected?.kind === "go") {
      fetchDepartures(selected.route.short_name, day);
    }
  }, [selected, fetchDepartures]);

  // ── Direction change ──────────────────────────────────────────────────────
  const handleDirectionChange = useCallback((dir: number) => {
    setDeptDirection(dir);
    setSelectedDeparture(null);
    setSelectedDestination(null);
  }, []);

  const selectedCustomTrip = useMemo(
    () => customTrips.find((trip) => trip.id === selectedCustomTripId) ?? null,
    [customTrips, selectedCustomTripId],
  );

  useEffect(() => {
    if (selected?.kind !== "custom" || !editor || !selectedCustomTripId) return;
    if (
      editor.directionsStatus !== "done" ||
      editor.legDurations.length === 0 ||
      editor.legDurations.length < editor.rows.length - 1
    ) return;
    const firstTime = editor.rows[0]?.timeHHMM;
    const needsCascade = editor.rows.slice(1).some((row) => row.timeHHMM === null);
    if (!firstTime || !needsCascade) return;

    const rows = cascadeRowsFromIndex(editor.rows, 0, firstTime, editor.legDurations);
    setEditor({ ...editor, rows });
    setCustomTrips((prev) => sortTimetableTrips(prev.map((trip) => (
      trip.id === selectedCustomTripId
        ? { ...trip, stopTimes: rowsToStopTimes(rows) }
        : trip
    ))));
  }, [editor, selected, selectedCustomTripId]);

  // ── Time edit + cascade ───────────────────────────────────────────────────
  const handleTimeEdit = useCallback((rowIndex: number, newHHMM: string) => {
    if (!editor) return;
    const rows = cascadeRowsFromIndex(editor.rows, rowIndex, newHHMM, editor.legDurations);
    setEditor({ ...editor, rows, isDirty: true });

    if (selected?.kind === "custom" && selectedCustomTripId) {
      const stopTimes = rowsToStopTimes(rows);
      const departureSec = stopTimes[0]?.arrivalSec ?? hhmmToSec(newHHMM);
      setCustomTrips((prev) => sortTimetableTrips(prev.map((trip) => (
        trip.id === selectedCustomTripId
          ? { ...trip, departureSec, stopTimes }
          : trip
      ))));
    }
  }, [editor, selected, selectedCustomTripId]);

  const handleCustomSelectTrip = useCallback((tripId: string) => {
    if (selected?.kind !== "custom" || !editor) return;
    const trip = customTrips.find((t) => t.id === tripId);
    if (!trip) return;
    setSelectedCustomTripId(trip.id);
    setEditor({
      ...editor,
      rows: rowsForTimetableTrip(selected.route, trip),
      isSaving: false,
    });
  }, [customTrips, editor, selected]);

  const handleCustomAddDeparture = useCallback((time: string) => {
    if (selected?.kind !== "custom") return;
    if (selected.route.stops.length === 0) {
      toast.error("Add stops before scheduling this route");
      return;
    }
    const departureSec = hhmmToSec(time);
    if (customTrips.some((trip) => trip.departureSec === departureSec)) {
      toast.error("That departure time already exists");
      return;
    }

    const sourceRows = editor?.rows.length
      ? editor.rows
      : blankRowsForRoute(selected.route);
    const shiftedRows = selectedCustomTrip
      ? shiftRowsToDeparture(sourceRows, departureSec)
      : cascadeRowsFromIndex(sourceRows, 0, time, editor?.legDurations ?? []);
    const trip: CustomTimetableTrip = {
      id: makeTimetableTripId(departureSec),
      departureSec,
      stopTimes: rowsToStopTimes(shiftedRows),
    };

    setCustomTrips((prev) => sortTimetableTrips([...prev, trip]));
    setSelectedCustomTripId(trip.id);
    setEditor({
      rows: shiftedRows,
      legDurations: editor?.legDurations ?? [],
      directionsStatus: editor?.directionsStatus ?? "idle",
      isDirty: true,
      isSaving: false,
    });
    toast.success("Timing added");
  }, [customTrips, editor, selected, selectedCustomTrip]);

  const handleCustomUpdateDeparture = useCallback((time: string) => {
    if (!time) return;
    if (selected?.kind !== "custom" || !selectedCustomTrip || !editor) return;
    const departureSec = hhmmToSec(time);
    if (customTrips.some((trip) => trip.id !== selectedCustomTrip.id && trip.departureSec === departureSec)) {
      toast.error("That departure time already exists");
      return;
    }

    const shiftedRows = shiftRowsToDeparture(editor.rows, departureSec);
    const updatedTrip: CustomTimetableTrip = {
      ...selectedCustomTrip,
      departureSec,
      stopTimes: rowsToStopTimes(shiftedRows),
    };
    setCustomTrips((prev) => sortTimetableTrips(prev.map((trip) => (
      trip.id === selectedCustomTrip.id ? updatedTrip : trip
    ))));
    setEditor({ ...editor, rows: shiftedRows, isDirty: true });
  }, [customTrips, editor, selected, selectedCustomTrip]);

  const handleCustomDeleteDeparture = useCallback((tripId: string) => {
    if (selected?.kind !== "custom" || !editor) return;
    const nextTrips = sortTimetableTrips(customTrips.filter((trip) => trip.id !== tripId));
    const nextTrip = tripId === selectedCustomTripId
      ? nextTrips.find((trip) => trip.departureSec >= (selectedCustomTrip?.departureSec ?? 0)) ?? nextTrips[0] ?? null
      : selectedCustomTrip;
    const nextRows = nextTrip ? rowsForTimetableTrip(selected.route, nextTrip) : blankRowsForRoute(selected.route);

    setCustomTrips(nextTrips);
    setSelectedCustomTripId(nextTrip?.id ?? null);
    setEditor({ ...editor, rows: nextRows, isDirty: true, isSaving: false });
    toast.success("Timing deleted");
  }, [customTrips, editor, selected, selectedCustomTrip, selectedCustomTripId]);

  // ── Save ──────────────────────────────────────────────────────────────────
  const handleSave = useCallback(() => {
    if (selected?.kind !== "custom" || !editor) return;
    setEditor((e) => e && { ...e, isSaving: true });
    const mergedTrips = sortTimetableTrips(customTrips.map((trip) => {
      if (trip.id !== selectedCustomTripId) return trip;
      const stopTimes = rowsToStopTimes(editor.rows);
      return {
        ...trip,
        departureSec: stopTimes[0]?.arrivalSec ?? trip.departureSec,
        stopTimes,
      };
    }));
    const firstTrip = mergedTrips[0];
    const schedule: CustomSchedule = {
      ...(selected.route.schedule ?? defaultBandedSchedule()),
      type: "timetable",
      timetableTrips: mergedTrips,
      fixedDepartures: mergedTrips.map((trip) => secToHHMM(trip.departureSec)),
      stopTimes: firstTrip?.stopTimes ?? [],
      firstDepartureSec: firstTrip?.departureSec,
      direction: "one-way",
    };
    onSaveSchedule(selected.route.id, schedule);
    setCustomTrips(mergedTrips);
    setSelected({ kind: "custom", route: { ...selected.route, schedule } });
    setEditor((e) => e && { ...e, isDirty: false, isSaving: false });
  }, [customTrips, selected, editor, onSaveSchedule, selectedCustomTripId]);

  // ── Departure-offset rows for GO stop-times view ──────────────────────────
  // When a departure time is selected in the dropdown, shift all stop times
  // by the difference (selectedDeparture - firstStopBaseTime).
  const shiftedRows = useMemo<StopRow[]>(() => {
    if (!editor || !editor.rows.length) return editor?.rows ?? [];
    if (!selectedDeparture) return editor.rows;
    const baseFirst = editor.rows[0]?.timeHHMM;
    if (!baseFirst) return editor.rows;
    const offset = hhmmToSec(selectedDeparture) - hhmmToSec(baseFirst);
    if (offset === 0) return editor.rows;
    return editor.rows.map((row) => ({
      ...row,
      timeHHMM: row.timeHHMM ? secToHHMM(hhmmToSec(row.timeHHMM) + offset) : null,
    }));
  }, [editor, selectedDeparture]);

  // ── Current direction object ──────────────────────────────────────────────
  const currentDir = useMemo(
    () => deptState.directions.find((d) => d.directionId === deptDirection) ?? null,
    [deptState.directions, deptDirection],
  );

  // ── Departures for the stop-times tab dropdown (filtered by destination) ──
  const currentDirDepartures = useMemo(() => {
    if (!currentDir) return [];
    if (selectedDestination) {
      return currentDir.destinations
        .find((d) => d.headsign === selectedDestination)?.departures ?? [];
    }
    // All departures, but only the time field (headsign shown on card separately)
    return currentDir.departures.map((d) => ({ time: d.time }));
  }, [currentDir, selectedDestination]);

  // ── Origin stop for the current direction / destination ───────────────────
  // For direction 0 (outbound) the service starts at from_stop; for direction 1
  // (inbound) it starts from the terminus (to_stop).  For specific sub-routes
  // (e.g. 30A starting at Bramalea) the first stop comes from the stop-times
  // data once loaded, falling back to from_stop/to_stop.
  const originStop = useMemo(() => {
    if (selected?.kind !== "go") return undefined;
    // If stop-times editor is loaded, the first row's name IS the actual origin
    if (editor && editor.rows.length > 0) return editor.rows[0].name;
    return deptDirection === 0 ? selected.route.from_stop : selected.route.to_stop;
  }, [selected, deptDirection, editor]);

  // ── Filtered route list ───────────────────────────────────────────────────
  const q = search.toLowerCase();
  const filteredGO = goRoutes.filter((r) => {
    if (filter === "trains" && !r.is_rail) return false;
    if (filter === "buses" && r.is_rail) return false;
    if (filter === "mine") return false;
    if (q) {
      const lineInfo = GO_RAIL_LINES[r.short_name];
      return (lineInfo?.name ?? r.long_name).toLowerCase().includes(q) || r.short_name.toLowerCase().includes(q);
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
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Schedule editor"
        className="relative z-10 flex w-full h-full max-w-7xl rounded-2xl bg-white shadow-2xl overflow-hidden"
        style={{ maxHeight: "92vh" }}
      >
        {/* Close */}
        <button
          onClick={onClose}
          className="absolute top-3 right-3 z-20 w-8 h-8 rounded-xl flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        {/* ── Left sidebar ────────────────────────────────────────────────── */}
        <RouteSidebar
          filter={filter}
          search={search}
          loadingGO={loadingGO}
          filteredGO={filteredGO}
          filteredCustom={filteredCustom}
          selected={selected}
          onFilterChange={setFilter}
          onSearchChange={setSearch}
          onSelectRoute={handleSelectRoute}
        />

        {/* ── Right panel ─────────────────────────────────────────────────── */}
        <div className="flex-1 flex flex-col min-w-0">
          {!selected ? (
            <EmptyState />
          ) : selected.kind === "go" ? (
            <>
              <GoEditorHeader
                selected={selected as { kind: "go"; route: EnrichedRoute; variantId: string }}
                viewMode={goViewMode}
                onViewModeChange={handleGoViewModeChange}
                onVariantChange={handleVariantChange}
              />

              {goViewMode === "departures" ? (
                <DeparturesView
                  route={selected.route}
                  deptState={deptState}
                  deptDay={deptDay}
                  deptDirection={deptDirection}
                  selectedDestination={selectedDestination}
                  originStop={originStop}
                  onDayChange={handleDayChange}
                  onDirectionChange={handleDirectionChange}
                  onDestinationChange={setSelectedDestination}
                />
              ) : (
                <>
                  {editor && editor.rows.length > 0 ? (
                    <>
                      {/* Departure selector toolbar */}
                      <DepartureSelector
                        departures={currentDirDepartures}
                        directions={deptState.directions}
                        selectedDeparture={selectedDeparture}
                        selectedDirection={deptDirection}
                        selectedDestination={selectedDestination}
                        originStop={originStop}
                        onSelectDeparture={setSelectedDeparture}
                        onSelectDirection={handleDirectionChange}
                        onDestinationChange={setSelectedDestination}
                      />
                      <StopTimesTable
                        rows={shiftedRows}
                        directionsStatus={editor.directionsStatus}
                        isReadOnly
                        onTimeEdit={handleTimeEdit}
                      />
                    </>
                  ) : (
                    <div className="flex-1 flex items-center justify-center text-sm text-slate-400">
                      <Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading stop times…
                    </div>
                  )}
                  <div className="px-6 py-3 border-t border-slate-100 bg-slate-50/50 flex items-center gap-2 text-[11px] text-slate-400">
                    <Lock className="w-3 h-3" />
                    GO Transit · read-only · actual GTFS scheduled times
                  </div>
                </>
              )}
            </>
          ) : (
            <>
              <CustomEditorHeader route={(selected as { kind: "custom"; route: CustomRoute }).route} />
              {editor && editor.rows.length > 0 ? (
                <>
                  <CustomDepartureSelector
                    route={(selected as { kind: "custom"; route: CustomRoute }).route}
                    trips={customTrips}
                    selectedTripId={selectedCustomTripId}
                    firstStopName={editor.rows[0]?.name}
                    lastStopName={editor.rows[editor.rows.length - 1]?.name}
                    deptDay={deptDay}
                    onDayChange={handleDayChange}
                    onSelectTrip={handleCustomSelectTrip}
                    onAddDeparture={handleCustomAddDeparture}
                    onUpdateDeparture={handleCustomUpdateDeparture}
                    onDeleteDeparture={handleCustomDeleteDeparture}
                  />
                  <StopTimesTable
                    rows={editor.rows}
                    directionsStatus={editor.directionsStatus}
                    isReadOnly={customTrips.length === 0}
                    onTimeEdit={handleTimeEdit}
                  />
                </>
              ) : (
                <div className="flex-1 flex items-center justify-center text-sm text-slate-400">
                  {editor?.rows.length === 0
                    ? <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading stops…</>
                    : <p className="text-center max-w-xs">This route has no stops yet. Add stops in the Design panel first.</p>
                  }
                </div>
              )}
              <EditorFooter selected={selected} editor={editor} onSave={handleSave} />
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

// ─── RouteSidebar ─────────────────────────────────────────────────────────────

function RouteSidebar({
  filter, search, loadingGO, filteredGO, filteredCustom, selected,
  onFilterChange, onSearchChange, onSelectRoute,
}: {
  filter: FilterTab; search: string; loadingGO: boolean;
  filteredGO: EnrichedRoute[]; filteredCustom: CustomRoute[];
  selected: SelectedRoute | null;
  onFilterChange: (f: FilterTab) => void;
  onSearchChange: (q: string) => void;
  onSelectRoute: (sel: SelectedRoute) => void;
}) {
  return (
    <div className="w-72 flex-shrink-0 border-r border-slate-100 flex flex-col bg-slate-50/50">
      <div className="px-4 pt-5 pb-3">
        <h2 className="text-base font-semibold text-slate-900">Schedules</h2>
        <p className="text-xs text-slate-400 mt-0.5">Select a route to view stop times</p>
      </div>

      <div className="px-3 pb-2">
        <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-3 py-2 shadow-sm">
          <Search className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
          <input
            type="text"
            placeholder="Search routes…"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            className="flex-1 text-xs bg-transparent outline-none text-slate-700 placeholder:text-slate-400"
          />
        </div>
      </div>

      <div className="px-3 pb-2 flex gap-1">
        {(["all", "trains", "buses", "mine"] as FilterTab[]).map((tab) => (
          <button
            key={tab}
            onClick={() => onFilterChange(tab)}
            className={`flex-1 rounded-lg py-1 text-[10px] font-semibold transition-colors capitalize ${
              filter === tab ? "bg-slate-900 text-white" : "text-slate-500 hover:bg-slate-100"
            }`}
          >
            {tab === "mine" ? "Mine" : tab === "all" ? "All" : tab === "trains" ? "Train" : "Bus"}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto px-2 pb-4">
        {loadingGO && (
          <div className="flex items-center gap-2 px-2 py-4 text-xs text-slate-400">
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading routes…
          </div>
        )}

        {filteredGO.length > 0 && (
          <>
            {filter === "all" && (
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide px-2 pt-3 pb-1">GO Transit</p>
            )}
            {filteredGO.map((route) => {
              const lineInfo = GO_RAIL_LINES[route.short_name];
              const color = lineInfo?.color ?? route.color;
              const name = lineInfo?.name ?? route.long_name;
              const isSel = selected?.kind === "go" && selected.route.route_id === route.route_id;
              return (
                <RouteListItem
                  key={route.route_id}
                  color={color}
                  icon={route.is_rail ? "train" : "bus"}
                  label={name}
                  sublabel={route.from_stop && route.to_stop ? `${route.from_stop} → ${route.to_stop}` : undefined}
                  shortName={!route.is_rail ? route.short_name : undefined}
                  isSelected={isSel}
                  onClick={() => onSelectRoute({ kind: "go", route, variantId: route.variants[0]?.variant_id ?? "" })}
                />
              );
            })}
          </>
        )}

        {filteredCustom.length > 0 && (
          <>
            {filter === "all" && (
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide px-2 pt-3 pb-1">My routes</p>
            )}
            {filteredCustom.map((route) => {
              const isSel = selected?.kind === "custom" && selected.route.id === route.id;
              return (
                <RouteListItem
                  key={route.id}
                  color={route.color}
                  icon={route.type === "train" ? "train" : "bus"}
                  label={route.name || "Custom route"}
                  sublabel={`${route.stops.length} stop${route.stops.length !== 1 ? "s" : ""}`}
                  isSelected={isSel}
                  onClick={() => onSelectRoute({ kind: "custom", route })}
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
      className={`w-full flex items-center gap-2.5 px-2 py-2 rounded-xl text-left transition-colors ${
        isSelected ? "bg-slate-900 text-white" : "hover:bg-white hover:shadow-sm text-slate-700"
      }`}
    >
      <div
        className="w-8 h-8 rounded-lg flex-shrink-0 flex items-center justify-center text-white text-[10px] font-bold"
        style={{ backgroundColor: color }}
      >
        {shortName
          ? shortName.slice(0, 3)
          : icon === "train"
            ? <Train className="w-4 h-4" />
            : <Bus className="w-4 h-4" />}
      </div>
      <div className="flex-1 min-w-0">
        <p className={`text-xs font-semibold truncate ${isSelected ? "text-white" : "text-slate-800"}`}>{label}</p>
        {sublabel && (
          <p className={`text-[10px] truncate mt-0.5 ${isSelected ? "text-white/60" : "text-slate-400"}`}>{sublabel}</p>
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
          Choose a GO Transit or custom route from the sidebar to view its schedule.
        </p>
      </div>
    </div>
  );
}

// ─── GoEditorHeader ───────────────────────────────────────────────────────────

function GoEditorHeader({
  selected, viewMode, onViewModeChange, onVariantChange,
}: {
  selected: { kind: "go"; route: EnrichedRoute; variantId: string };
  viewMode: GoViewMode;
  onViewModeChange: (m: GoViewMode) => void;
  onVariantChange: (variantId: string) => void;
}) {
  const lineInfo = GO_RAIL_LINES[selected.route.short_name];
  const color = lineInfo?.color ?? selected.route.color;
  const name = lineInfo?.name ?? selected.route.long_name;

  return (
    <div className="px-6 pt-5 pb-0 border-b border-slate-100">
      <div className="flex items-start justify-between gap-4 pb-4">
        <div className="flex items-center gap-3 min-w-0">
          <div
            className="w-10 h-10 rounded-xl flex-shrink-0 flex items-center justify-center text-white font-bold text-sm"
            style={{ backgroundColor: color }}
          >
            {selected.route.short_name}
          </div>
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-slate-900 truncate">{name}</h3>
            {selected.route.from_stop && (
              <p className="text-xs text-slate-400 mt-0.5 truncate">
                {selected.route.from_stop} → {selected.route.to_stop}
              </p>
            )}
          </div>
        </div>

        {/* Variant picker */}
        <div className="relative flex-shrink-0">
          <select
            value={selected.variantId}
            onChange={(e) => onVariantChange(e.target.value)}
            className="text-xs rounded-xl border border-slate-200 bg-white pl-3 pr-7 py-1.5 text-slate-700 appearance-none focus:outline-none focus:ring-2 focus:ring-slate-200 max-w-[220px] truncate"
          >
            {[...selected.route.variants]
              .sort((a, b) => (b.weekly_trip_count ?? 0) - (a.weekly_trip_count ?? 0))
              .map((v) => (
                <option key={v.variant_id} value={v.variant_id}>
                  {v.label} · {(v.weekly_trip_count ?? v.trip_count).toLocaleString()} trips/wk
                </option>
              ))}
          </select>
          <ChevronDown className="w-3 h-3 text-slate-400 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
        </div>
      </div>

      {/* View mode tabs */}
      <div className="flex gap-1 -mb-px">
        <ViewTab
          active={viewMode === "departures"}
          icon={<CalendarDays className="w-3.5 h-3.5" />}
          label="Departures"
          onClick={() => onViewModeChange("departures")}
        />
        <ViewTab
          active={viewMode === "stoptimes"}
          icon={<TableProperties className="w-3.5 h-3.5" />}
          label="Stop times"
          onClick={() => onViewModeChange("stoptimes")}
        />
      </div>
    </div>
  );
}

function ViewTab({ active, icon, label, onClick }: {
  active: boolean; icon: React.ReactNode; label: string; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors ${
        active
          ? "border-slate-900 text-slate-900"
          : "border-transparent text-slate-400 hover:text-slate-600"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

// ─── CustomEditorHeader ───────────────────────────────────────────────────────

function CustomEditorHeader({ route }: { route: CustomRoute }) {
  return (
    <div className="px-6 pt-5 pb-4 border-b border-slate-100 flex items-center gap-3">
      <div
        className="w-10 h-10 rounded-xl flex-shrink-0 flex items-center justify-center text-white font-bold text-sm"
        style={{ backgroundColor: route.color }}
      >
        {route.type === "train" ? "TR" : "BU"}
      </div>
      <div className="min-w-0">
        <h3 className="text-base font-semibold text-slate-900 truncate">{route.name || "Custom route"}</h3>
        <p className="text-xs text-slate-400 mt-0.5">{route.stops.length} stops · Edit departure times below</p>
      </div>
    </div>
  );
}

// ─── DepartureSelector ────────────────────────────────────────────────────────
// Toolbar shown in the Stop Times tab: pick destination sub-route + departure time.

function DepartureSelector({
  departures, directions, selectedDeparture, selectedDirection,
  selectedDestination, originStop,
  onSelectDeparture, onSelectDirection, onDestinationChange,
}: {
  departures: { time: string }[];
  directions: DepartureDirection[];
  selectedDeparture: string | null;
  selectedDirection: number;
  selectedDestination: string | null;
  originStop?: string;
  onSelectDeparture: (t: string) => void;
  onSelectDirection: (d: number) => void;
  onDestinationChange: (dest: string | null) => void;
}) {
  const currentDir = directions.find((d) => d.directionId === selectedDirection);
  const hasMultipleDestinations = (currentDir?.destinations.length ?? 0) > 1;
  const activeDestination = selectedDestination ?? currentDir?.destinations[0]?.headsign;

  return (
    <div className="px-6 py-3 border-b border-slate-100 bg-slate-50/40 flex flex-col gap-2.5">
      {/* Row 1: direction + destination sub-route filter */}
      <div className="flex items-center gap-2 flex-wrap">
        {/* Direction toggle */}
        {directions.length > 1 && directions.map((dir) => (
          <button
            key={dir.directionId}
            onClick={() => onSelectDirection(dir.directionId)}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors ${
              selectedDirection === dir.directionId
                ? "bg-slate-900 text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            {dir.directionId === 0 ? <ArrowRight className="w-3 h-3" /> : <ArrowLeft className="w-3 h-3" />}
            <span className="truncate max-w-[120px]">{dir.headsign}</span>
          </button>
        ))}

        {/* Destination pills (sub-routes) */}
        {hasMultipleDestinations && (
          <>
            <span className="text-slate-200 text-sm">|</span>
            {currentDir!.destinations.map((dest) => (
              <button
                key={dest.headsign}
                onClick={() => onDestinationChange(
                  selectedDestination === dest.headsign ? null : dest.headsign
                )}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors ${
                  activeDestination === dest.headsign
                    ? "bg-emerald-700 text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                → {dest.headsign}
                <span className="ml-1.5 opacity-60 font-normal">
                  {dest.departures.length}
                </span>
              </button>
            ))}
          </>
        )}
      </div>

      {/* Row 2: departure time dropdown + origin pill */}
      <div className="flex items-center gap-3 flex-wrap">
        <Clock className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
        <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">
          Departure
        </label>
        <div className="relative">
          <select
            value={selectedDeparture ?? ""}
            onChange={(e) => onSelectDeparture(e.target.value)}
            className="text-xs rounded-xl border border-slate-200 bg-white pl-3 pr-7 py-1.5 text-slate-800 font-mono appearance-none focus:outline-none focus:ring-2 focus:ring-slate-200 min-w-[110px]"
          >
            {departures.length === 0 && <option value="">No departures</option>}
            {departures.map((dep) => (
              <option key={dep.time} value={dep.time}>{toDisplayTime(dep.time)}</option>
            ))}
          </select>
          <ChevronDown className="w-3 h-3 text-slate-400 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
        </div>

        {/* Origin → destination pill */}
        {originStop && (
          <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-xl px-3 py-1.5">
            <MapPin className="w-3 h-3 text-slate-400 flex-shrink-0" />
            <span className="text-xs text-slate-600 font-medium">{originStop}</span>
            {activeDestination && (
              <>
                <ArrowRight className="w-3 h-3 text-slate-300 flex-shrink-0" />
                <span className="text-xs text-slate-500 truncate max-w-[140px]">{activeDestination}</span>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── DeparturesView ───────────────────────────────────────────────────────────

function DeparturesView({
  route, deptState, deptDay, deptDirection, selectedDestination,
  originStop, onDayChange, onDirectionChange, onDestinationChange,
}: {
  route: EnrichedRoute;
  deptState: DeparturesState;
  deptDay: number;
  deptDirection: number;
  selectedDestination: string | null;
  originStop?: string;
  onDayChange: (day: number) => void;
  onDirectionChange: (dir: number) => void;
  onDestinationChange: (dest: string | null) => void;
}) {
  const currentDir = deptState.directions.find((d) => d.directionId === deptDirection);

  // Departures to show — filtered by destination if one is selected
  type DepEntry = { time: string; headsign?: string };
  const visibleDepartures: DepEntry[] = selectedDestination
    ? (currentDir?.destinations.find((d) => d.headsign === selectedDestination)?.departures ?? [])
    : (currentDir?.destinations.flatMap((d) =>
        d.departures.map((dep): DepEntry => ({ time: dep.time, headsign: d.headsign }))
      ) ?? []).sort((a, b) => a.time.localeCompare(b.time));

  const hasMultipleDestinations = (currentDir?.destinations.length ?? 0) > 1;

  // Origin for each direction: outbound starts at from_stop, inbound at to_stop
  const getOriginForDir = (dirId: number) =>
    dirId === 0 ? route.from_stop : route.to_stop;

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Day selector */}
      <div className="px-6 py-3 border-b border-slate-100 flex items-center gap-1.5 flex-wrap">
        {deptState.status === "done" && deptState.availableDays.length > 0
          ? deptState.availableDays.map((d) => (
              <button key={d} onClick={() => onDayChange(d)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors ${
                  deptDay === d ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >{DAY_LABELS[d]}</button>
            ))
          : DAY_LABELS.map((label, d) => (
              <button key={d} onClick={() => onDayChange(d)}
                disabled={deptState.status === "loading"}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors disabled:opacity-40 ${
                  deptDay === d ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >{label}</button>
            ))}
      </div>

      {/* Direction + destination filter bar */}
      {deptState.status === "done" && (deptState.directions.length > 1 || hasMultipleDestinations) && (
        <div className="px-6 py-2.5 border-b border-slate-100 flex items-center gap-2 flex-wrap">
          {/* Direction toggle */}
          {deptState.directions.length > 1 && deptState.directions.map((dir) => {
            const origin = getOriginForDir(dir.directionId);
            return (
              <button key={dir.directionId} onClick={() => onDirectionChange(dir.directionId)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors ${
                  deptDirection === dir.directionId
                    ? "bg-slate-900 text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {dir.directionId === 0 ? <ArrowRight className="w-3 h-3" /> : <ArrowLeft className="w-3 h-3" />}
                {origin
                  ? <span className="flex items-center gap-1">
                      <span className="truncate max-w-[100px]">{origin}</span>
                      <ArrowRight className="w-2.5 h-2.5 opacity-50" />
                      <span className="truncate max-w-[100px]">{dir.headsign}</span>
                    </span>
                  : <span className="truncate max-w-[180px]">{dir.headsign}</span>
                }
              </button>
            );
          })}

          {/* Destination (sub-route) pills — e.g. Georgetown, Kitchener, Mount Pleasant */}
          {hasMultipleDestinations && (
            <>
              {deptState.directions.length > 1 && (
                <span className="w-px h-4 bg-slate-200" />
              )}
              {/* "All" pill */}
              <button
                onClick={() => onDestinationChange(null)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors ${
                  selectedDestination === null
                    ? "bg-slate-900 text-white"
                    : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                }`}
              >
                All
                <span className="ml-1.5 opacity-60 font-normal">
                  {currentDir?.departures.length}
                </span>
              </button>
              {currentDir!.destinations.map((dest) => (
                <button
                  key={dest.headsign}
                  onClick={() => onDestinationChange(
                    selectedDestination === dest.headsign ? null : dest.headsign
                  )}
                  className={`flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors ${
                    selectedDestination === dest.headsign
                      ? "bg-emerald-700 text-white"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  <span className="truncate max-w-[140px]">→ {dest.headsign}</span>
                  <span className="opacity-60 font-normal ml-1">{dest.departures.length}</span>
                </button>
              ))}
            </>
          )}
        </div>
      )}

      {/* Departures list */}
      <div className="flex-1 overflow-y-auto">
        {deptState.status === "loading" && (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
            <div className="text-center">
              <p className="text-sm font-medium text-slate-600">Loading schedule…</p>
              {deptState.isFirstLoad && (
                <p className="text-xs text-slate-400 mt-1 max-w-xs">
                  Building the schedule index for the first time — this takes about 5–10 seconds.
                </p>
              )}
            </div>
          </div>
        )}

        {deptState.status === "error" && (
          <div className="flex items-center gap-2 px-6 py-8 text-sm text-amber-600">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            {deptState.error ?? "Could not load schedule data."}
          </div>
        )}

        {deptState.status === "done" && visibleDepartures.length === 0 && (
          <div className="px-6 py-8 text-sm text-slate-400 text-center">
            No departures found for {route.short_name} on {DAY_FULL[deptDay]}s.
          </div>
        )}

        {deptState.status === "done" && visibleDepartures.length > 0 && (
          <div className="px-6 py-3">
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-3">
              {visibleDepartures.length} departure{visibleDepartures.length !== 1 ? "s" : ""} · {DAY_FULL[deptDay]}
              {selectedDestination ? ` · → ${selectedDestination}` : currentDir ? ` · ${currentDir.headsign}` : ""}
            </p>
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
              {visibleDepartures.map((dep, i) => (
                <DepartureCard
                  key={i}
                  time={dep.time}
                  originStop={originStop}
                  destination={!selectedDestination ? dep.headsign : undefined}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── DepartureCard ────────────────────────────────────────────────────────────

function DepartureCard({
  time, originStop, destination,
}: {
  time: string;
  originStop?: string;
  /** Shown when "All" is selected and cards have mixed destinations */
  destination?: string;
}) {
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2.5 text-center">
      <p className="text-sm font-semibold text-slate-800 tabular-nums font-mono">
        {toDisplayTime(time)}
      </p>
      {originStop && (
        <p className="text-[10px] text-slate-400 mt-0.5 truncate leading-tight">
          from {originStop}
        </p>
      )}
      {destination && (
        <p className="text-[10px] text-emerald-600 font-medium mt-0.5 truncate leading-tight">
          → {destination}
        </p>
      )}
    </div>
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
            {!isReadOnly && directionsStatus === "done" && (
              <th className="text-left text-[10px] font-semibold text-emerald-500 uppercase tracking-wide px-3 py-2.5 w-28">
                Cascade ✓
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <StopRowItem
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

function StopRowItem({
  row, index, isReadOnly, directionsLoading, onTimeEdit,
}: {
  row: StopRow; index: number; isReadOnly: boolean;
  directionsLoading: boolean;
  onTimeEdit: (index: number, hhmm: string) => void;
}) {
  return (
    <tr className="border-b border-slate-50 hover:bg-slate-50/60 transition-colors">
      <td className="px-6 py-2.5 text-xs font-medium text-slate-400 tabular-nums">{index + 1}</td>
      <td className="px-3 py-2.5">
        <div className="flex items-center gap-2">
          <div className={`w-2.5 h-2.5 rounded-full border-2 flex-shrink-0 ${index === 0 ? "border-slate-700 bg-white" : "border-slate-300 bg-white"}`} />
          <span className="text-sm text-slate-800">{row.name}</span>
        </div>
      </td>
      <td className="px-3 py-2.5">
        {isReadOnly ? (
          <span className={`text-sm tabular-nums font-mono ${directionsLoading ? "text-slate-300 animate-pulse" : "text-slate-600"}`}>
            {row.timeHHMM ? toDisplayTime(row.timeHHMM) : "—"}
          </span>
        ) : (
          <input
            type="time"
            value={row.timeHHMM ?? ""}
            onChange={(e) => onTimeEdit(index, e.target.value)}
            className={`text-sm font-mono tabular-nums rounded-lg border px-2 py-1 w-28 outline-none transition-colors focus:ring-2 focus:ring-[#007A33]/20 focus:border-[#007A33] ${
              directionsLoading ? "border-slate-100 text-slate-300 animate-pulse" : "border-slate-200 text-slate-800"
            }`}
          />
        )}
      </td>
    </tr>
  );
}

function CustomDepartureSelector({
  route,
  trips,
  selectedTripId,
  firstStopName,
  lastStopName,
  deptDay,
  onDayChange,
  onSelectTrip,
  onAddDeparture,
  onUpdateDeparture,
  onDeleteDeparture,
}: {
  route: CustomRoute;
  trips: CustomTimetableTrip[];
  selectedTripId: string | null;
  firstStopName?: string;
  lastStopName?: string;
  deptDay: number;
  onDayChange: (day: number) => void;
  onSelectTrip: (tripId: string) => void;
  onAddDeparture: (time: string) => void;
  onUpdateDeparture: (time: string) => void;
  onDeleteDeparture: (tripId: string) => void;
}) {
  const [newDeparture, setNewDeparture] = useState("");
  const selectedTrip = trips.find((trip) => trip.id === selectedTripId) ?? null;
  const legacyDepartures = useMemo(
    () => computeCustomDepartures(route.schedule, deptDay),
    [route.schedule, deptDay],
  );
  const activeDays = useMemo(() => {
    const days: number[] = [];
    for (let d = 0; d <= 6; d++) {
      if (computeCustomDepartures(route.schedule, d).length > 0) days.push(d);
    }
    return days;
  }, [route.schedule]);
  const showLegacySeeds = trips.length === 0 && legacyDepartures.length > 0;

  const handleAdd = () => {
    if (!newDeparture) return;
    onAddDeparture(newDeparture);
    setNewDeparture("");
  };

  return (
    <div className="px-6 py-3 border-b border-slate-100 bg-slate-50/40 flex flex-col gap-3">
      {showLegacySeeds && activeDays.length > 1 && (
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mr-1">Day</span>
          {activeDays.map((d) => (
            <button
              key={d}
              onClick={() => onDayChange(d)}
              className={`px-3 py-1 rounded-xl text-xs font-semibold transition-colors ${
                deptDay === d
                  ? "bg-slate-900 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {DAY_LABELS[d]}
            </button>
          ))}
        </div>
      )}

      <div className="flex items-center gap-3 flex-wrap">
        {firstStopName && (
          <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-lg px-3 py-1.5">
            <MapPin className="w-3 h-3 text-slate-400 flex-shrink-0" />
            <span className="text-xs text-slate-600 font-medium">{firstStopName}</span>
            {lastStopName && lastStopName !== firstStopName && (
              <>
                <ArrowRight className="w-3 h-3 text-slate-300 flex-shrink-0" />
                <span className="text-xs text-slate-500 truncate max-w-[160px]">{lastStopName}</span>
              </>
            )}
          </div>
        )}

        <div className="flex items-center gap-2 ml-auto">
          <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Add timing</label>
          <input
            type="time"
            value={newDeparture}
            onChange={(e) => setNewDeparture(e.target.value)}
            className="text-xs font-mono rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-slate-800 outline-none focus:ring-2 focus:ring-[#007A33]/20 focus:border-[#007A33]"
          />
          <button
            type="button"
            onClick={handleAdd}
            disabled={!newDeparture}
            className="flex items-center gap-1 rounded-lg bg-[#007A33] px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-[#005f28] disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Plus className="w-3 h-3" /> Add
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {trips.length > 0 ? (
          trips.map((trip) => {
            const isSelected = trip.id === selectedTripId;
            const label = secToHHMM(trip.departureSec);
            return (
              <button
                type="button"
                key={trip.id}
                onClick={() => onSelectTrip(trip.id)}
                className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors whitespace-nowrap ${
                  isSelected
                    ? "border-slate-900 bg-slate-900 text-white"
                    : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                }`}
              >
                <Clock className="w-3 h-3" />
                {toDisplayTime(label)}
              </button>
            );
          })
        ) : (
          <p className="text-xs text-slate-400 italic">
            No custom timings yet. Add one to start scheduling this route.
          </p>
        )}
      </div>

      {showLegacySeeds && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">
            Use existing
          </span>
          {legacyDepartures.slice(0, 14).map((time) => (
            <button
              type="button"
              key={time}
              onClick={() => onAddDeparture(time)}
              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-mono text-slate-600 hover:border-slate-300"
            >
              {toDisplayTime(time)}
            </button>
          ))}
          {legacyDepartures.length > 14 && (
            <span className="text-[10px] text-slate-400">+{legacyDepartures.length - 14} more</span>
          )}
        </div>
      )}

      <div className="flex items-center gap-3 flex-wrap border-t border-slate-100 pt-3">
        <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Selected timing</label>
        <input
          type="time"
          value={selectedTrip ? secToHHMM(selectedTrip.departureSec) : ""}
          onChange={(e) => onUpdateDeparture(e.target.value)}
          disabled={!selectedTrip}
          className="text-xs font-mono rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-slate-800 outline-none focus:ring-2 focus:ring-[#007A33]/20 focus:border-[#007A33] disabled:bg-slate-50 disabled:text-slate-300"
        />
        <button
          type="button"
          onClick={() => selectedTrip && onDeleteDeparture(selectedTrip.id)}
          disabled={!selectedTrip}
          className="flex items-center gap-1 rounded-lg border border-red-100 bg-white px-3 py-1.5 text-xs font-semibold text-red-500 transition-colors hover:bg-red-50 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Trash2 className="w-3 h-3" /> Delete
        </button>
        <p className="text-[10px] text-slate-400 ml-auto">
          Stop edits apply only to the selected timing
        </p>
      </div>
    </div>
  );
}

// ─── EditorFooter ─────────────────────────────────────────────────────────────

function EditorFooter({
  selected, editor, onSave,
}: {
  selected: SelectedRoute; editor: EditorState | null; onSave: () => void;
}) {
  if (selected.kind === "go") return null;
  const hasTimetable = (selected as { kind: "custom"; route: CustomRoute }).route.schedule?.type === "timetable";
  return (
    <div className="px-6 py-3 border-t border-slate-100 flex items-center justify-between gap-3">
      <div className="text-xs text-slate-400 flex items-center gap-3">
        {editor?.isDirty && (
          <span className="text-amber-600 font-medium flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 inline-block" /> Unsaved changes
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
        {editor?.directionsStatus === "done" && (
          <span className="flex items-center gap-1 text-emerald-600">
            <CheckCircle className="w-3 h-3" /> Travel times ready · editing cascades forward
          </span>
        )}
      </div>
      <button
        onClick={onSave}
        disabled={!editor?.isDirty || editor?.isSaving}
        className="flex items-center gap-1.5 rounded-xl bg-[#007A33] px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#005f28] disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {editor?.isSaving ? <><Loader2 className="w-3 h-3 animate-spin" /> Saving…</> : "Save schedule"}
      </button>
    </div>
  );
}
