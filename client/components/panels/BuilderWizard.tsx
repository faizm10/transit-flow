"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import {
  Train, Bus, Pencil, ArrowRight, ArrowLeft, Check,
  Plus, X, GripVertical, MapPin, Clock, Repeat, Move,
  Loader2, RotateCcw, Navigation, Crosshair,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { CustomRoute, CustomStop, CustomSchedule, CustomStation } from "@/lib/gtfs";
import { CUSTOM_ROUTE_COLORS } from "@/lib/routeColors";
import { v4 as uuidv4 } from "uuid";

type Step = "type" | "draw" | "name" | "stops" | "schedule" | "review";

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
  /** Custom stations available as searchable stops. */
  customStations?: CustomStation[];
  /** Map pin mode: user clicks the map to choose coordinates (same as Stations panel). */
  onStartPinMode?: (cb: (lat: number, lon: number) => void) => void;
  onStopPinMode?: () => void;
  /** If set, user can optionally persist a placed stop to the shared station library. */
  onSaveStation?: (station: Omit<CustomStation, "id" | "createdAt"> & { id?: string }) => void;
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
  customStations = [],
  onStartPinMode,
  onStopPinMode,
  onSaveStation,
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

  // ── Routing mode (bus only) ───────────────────────────────────────────────
  // "standard"  — default Mapbox driving (fastest route)
  // "via407"    — inserts a waypoint on Hwy 407/427 to route via the express
  //               toll corridor (useful for Pearson Airport and western GTA trips)
  const [routingMode, setRoutingMode] = useState<"standard" | "via407">("standard");

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
  // Prevent re-seeding terminus stops if user clears them
  const stopsSeededRef = useRef(false);

  /** Bus: place a brand-new stop on the map (not from GTFS search). */
  const [placingBusStop, setPlacingBusStop] = useState(false);
  const [pendingBusStop, setPendingBusStop] = useState<{ lat: number; lon: number } | null>(null);
  const [pendingBusStopName, setPendingBusStopName] = useState("");
  const [savePlacedStopToLibrary, setSavePlacedStopToLibrary] = useState(false);

  function busStopCodeFromName(name: string): string {
    const words = name.trim().split(/\s+/);
    if (words.length === 1) return name.slice(0, 4).toUpperCase();
    return words.map((w) => w[0]).join("").slice(0, 4).toUpperCase();
  }

  function startPlaceBusStopOnMap() {
    if (!onStartPinMode || isEditing || pendingBusStop) return;
    setPlacingBusStop(true);
    onStartPinMode((lat, lon) => {
      setPendingBusStop({ lat, lon });
      setPendingBusStopName("");
      setSavePlacedStopToLibrary(false);
      onStopPinMode?.();
      setPlacingBusStop(false);
    });
  }

  function cancelPlaceBusStopOnMap() {
    setPlacingBusStop(false);
    setPendingBusStop(null);
    setPendingBusStopName("");
    setSavePlacedStopToLibrary(false);
    onStopPinMode?.();
  }

  function confirmPendingBusStop() {
    if (!pendingBusStop) return;
    const name = pendingBusStopName.trim() || "Custom bus stop";
    const stop: CustomStop = {
      id: uuidv4(),
      name,
      lat: pendingBusStop.lat,
      lon: pendingBusStop.lon,
      sequence: stops.length + 1,
    };
    addStop(stop);
    if (savePlacedStopToLibrary && onSaveStation) {
      onSaveStation({
        name,
        lat: pendingBusStop.lat,
        lon: pendingBusStop.lon,
        type: "bus",
        code: busStopCodeFromName(name),
      });
    }
    setPendingBusStop(null);
    setPendingBusStopName("");
    setSavePlacedStopToLibrary(false);
  }

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

  // ── Auto-fetch directions for bus when stops or routing mode change ─────────
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

    // Include routingMode in the cache key so a mode switch triggers a re-fetch
    const key = `${routingMode}:${stops.map((s) => `${s.lon},${s.lat}`).join("|")}`;
    if (key === lastFetchKeyRef.current) return;

    setFetchingRoute(true);
    setRouteError(null);

    const timer = setTimeout(async () => {
      try {
        const token = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;
        if (!token) throw new Error("Mapbox token missing");

        // Directions API supports max 25 waypoints — sample evenly if more
        let sampledStops = stops.length <= 25
          ? [...stops]
          : stops.filter((_, i) =>
              i === 0 ||
              i === stops.length - 1 ||
              i % Math.ceil(stops.length / 23) === 0
            );

        // ── Via 407/427 routing ───────────────────────────────────────────
        // Insert a phantom waypoint ON Highway 407/427 so Mapbox is forced to
        // route through the express toll corridor.  Only injected when:
        //   1. The user chose "via 407" mode
        //   2. Both end-stops are within the 407's geographic corridor
        //      (roughly lng -80.0 to -78.8, the Burlington→Pickering span)
        if (routingMode === "via407" && sampledStops.length >= 2) {
          const first = sampledStops[0]!;
          const last  = sampledStops[sampledStops.length - 1]!;
          const GTA_W = -80.0, GTA_E = -78.8;
          const inCorridor = (lon: number) => lon >= GTA_W && lon <= GTA_E;

          if (inCorridor(first.lon) && inCorridor(last.lon)) {
            // Pick the 407/427 junction point nearest to the route's mid-longitude.
            // The 407 curves: we use a small lookup table of known lon→lat pairs.
            const HWY407_SPINE: [number, number][] = [
              [-79.960, 43.671], // Burlington / QEW area
              [-79.870, 43.680], // Bronte
              [-79.790, 43.688], // Oakville West
              [-79.699, 43.699], // 407/427 junction (key airport point)
              [-79.580, 43.742], // Hwy 400 / Brampton area
              [-79.470, 43.776], // Hwy 27 / Woodbridge
              [-79.380, 43.804], // Hwy 404 / Markham
              [-79.210, 43.840], // Hwy 48 / Ajax
              [-79.090, 43.854], // Pickering
            ];

            const midLon = (first.lon + last.lon) / 2;

            // Find the closest spine point
            const via407Point = HWY407_SPINE.reduce((best, pt) =>
              Math.abs(pt[0] - midLon) < Math.abs(best[0] - midLon) ? pt : best
            );

            // Synthetic "via" stop — not a transit stop, just a routing anchor
            const viaStop = {
              id: "__via407__",
              name: "via Hwy 407",
              lat: via407Point[1],
              lon: via407Point[0],
              sequence: -1,
            } as typeof sampledStops[0];

            // Insert after the first stop
            sampledStops = [sampledStops[0]!, viaStop, ...sampledStops.slice(1)];
          }
        }

        const coords = sampledStops.map((s) => `${s.lon},${s.lat}`).join(";");
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
  }, [stops, routeType, routingMode]);

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

  // ── Auto-seed terminus stops when entering stops step for train ──────────
  useEffect(() => {
    if (
      step === "stops" &&
      routeType === "train" &&
      !stopsSeededRef.current &&
      stops.length === 0 &&
      routeGeometry && routeGeometry.length >= 2
    ) {
      stopsSeededRef.current = true;
      const first = routeGeometry[0];
      const last  = routeGeometry[routeGeometry.length - 1];
      setStops([
        { id: uuidv4(), name: "Terminal A", lat: first[1], lon: first[0], sequence: 1 },
        { id: uuidv4(), name: "Terminal B", lat: last[1],  lon: last[0],  sequence: 2 },
      ]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

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

  // ── Stop search (GTFS + custom stations) ────────────────────────────────
  const searchStops = useCallback(async (q: string) => {
    if (q.length < 2) { setStopResults([]); return; }
    const lq = q.toLowerCase();

    // Immediately show matching custom stations (no latency)
    const stationMatches: CustomStop[] = customStations
      .filter((s) => s.name.toLowerCase().includes(lq))
      .map((s, i) => ({
        id: `station:${s.id}`,
        name: s.name,
        lat: s.lat,
        lon: s.lon,
        sequence: stops.length + 1 + i,
      }));

    if (stationMatches.length > 0) setStopResults(stationMatches);

    setSearching(true);
    try {
      const res = await fetch(`/api/stops?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      const gtfsStops: CustomStop[] = (data.stops ?? []).map((s: { stop_id: string; stop_name: string; lat: number; lon: number }, i: number) => ({
        id: s.stop_id,
        name: s.stop_name,
        lat: s.lat,
        lon: s.lon,
        sequence: stops.length + 1 + i,
      }));
      // Merge: custom stations first, then GTFS (dedup by name)
      const seen = new Set(stationMatches.map((s) => s.name.toLowerCase()));
      setStopResults([
        ...stationMatches,
        ...gtfsStops.filter((s) => !seen.has(s.name.toLowerCase())),
      ]);
    } catch {
      setStopResults(stationMatches);
    } finally {
      setSearching(false);
    }
  }, [stops.length, customStations]);

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

  const steps: Step[] = routeType === "train"
    ? ["type", "draw", "name", "stops", "schedule", "review"]
    : ["type", "name", "stops", "schedule", "review"];
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
          style={{ width: `${((stepIndex + 1) / steps.length) * 100}%` }}
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
                onClick={() => {
                  setRouteType(type);
                  if (type === "train") {
                    setStep("draw");
                    onDrawRequest();
                  } else {
                    setStep("name");
                  }
                }}
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

        {/* ── Step 2 (train only): Pave rail corridor ─────────────────────── */}
        {step === "draw" && (
          <div className="flex flex-col gap-4">
            <div className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3.5 flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                <Train className="w-4 h-4 text-emerald-700" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-900">Pave your rail corridor</p>
                <p className="text-xs text-slate-500 mt-0.5">
                  Click on the map to lay track points. Double-click or press Enter to finish.
                </p>
              </div>
            </div>

            {!routeGeometry && !fetchingRoute && (
              <button
                className="flex items-center gap-2 text-sm text-[#007A33] font-medium py-3 px-4 rounded-xl border-2 border-dashed border-emerald-200 bg-emerald-50 hover:bg-emerald-100 transition-colors"
                onClick={onDrawRequest}
              >
                <Pencil className="w-4 h-4" />
                Draw on map
                <span className="ml-auto text-xs text-emerald-600 opacity-70">click to place points</span>
              </button>
            )}

            {fetchingRoute && (
              <div className="flex items-center gap-2 text-xs text-slate-500 bg-slate-50 rounded-xl px-3 py-3">
                <Loader2 className="w-3.5 h-3.5 animate-spin flex-shrink-0" />
                Snapping to rail network…
              </div>
            )}

            {!fetchingRoute && routeGeometry && (
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2 text-xs text-emerald-700 bg-emerald-50 rounded-xl px-3 py-2.5">
                  <Check className="w-3.5 h-3.5 flex-shrink-0" />
                  {routeDurationSecs
                    ? `Rail route · ~${Math.round(routeDurationSecs / 60)} min${routeDistanceKm ? ` · ${routeDistanceKm} km` : ""}`
                    : `Track paved · ${routeGeometry.length} points`}
                </div>

                {routeWarnings.length > 0 && (
                  <div className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2.5">
                    {routeWarnings[0]}
                  </div>
                )}

                {isEditing ? (
                  <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5">
                    <Move className="w-3.5 h-3.5 text-amber-600 flex-shrink-0" />
                    <span className="text-xs text-amber-700 font-medium flex-1">Drag vertices to reshape</span>
                    <button
                      onClick={handleEditDone}
                      className="text-xs font-semibold text-[#007A33] hover:underline whitespace-nowrap"
                    >
                      Done ✓
                    </button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <button
                      className="flex-1 flex items-center justify-center gap-1.5 text-sm font-medium py-2 px-3 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 transition-colors"
                      onClick={handleEditRequest}
                    >
                      <Move className="w-3.5 h-3.5 text-slate-400" />
                      Fine-tune vertices
                    </button>
                    <button
                      className="flex items-center justify-center gap-1.5 text-sm text-slate-500 py-2 px-3 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 transition-colors"
                      onClick={() => { setRouteGeometry(null); onDrawRequest(); }}
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      Redraw
                    </button>
                  </div>
                )}
              </div>
            )}

            <p className="text-xs text-slate-400 text-center">
              Your track snaps to the local rail network where possible
            </p>
          </div>
        )}

        {/* ── Step 3 (was 2): Name & style ────────────────────────────────── */}
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
                  Add stops and we&apos;ll calculate the road route automatically.
                </p>

                {/* Stop search + map placement */}
                <div className="flex flex-col gap-2">
                  <div className="flex gap-2 items-stretch">
                    <div className="relative flex-1 min-w-0">
                      <Input
                        placeholder="Search for a stop or station…"
                        value={stopQuery}
                        onChange={(e) => {
                          setStopQuery(e.target.value);
                          searchStops(e.target.value);
                        }}
                        className="rounded-xl h-10 pr-8"
                        disabled={isEditing || !!pendingBusStop || placingBusStop}
                      />
                      {searching && (
                        <div className="absolute right-3 top-1/2 -translate-y-1/2 w-3 h-3 border-2 border-slate-300 border-t-transparent rounded-full animate-spin" />
                      )}
                    </div>
                    {onStartPinMode && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-10 shrink-0 rounded-xl gap-1.5 px-3 border-slate-200"
                        onClick={startPlaceBusStopOnMap}
                        disabled={isEditing || !!pendingBusStop || placingBusStop}
                        title="Place a new stop on the map"
                      >
                        <Crosshair className="w-4 h-4" />
                        <span className="hidden sm:inline text-xs font-medium">Place on map</span>
                      </Button>
                    )}
                  </div>

                  {placingBusStop && (
                    <div className="flex items-center justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50/90 px-3 py-2 text-xs text-amber-950">
                      <span>Click the map to place this stop.</span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs text-amber-900 hover:bg-amber-100"
                        onClick={cancelPlaceBusStopOnMap}
                      >
                        Cancel
                      </Button>
                    </div>
                  )}

                  {pendingBusStop && (
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50/80 p-3 flex flex-col gap-2">
                      <p className="text-xs font-medium text-emerald-900">
                        New stop · {pendingBusStop.lat.toFixed(5)}, {pendingBusStop.lon.toFixed(5)}
                      </p>
                      <Input
                        placeholder="Stop name"
                        value={pendingBusStopName}
                        onChange={(e) => setPendingBusStopName(e.target.value)}
                        className="rounded-lg h-9 bg-white"
                        autoFocus
                      />
                      {onSaveStation && (
                        <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            className="rounded border-slate-300"
                            checked={savePlacedStopToLibrary}
                            onChange={(e) => setSavePlacedStopToLibrary(e.target.checked)}
                          />
                          Also save to Stations (reuse later)
                        </label>
                      )}
                      <div className="flex gap-2 pt-0.5">
                        <Button
                          type="button"
                          size="sm"
                          className="rounded-lg h-8 bg-[#007A33] hover:bg-[#006629] text-white"
                          onClick={confirmPendingBusStop}
                        >
                          Add to route
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="rounded-lg h-8"
                          onClick={cancelPlaceBusStopOnMap}
                        >
                          Discard
                        </Button>
                      </div>
                    </div>
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
                    <p className="text-xs mt-1 text-center max-w-[220px]">
                      Search above or use Place on map to add stops
                    </p>
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

                {/* ── Routing mode toggle (GTA bus routes) ───────────────── */}
                {stops.length >= 2 && (
                  <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2.5">
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 mb-2">
                      Highway routing
                    </p>
                    <div className="grid grid-cols-2 gap-1.5">
                      {(["standard", "via407"] as const).map((mode) => (
                        <button
                          key={mode}
                          type="button"
                          onClick={() => setRoutingMode(mode)}
                          className={`flex flex-col items-start gap-0.5 rounded-lg border px-2.5 py-2 text-left text-xs font-semibold transition-all ${
                            routingMode === mode
                              ? "border-[#007A33] bg-white text-[#007A33] shadow-sm"
                              : "border-slate-200 bg-white text-slate-500 hover:border-slate-300"
                          }`}
                        >
                          <span>
                            {mode === "standard" ? "Standard (401/QEW)" : "Via 407 + 427 ✦toll"}
                          </span>
                          <span className={`text-[10px] font-normal leading-tight ${routingMode === mode ? "text-emerald-700" : "text-slate-400"}`}>
                            {mode === "standard"
                              ? "Fastest free highway"
                              : "Express toll corridor · airport"}
                          </span>
                        </button>
                      ))}
                    </div>
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
                          {routingMode === "via407" && (
                            <span className="ml-auto text-[10px] font-semibold text-amber-600 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5">
                              via 407/427
                            </span>
                          )}
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
                {routeType === "train" && (
                  <button
                    className="mt-1 flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700 transition-colors"
                    onClick={() => { setRouteGeometry(null); setStep("draw"); onDrawRequest(); }}
                  >
                    <RotateCcw className="w-3 h-3" />
                    Redraw track
                  </button>
                )}
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
            disabled={step === "draw" && (!routeGeometry || fetchingRoute)}
            onClick={() => {
              if (isEditing) handleEditDone();
              const i = steps.indexOf(step);
              if (i < steps.length - 1) setStep(steps[i + 1]);
            }}
          >
            {step === "draw" ? (
              routeGeometry ? <>Confirm track <ArrowRight className="w-4 h-4 ml-1" /></> : "Draw first"
            ) : (
              <>Next <ArrowRight className="w-4 h-4 ml-1" /></>
            )}
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
