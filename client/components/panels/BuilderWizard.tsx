"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import {
  Train, Bus, Pencil, ArrowRight, ArrowLeft, Check,
  Plus, X, GripVertical, MapPin, Clock, Repeat, Move,
  Loader2, RotateCcw, Navigation,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { CustomRoute, CustomStop, CustomSchedule } from "@/lib/gtfs";
import { CUSTOM_ROUTE_COLORS } from "@/lib/routeColors";
import { v4 as uuidv4 } from "uuid";

type Step = "type" | "name" | "stops" | "schedule" | "review";

interface BuilderWizardProps {
  onSave: (route: CustomRoute) => void;
  onDrawRequest: () => void;
  /** Called when the wizard wants to enter drag-edit mode for a given geometry. */
  onEditRequest: (
    coords: [number, number][],
    onChange: (coords: [number, number][]) => void
  ) => void;
  /** Called when the wizard exits drag-edit mode. */
  onEditDone: () => void;
  /** Show a live preview of the route on the map. */
  onPreviewRoute: (coords: [number, number][], color: string) => void;
  /** Remove the map preview. */
  onClearPreview: () => void;
  onCancel: () => void;
  drawGeometry?: [number, number][];
  existingRoute?: CustomRoute;
  /** Fires whenever the user switches between bus and train mode. */
  onTrainModeChange?: (isTrain: boolean) => void;
}

const ROUTE_TYPE_OPTIONS = [
  {
    type: "bus" as const,
    icon: Bus,
    label: "New bus route",
    description: "Follows real roads between stops",
    color: "border-blue-200 bg-blue-50",
    iconColor: "text-blue-600",
  },
  {
    type: "train" as const,
    icon: Train,
    label: "New train line",
    description: "Custom rail corridor or extension",
    color: "border-emerald-200 bg-emerald-50",
    iconColor: "text-emerald-600",
  },
];

const FREQUENCY_PRESETS = [
  { label: "Every 10 min", interval: 10 },
  { label: "Every 15 min", interval: 15 },
  { label: "Every 30 min", interval: 30 },
  { label: "Every hour", interval: 60 },
];

/** Reduce a coordinates array to at most `target` points while keeping start + end. */
function simplifyForEdit(coords: [number, number][], target = 60): [number, number][] {
  if (coords.length <= target) return coords;
  const step = Math.ceil(coords.length / target);
  return coords.filter((_, i) => i === 0 || i === coords.length - 1 || i % step === 0);
}

function distanceM(a: [number, number], b: [number, number]): number {
  const radius = 6371000;
  const dLat = ((b[1] - a[1]) * Math.PI) / 180;
  const dLon = ((b[0] - a[0]) * Math.PI) / 180;
  const lat1 = (a[1] * Math.PI) / 180;
  const lat2 = (b[1] * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * radius * Math.asin(Math.sqrt(h));
}

function geometryDistanceKm(coords: [number, number][]): number | null {
  if (coords.length < 2) return null;
  let metres = 0;
  for (let i = 1; i < coords.length; i++) metres += distanceM(coords[i - 1], coords[i]);
  return Math.round(metres / 100) / 10;
}

function sampleRailHints(coords: [number, number][], max = 18): [number, number][] {
  if (coords.length <= max) return coords;
  const result: [number, number][] = [coords[0]];
  const step = (coords.length - 2) / (max - 2);
  for (let i = 1; i < max - 1; i++) result.push(coords[Math.round(i * step)]);
  result.push(coords[coords.length - 1]);
  return result;
}

async function fetchRailRoute(
  points: [number, number][],
  dwellStopCount: number
): Promise<{
  geometry: [number, number][];
  distanceM: number;
  durationSecs: number;
  warnings?: string[];
}> {
  const res = await fetch("/api/rail/route", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      points,
      dwellStopCount,
      maxSnapDistanceM: 1800,
      terminalBufferSec: 60,
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Rail route unavailable");
  return data;
}

export default function BuilderWizard({
  onSave,
  onDrawRequest,
  onEditRequest,
  onEditDone,
  onPreviewRoute,
  onClearPreview,
  onCancel,
  drawGeometry,
  existingRoute,
  onTrainModeChange,
}: BuilderWizardProps) {
  const [step, setStep] = useState<Step>(existingRoute ? "review" : "type");
  const [routeType, setRouteType] = useState<"bus" | "train">(
    existingRoute?.type ?? "bus"
  );
  const [name, setName] = useState(existingRoute?.name ?? "");
  const [description, setDescription] = useState(existingRoute?.description ?? "");
  const [color, setColor] = useState(existingRoute?.color ?? CUSTOM_ROUTE_COLORS[0]);
  const [stops, setStops] = useState<CustomStop[]>(existingRoute?.stops ?? []);
  const [stopQuery, setStopQuery] = useState("");
  const [stopResults, setStopResults] = useState<CustomStop[]>([]);
  const [searching, setSearching] = useState(false);
  // "banded" schedules (from SchedulePanel) behave like "frequency" inside the wizard
  const existingScheduleType = existingRoute?.schedule?.type;
  const [scheduleType, setScheduleType] = useState<"frequency" | "fixed">(
    existingScheduleType === "fixed" ? "fixed" : "frequency"
  );
  const [frequencyInterval, setFrequencyInterval] = useState(15);
  const [fixedDepartures, setFixedDepartures] = useState<string[]>(
    existingRoute?.schedule?.fixedDepartures ?? []
  );
  const [newDeparture, setNewDeparture] = useState("");

  // ── Route geometry state ──────────────────────────────────────────────────
  // For bus: computed from Directions API based on stops
  // For train: set from drawGeometry prop, then refined via edit
  const [routeGeometry, setRouteGeometry] = useState<[number, number][] | null>(
    existingRoute?.geometry ?? null
  );
  const [fetchingRoute, setFetchingRoute] = useState(false);
  const [routeDistanceKm, setRouteDistanceKm] = useState<number | null>(null);
  const [routeDurationSecs, setRouteDurationSecs] = useState<number | null>(null);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [routeWarnings, setRouteWarnings] = useState<string[]>([]);
  const [isEditing, setIsEditing] = useState(false);

  // Track last fetched stop IDs to avoid redundant calls
  const lastFetchKeyRef = useRef<string>("");

  // ── Notify parent when route type changes ────────────────────────────────
  useEffect(() => {
    onTrainModeChange?.(routeType === "train");
    return () => { onTrainModeChange?.(false); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeType]);

  // ── Sync drawGeometry → routeGeometry (train) ────────────────────────────
  useEffect(() => {
    if (routeType === "train" && drawGeometry && drawGeometry.length >= 2) {
      setRouteGeometry(drawGeometry);
      setRouteDistanceKm(geometryDistanceKm(drawGeometry));
      setRouteDurationSecs(null);
    }
  }, [drawGeometry, routeType]);

  // ── Auto-fetch directions for bus when stops change ───────────────────────
  useEffect(() => {
    if (routeType !== "bus" || stops.length < 2) {
      if (routeType === "bus" && stops.length < 2) {
        setRouteGeometry(null);
        setRouteDistanceKm(null);
        setRouteDurationSecs(null);
        setRouteError(null);
        setRouteWarnings([]);
      }
      return;
    }

    const key = stops.map((s) => `${s.lon},${s.lat}`).join("|");
    if (key === lastFetchKeyRef.current) return;

    setFetchingRoute(true);
    setRouteError(null);

    const timer = setTimeout(async () => {
      try {
        const token = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;
        if (!token) throw new Error("Mapbox token missing");

        // Directions API supports max 25 waypoints — sample evenly if more
        const waypoints = stops.length <= 25
          ? stops
          : stops.filter((_, i) =>
              i === 0 ||
              i === stops.length - 1 ||
              i % Math.ceil(stops.length / 23) === 0
            );

        const coords = waypoints.map((s) => `${s.lon},${s.lat}`).join(";");
        const url =
          `https://api.mapbox.com/directions/v5/mapbox/driving/${coords}` +
          `?access_token=${token}&geometries=geojson&overview=full`;

        const res = await fetch(url);
        if (!res.ok) throw new Error(`Directions API ${res.status}`);
        const data = await res.json();

        const geometry = data.routes?.[0]?.geometry?.coordinates as
          | [number, number][]
          | undefined;
        const distance = data.routes?.[0]?.distance as number | undefined; // metres
        const duration = data.routes?.[0]?.duration as number | undefined;

        if (geometry && geometry.length >= 2) {
          setRouteGeometry(geometry);
          setRouteDistanceKm(distance ? Math.round(distance / 100) / 10 : null);
          setRouteDurationSecs(duration ? Math.round(duration) : null);
          setRouteWarnings([]);
          lastFetchKeyRef.current = key;
        } else {
          throw new Error("No route found between these stops");
        }
      } catch (err) {
        setRouteError(err instanceof Error ? err.message : "Route unavailable");
        setRouteGeometry(null);
        setRouteDistanceKm(null);
        setRouteDurationSecs(null);
        setRouteWarnings([]);
      } finally {
        setFetchingRoute(false);
      }
    }, 600);

    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stops, routeType]);

  // ── Snap/reroute trains along the local OSM rail graph ───────────────────
  useEffect(() => {
    if (routeType !== "train") return;

    const routePoints = stops.length >= 2
      ? stops.map((s) => [s.lon, s.lat] as [number, number])
      : drawGeometry;

    if (!routePoints || routePoints.length < 2) {
      if (!drawGeometry) {
        setRouteGeometry(null);
        setRouteDistanceKm(null);
        setRouteDurationSecs(null);
        setRouteError(null);
        setRouteWarnings([]);
      }
      return;
    }

    const sampled = stops.length >= 2 ? routePoints : sampleRailHints(routePoints);
    const key = `rail:${stops.length >= 2 ? "stops" : "draw"}:${sampled.map((p) => `${p[0].toFixed(5)},${p[1].toFixed(5)}`).join("|")}`;
    if (key === lastFetchKeyRef.current) return;

    setFetchingRoute(true);
    setRouteError(null);
    setRouteWarnings([]);

    const timer = setTimeout(async () => {
      try {
        const railRoute = await fetchRailRoute(
          sampled,
          stops.length >= 2 ? Math.max(0, stops.length - 2) : 0
        );
        if (railRoute.geometry.length < 2) throw new Error("Rail route returned no geometry");
        setRouteGeometry(railRoute.geometry);
        setRouteDistanceKm(Math.round(railRoute.distanceM / 100) / 10);
        setRouteDurationSecs(railRoute.durationSecs);
        setRouteWarnings(railRoute.warnings ?? []);
        lastFetchKeyRef.current = key;
      } catch (err) {
        const fallback = routePoints.length >= 2 ? routePoints : null;
        setRouteGeometry(fallback);
        setRouteDistanceKm(fallback ? geometryDistanceKm(fallback) : null);
        setRouteDurationSecs(null);
        setRouteError(`${err instanceof Error ? err.message : "Rail route unavailable"} Using manual line.`);
      } finally {
        setFetchingRoute(false);
      }
    }, 450);

    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawGeometry, routeType, stops]);

  // ── Sync route geometry to map preview ───────────────────────────────────
  useEffect(() => {
    if (routeGeometry && routeGeometry.length >= 2 && !isEditing) {
      onPreviewRoute(routeGeometry, color);
    } else if (!routeGeometry) {
      onClearPreview();
    }
  }, [routeGeometry, color, isEditing, onPreviewRoute, onClearPreview]);

  // ── Clear preview on unmount ──────────────────────────────────────────────
  useEffect(() => {
    return () => {
      onClearPreview();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Edit handlers ─────────────────────────────────────────────────────────
  function handleEditRequest() {
    if (!routeGeometry) return;
    const editCoords = simplifyForEdit(routeGeometry);
    setIsEditing(true);
    onEditRequest(editCoords, (newCoords) => {
      setRouteGeometry(newCoords);
    });
  }

  function handleEditDone() {
    setIsEditing(false);
    onEditDone();
    // Restore preview after edit
    if (routeGeometry) onPreviewRoute(routeGeometry, color);
  }

  // ── Stop search ──────────────────────────────────────────────────────────
  const searchStops = useCallback(async (q: string) => {
    if (q.length < 2) { setStopResults([]); return; }
    setSearching(true);
    try {
      const res = await fetch(`/api/stops?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      setStopResults(
        (data.stops ?? []).map((s: { stop_id: string; stop_name: string; lat: number; lon: number }) => ({
          id: s.stop_id,
          name: s.stop_name,
          lat: s.lat,
          lon: s.lon,
          sequence: stops.length + 1,
        }))
      );
    } catch {
      setStopResults([]);
    } finally {
      setSearching(false);
    }
  }, [stops.length]);

  function addStop(s: CustomStop) {
    setStops((prev) => [...prev, { ...s, sequence: prev.length + 1 }]);
    setStopQuery("");
    setStopResults([]);
    lastFetchKeyRef.current = ""; // force re-fetch
  }

  function removeStop(id: string) {
    setStops((prev) =>
      prev.filter((s) => s.id !== id).map((s, i) => ({ ...s, sequence: i + 1 }))
    );
    lastFetchKeyRef.current = "";
  }

  function buildSchedule(): CustomSchedule {
    if (scheduleType === "fixed") {
      return { type: "fixed", fixedDepartures, direction: "two-way" };
    }
    return {
      type: "frequency",
      frequency: {
        weekday: { start: "06:00", end: "23:00", interval: frequencyInterval },
        weekend: { start: "07:00", end: "22:00", interval: frequencyInterval * 2 },
      },
      direction: "two-way",
    };
  }

  function handleSave() {
    const route: CustomRoute = {
      id: existingRoute?.id ?? uuidv4(),
      name: name || `${routeType === "train" ? "Train" : "Bus"} Route`,
      color,
      type: routeType,
      description: description || undefined,
      stops,
      geometry: routeGeometry ?? drawGeometry,
      schedule: buildSchedule(),
      createdAt: existingRoute?.createdAt ?? new Date().toISOString(),
    };
    onSave(route);
  }

  function handleCancel() {
    if (isEditing) onEditDone();
    onClearPreview();
    onCancel();
  }

  const steps: Step[] = ["type", "name", "stops", "schedule", "review"];
  const stepIndex = steps.indexOf(step);

  // ── Step renderer ────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 pt-4 pb-3 border-b border-slate-100 flex items-center justify-between">
        <div>
          <h2 className="font-semibold text-slate-900 text-base">Design a route</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Step {stepIndex + 1} of {steps.length}
          </p>
        </div>
        <button onClick={handleCancel} className="text-slate-400 hover:text-slate-600 transition-colors">
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Progress bar */}
      <div className="h-1 bg-slate-100">
        <div
          className="h-full bg-[#007A33] transition-all duration-300"
          style={{ width: `${(stepIndex + 1) * 20}%` }}
        />
      </div>

      {/* Step content */}
      <div className="flex-1 overflow-y-auto px-4 py-4">

        {/* ── Step 1: Route type ──────────────────────────────────────────── */}
        {step === "type" && (
          <div className="flex flex-col gap-3">
            <p className="text-sm font-medium text-slate-700 mb-1">What are you building?</p>
            {ROUTE_TYPE_OPTIONS.map(({ type, icon: Icon, label, description: desc, color: c, iconColor }) => (
              <button
                key={type}
                className={`w-full flex items-center gap-3 rounded-xl border-2 p-4 text-left transition-all ${
                  routeType === type
                    ? `${c} border-current`
                    : "border-slate-100 bg-white hover:border-slate-200"
                }`}
                onClick={() => { setRouteType(type); setStep("name"); }}
              >
                <div className={`w-10 h-10 rounded-xl ${c} flex items-center justify-center`}>
                  <Icon className={`w-5 h-5 ${iconColor}`} />
                </div>
                <div>
                  <p className="font-semibold text-slate-900">{label}</p>
                  <p className="text-sm text-slate-500">{desc}</p>
                </div>
                <ArrowRight className="ml-auto w-4 h-4 text-slate-300" />
              </button>
            ))}
          </div>
        )}

        {/* ── Step 2: Name & style ────────────────────────────────────────── */}
        {step === "name" && (
          <div className="flex flex-col gap-4">
            <div>
              <Label className="text-sm font-medium text-slate-700 mb-1.5 block">
                What should we call it?
              </Label>
              <Input
                placeholder={routeType === "train" ? "e.g. East Bayfront Rail" : "e.g. Airport Express"}
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="rounded-xl h-11"
                autoFocus
              />
            </div>

            <div>
              <Label className="text-sm font-medium text-slate-700 mb-1.5 block">
                Pick a colour
              </Label>
              <div className="flex gap-2 flex-wrap">
                {CUSTOM_ROUTE_COLORS.map((c) => (
                  <button
                    key={c}
                    className={`w-8 h-8 rounded-full transition-transform ${
                      color === c ? "scale-125 ring-2 ring-offset-2 ring-slate-400" : "hover:scale-110"
                    }`}
                    style={{ backgroundColor: c }}
                    onClick={() => setColor(c)}
                  />
                ))}
              </div>
            </div>

            <div>
              <Label className="text-sm font-medium text-slate-700 mb-1.5 block">
                Short description <span className="text-slate-400 font-normal">(optional)</span>
              </Label>
              <Input
                placeholder="e.g. Connects downtown to the waterfront"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="rounded-xl h-11"
              />
            </div>
          </div>
        )}

        {/* ── Step 3: Stops ───────────────────────────────────────────────── */}
        {step === "stops" && (
          <div className="flex flex-col gap-3">

            {/* ── Bus: search stops + auto-route ──────────────────────────── */}
            {routeType === "bus" && (
              <>
                <p className="text-sm text-slate-500">
                  Add stops and we'll calculate the road route automatically.
                </p>

                {/* Stop search */}
                <div className="relative">
                  <Input
                    placeholder="Search for a stop or station…"
                    value={stopQuery}
                    onChange={(e) => {
                      setStopQuery(e.target.value);
                      searchStops(e.target.value);
                    }}
                    className="rounded-xl h-10 pr-8"
                    disabled={isEditing}
                  />
                  {searching && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 w-3 h-3 border-2 border-slate-300 border-t-transparent rounded-full animate-spin" />
                  )}
                </div>

                {/* Search results */}
                {stopResults.length > 0 && (
                  <div className="rounded-xl border border-slate-100 shadow-sm bg-white overflow-hidden">
                    {stopResults.map((s) => (
                      <button
                        key={s.id}
                        className="w-full flex items-center gap-2 px-3 py-2.5 text-sm hover:bg-slate-50 text-left border-b border-slate-50 last:border-0"
                        onClick={() => addStop(s)}
                      >
                        <MapPin className="w-4 h-4 text-slate-400 flex-shrink-0" />
                        {s.name}
                        <Plus className="ml-auto w-4 h-4 text-slate-300" />
                      </button>
                    ))}
                  </div>
                )}

                {/* Stop list */}
                {stops.length === 0 ? (
                  <div className="flex flex-col items-center py-8 text-slate-400">
                    <MapPin className="w-8 h-8 mb-2 opacity-40" />
                    <p className="text-sm font-medium">No stops added yet</p>
                    <p className="text-xs mt-1">Search above to add stops</p>
                  </div>
                ) : (
                  <div className="flex flex-col gap-1">
                    <p className="text-xs font-medium text-slate-500 mb-0.5">{stops.length} stops</p>
                    {stops.map((s, i) => (
                      <div
                        key={s.id}
                        className="flex items-center gap-2 py-2 px-2 rounded-lg hover:bg-slate-50"
                      >
                        <GripVertical className="w-4 h-4 text-slate-300 cursor-grab" />
                        <div
                          className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0"
                          style={{ backgroundColor: color }}
                        >
                          {i + 1}
                        </div>
                        <span className="text-sm text-slate-700 flex-1 truncate">{s.name}</span>
                        <button
                          onClick={() => removeStop(s.id)}
                          className="text-slate-300 hover:text-red-400 transition-colors"
                          disabled={isEditing}
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Route status + adjust button */}
                {stops.length >= 2 && (
                  <div className="flex flex-col gap-2 pt-1">
                    {fetchingRoute ? (
                      <div className="flex items-center gap-2 text-xs text-slate-500 bg-slate-50 rounded-xl px-3 py-2.5">
                        <Loader2 className="w-3.5 h-3.5 animate-spin flex-shrink-0" />
                        Calculating route along roads…
                      </div>
                    ) : routeError ? (
                      <div className="flex items-center gap-2 text-xs text-red-600 bg-red-50 rounded-xl px-3 py-2.5">
                        <X className="w-3.5 h-3.5 flex-shrink-0" />
                        {routeError}
                      </div>
                    ) : routeGeometry ? (
                      <>
                        <div className="flex items-center gap-2 text-xs text-emerald-700 bg-emerald-50 rounded-xl px-3 py-2.5">
                          <Navigation className="w-3.5 h-3.5 flex-shrink-0" />
                          Route calculated
                          {routeDistanceKm ? ` · ${routeDistanceKm} km` : ""}
                        </div>

                        {isEditing ? (
                          /* Active editing banner */
                          <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5">
                            <Move className="w-3.5 h-3.5 text-amber-600 flex-shrink-0" />
                            <span className="text-xs text-amber-700 font-medium flex-1">
                              Drag vertices to adjust route
                            </span>
                            <button
                              onClick={handleEditDone}
                              className="text-xs font-semibold text-[#007A33] hover:underline whitespace-nowrap"
                            >
                              Done ✓
                            </button>
                          </div>
                        ) : (
                          <button
                            className="flex items-center gap-2 text-sm text-slate-700 font-medium py-2 px-3 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 transition-colors"
                            onClick={handleEditRequest}
                          >
                            <Move className="w-4 h-4 text-slate-400" />
                            Adjust route on map
                            <span className="ml-auto text-xs text-slate-400">drag to reshape</span>
                          </button>
                        )}
                      </>
                    ) : null}
                  </div>
                )}
              </>
            )}

            {/* ── Train: draw + edit shape ─────────────────────────────────── */}
            {routeType === "train" && (
              <>
                <p className="text-sm text-slate-500">
                  Add stations or draw a corridor. TransitFlow snaps it to the local rail graph when possible.
                </p>

                {/* Optional stop search */}
                <div className="relative">
                  <Input
                    placeholder="Add stations (optional)…"
                    value={stopQuery}
                    onChange={(e) => {
                      setStopQuery(e.target.value);
                      searchStops(e.target.value);
                    }}
                    className="rounded-xl h-10 pr-8"
                    disabled={isEditing}
                  />
                  {searching && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 w-3 h-3 border-2 border-slate-300 border-t-transparent rounded-full animate-spin" />
                  )}
                </div>

                {stopResults.length > 0 && (
                  <div className="rounded-xl border border-slate-100 shadow-sm bg-white overflow-hidden">
                    {stopResults.map((s) => (
                      <button
                        key={s.id}
                        className="w-full flex items-center gap-2 px-3 py-2.5 text-sm hover:bg-slate-50 text-left border-b border-slate-50 last:border-0"
                        onClick={() => addStop(s)}
                      >
                        <MapPin className="w-4 h-4 text-slate-400 flex-shrink-0" />
                        {s.name}
                        <Plus className="ml-auto w-4 h-4 text-slate-300" />
                      </button>
                    ))}
                  </div>
                )}

                {stops.length > 0 && (
                  <div className="flex flex-col gap-1">
                    <p className="text-xs font-medium text-slate-500 mb-0.5">{stops.length} stations</p>
                    {stops.map((s, i) => (
                      <div key={s.id} className="flex items-center gap-2 py-2 px-2 rounded-lg hover:bg-slate-50">
                        <GripVertical className="w-4 h-4 text-slate-300 cursor-grab" />
                        <div
                          className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0"
                          style={{ backgroundColor: color }}
                        >
                          {i + 1}
                        </div>
                        <span className="text-sm text-slate-700 flex-1 truncate">{s.name}</span>
                        <button onClick={() => removeStop(s.id)} className="text-slate-300 hover:text-red-400 transition-colors">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex flex-col gap-2 pt-1">
                  {fetchingRoute && (
                    <div className="flex items-center gap-2 text-xs text-slate-500 bg-slate-50 rounded-xl px-3 py-2.5">
                      <Loader2 className="w-3.5 h-3.5 animate-spin flex-shrink-0" />
                      Snapping to rail network…
                    </div>
                  )}

                  {routeError && !fetchingRoute && (
                    <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2.5">
                      <X className="w-3.5 h-3.5 flex-shrink-0" />
                      {routeError}
                    </div>
                  )}

                  {routeWarnings.length > 0 && !fetchingRoute && (
                    <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2.5">
                      <Navigation className="w-3.5 h-3.5 flex-shrink-0" />
                      {routeWarnings[0]}
                    </div>
                  )}

                  {isEditing ? (
                    /* Active editing banner */
                    <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5">
                      <Move className="w-3.5 h-3.5 text-amber-600 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-amber-700 font-medium">Drag vertices to reshape</p>
                        <p className="text-[10px] text-amber-600">Click midpoints to add new vertices</p>
                      </div>
                      <button
                        onClick={handleEditDone}
                        className="text-xs font-semibold text-[#007A33] hover:underline whitespace-nowrap"
                      >
                        Done ✓
                      </button>
                    </div>
                  ) : routeGeometry ? (
                    /* Has drawn geometry — show status + edit/redraw buttons */
                    <>
                      <div className="flex items-center gap-2 text-xs text-emerald-700 bg-emerald-50 rounded-xl px-3 py-2.5">
                        <Check className="w-3.5 h-3.5 flex-shrink-0" />
                        {routeDurationSecs
                          ? `Rail route · ~${Math.round(routeDurationSecs / 60)} min${routeDistanceKm ? ` · ${routeDistanceKm} km` : ""}`
                          : `Route drawn · ${routeGeometry.length} points`}
                      </div>
                      <div className="flex gap-2">
                        <button
                          className="flex-1 flex items-center justify-center gap-2 text-sm text-slate-700 font-medium py-2 px-3 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 transition-colors"
                          onClick={handleEditRequest}
                        >
                          <Move className="w-4 h-4 text-slate-400" />
                          Edit shape
                        </button>
                        <button
                          className="flex items-center justify-center gap-2 text-sm text-slate-500 py-2 px-3 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 transition-colors"
                          onClick={() => { setRouteGeometry(null); onDrawRequest(); }}
                          title="Redraw from scratch"
                        >
                          <RotateCcw className="w-4 h-4" />
                          Redraw
                        </button>
                      </div>
                    </>
                  ) : (
                    /* No geometry yet */
                    <button
                      className="flex items-center gap-2 text-sm text-[#007A33] font-medium py-2.5 px-3 rounded-xl border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 transition-colors"
                      onClick={onDrawRequest}
                    >
                      <Pencil className="w-4 h-4" />
                      Draw route on map
                      <span className="ml-auto text-xs text-emerald-600 opacity-70">click to place points</span>
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {/* ── Step 4: Schedule ────────────────────────────────────────────── */}
        {step === "schedule" && (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-slate-500">How often should this route run?</p>

            <div className="grid grid-cols-2 gap-2">
              {(["frequency", "fixed"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setScheduleType(t)}
                  className={`flex items-center gap-2 rounded-xl border p-3 text-sm font-medium transition-all ${
                    scheduleType === t
                      ? "border-[#007A33] bg-emerald-50 text-[#007A33]"
                      : "border-slate-100 text-slate-600 hover:border-slate-200"
                  }`}
                >
                  {t === "frequency" ? (
                    <><Repeat className="w-4 h-4" /> Frequency</>
                  ) : (
                    <><Clock className="w-4 h-4" /> Fixed times</>
                  )}
                </button>
              ))}
            </div>

            {scheduleType === "frequency" && (
              <div>
                <Label className="text-sm font-medium text-slate-700 mb-2 block">Service frequency</Label>
                <div className="grid grid-cols-2 gap-2">
                  {FREQUENCY_PRESETS.map(({ label, interval }) => (
                    <button
                      key={interval}
                      onClick={() => setFrequencyInterval(interval)}
                      className={`rounded-xl border p-3 text-sm font-medium transition-all ${
                        frequencyInterval === interval
                          ? "border-[#007A33] bg-emerald-50 text-[#007A33]"
                          : "border-slate-100 hover:border-slate-200 text-slate-700"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-slate-400 mt-2">
                  Weekdays 6 AM – 11 PM · Weekends every {frequencyInterval * 2} min
                </p>
              </div>
            )}

            {scheduleType === "fixed" && (
              <div>
                <Label className="text-sm font-medium text-slate-700 mb-2 block">
                  Departure times
                </Label>
                <div className="flex gap-2">
                  <Input
                    type="time"
                    value={newDeparture}
                    onChange={(e) => setNewDeparture(e.target.value)}
                    className="rounded-xl h-9 flex-1"
                  />
                  <Button
                    size="sm"
                    className="rounded-xl bg-[#007A33] text-white"
                    onClick={() => {
                      if (newDeparture && !fixedDepartures.includes(newDeparture)) {
                        setFixedDepartures((prev) => [...prev, newDeparture].sort());
                        setNewDeparture("");
                      }
                    }}
                  >
                    Add
                  </Button>
                </div>
                {fixedDepartures.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {fixedDepartures.map((t) => (
                      <Badge key={t} variant="secondary" className="gap-1 pr-1">
                        {t}
                        <button
                          onClick={() => setFixedDepartures((p) => p.filter((d) => d !== t))}
                          className="ml-0.5 hover:text-red-500"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── Step 5: Review ──────────────────────────────────────────────── */}
        {step === "review" && (
          <div className="flex flex-col gap-4">
            <div className="rounded-xl border border-slate-100 overflow-hidden">
              <div
                className="flex items-center gap-3 px-4 py-3"
                style={{ backgroundColor: color + "20" }}
              >
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center text-white"
                  style={{ backgroundColor: color }}
                >
                  {routeType === "train" ? <Train className="w-5 h-5" /> : <Bus className="w-5 h-5" />}
                </div>
                <div>
                  <p className="font-semibold text-slate-900">{name || "Unnamed route"}</p>
                  {description && <p className="text-xs text-slate-500">{description}</p>}
                </div>
              </div>

              <div className="px-4 py-3 flex flex-col gap-2 text-sm">
                <div className="flex justify-between text-slate-600">
                  <span className="text-slate-400">Stops</span>
                  <span className="font-medium">{stops.length}</span>
                </div>
                {routeDistanceKm && (
                  <div className="flex justify-between text-slate-600">
                    <span className="text-slate-400">Distance</span>
                    <span className="font-medium">{routeDistanceKm} km</span>
                  </div>
                )}
                {routeDurationSecs && (
                  <div className="flex justify-between text-slate-600">
                    <span className="text-slate-400">Travel time</span>
                    <span className="font-medium">~{Math.round(routeDurationSecs / 60)} min</span>
                  </div>
                )}
                <div className="flex justify-between text-slate-600">
                  <span className="text-slate-400">Schedule</span>
                  <span className="font-medium">
                    {scheduleType === "frequency"
                      ? `Every ${frequencyInterval} min`
                      : `${fixedDepartures.length} departures`}
                  </span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span className="text-slate-400">Route geometry</span>
                  <span className="font-medium">
                    {routeGeometry
                      ? `${routeGeometry.length} pts`
                      : drawGeometry
                      ? `${drawGeometry.length} pts`
                      : "None"}
                  </span>
                </div>
              </div>
            </div>

            {stops.length > 0 && (
              <div>
                <p className="text-xs font-medium text-slate-500 mb-1.5">Stop sequence</p>
                <div className="flex flex-col">
                  {stops.map((s, i) => (
                    <div key={s.id} className="flex items-center gap-2 py-1">
                      <div className="flex flex-col items-center">
                        <div
                          className="w-4 h-4 rounded-full border-2 border-white shadow-sm"
                          style={{ backgroundColor: color }}
                        />
                        {i < stops.length - 1 && (
                          <div className="w-0.5 h-4 bg-slate-200" />
                        )}
                      </div>
                      <span className="text-sm text-slate-700">{s.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Footer navigation ─────────────────────────────────────────────── */}
      <div className="px-4 pb-4 pt-3 border-t border-slate-100 flex gap-2">
        {step !== "type" && (
          <Button
            variant="outline"
            className="rounded-xl flex-1"
            onClick={() => {
              if (isEditing) handleEditDone();
              const i = steps.indexOf(step);
              if (i > 0) setStep(steps[i - 1]);
            }}
          >
            <ArrowLeft className="w-4 h-4 mr-1" /> Back
          </Button>
        )}

        {step !== "review" ? (
          <Button
            className="rounded-xl flex-1 bg-[#007A33] hover:bg-[#005f28] text-white"
            onClick={() => {
              if (isEditing) handleEditDone();
              const i = steps.indexOf(step);
              if (i < steps.length - 1) setStep(steps[i + 1]);
            }}
          >
            Next <ArrowRight className="w-4 h-4 ml-1" />
          </Button>
        ) : (
          <Button
            className="rounded-xl flex-1 bg-[#007A33] hover:bg-[#005f28] text-white"
            onClick={handleSave}
          >
            <Check className="w-4 h-4 mr-1" /> Save route
          </Button>
        )}
      </div>
    </div>
  );
}
