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
import { estimateTrainTravelSecsForPathLengthMeters } from "@/lib/trainRouteEstimate";
import { v4 as uuidv4 } from "uuid";

type Step = "type" | "draw" | "stops" | "schedule" | "review";

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
  /** Open the saved-stations panel (secondary entry from Create). */
  onOpenSavedStations?: () => void;
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
    description: "Draw the line you want; saved shape is used as-is for the map and simulation",
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

/** Mapbox Directions allows up to 25 coordinates; match our stop-routing stride. */
function sampleCoordsForMapboxDirections(coords: [number, number][]): [number, number][] {
  if (coords.length <= 25) return coords;
  return coords.filter(
    (_, i) =>
      i === 0 ||
      i === coords.length - 1 ||
      i % Math.ceil(coords.length / 23) === 0
  );
}

async function fetchMapboxDrivingRoute(coords: [number, number][]): Promise<{
  geometry: [number, number][];
  distanceM: number;
  durationSecs: number;
}> {
  const token = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;
  if (!token) throw new Error("Mapbox token missing");
  const sampled = sampleCoordsForMapboxDirections(coords);
  const coordStr = sampled.map(([lon, lat]) => `${lon},${lat}`).join(";");
  const url =
    `https://api.mapbox.com/directions/v5/mapbox/driving/${coordStr}` +
    `?access_token=${token}&geometries=geojson&overview=full`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Directions API ${res.status}`);
  const data = await res.json();
  const geometry = data.routes?.[0]?.geometry?.coordinates as [number, number][] | undefined;
  const distance = data.routes?.[0]?.distance as number | undefined;
  const duration = data.routes?.[0]?.duration as number | undefined;
  if (!geometry || geometry.length < 2) {
    throw new Error("No route found between these points");
  }
  return {
    geometry,
    distanceM: distance ?? 0,
    durationSecs: duration ?? 0,
  };
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
  onOpenSavedStations,
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
  // "banded" schedules behave like "frequency" inside the wizard
  const existingScheduleType = existingRoute?.schedule?.type;
  const [scheduleType, setScheduleType] = useState<"frequency" | "fixed">(
    existingScheduleType === "fixed" ? "fixed" : "frequency"
  );
  const [frequencyInterval, setFrequencyInterval] = useState(
    existingRoute?.schedule?.frequency?.weekday?.interval ?? 15
  );
  const [serviceStart, setServiceStart] = useState(
    existingRoute?.schedule?.frequency?.weekday?.start ?? "06:00"
  );
  const [serviceEnd, setServiceEnd] = useState(
    existingRoute?.schedule?.frequency?.weekday?.end ?? "23:00"
  );
  const [fixedDepartures, setFixedDepartures] = useState<string[]>(
    existingRoute?.schedule?.fixedDepartures ?? []
  );
  const [newDeparture, setNewDeparture] = useState("");
  const [returnEnabled, setReturnEnabled] = useState(
    (existingRoute?.schedule?.returnDepartures?.length ?? 0) > 0
  );
  const [returnDepartures, setReturnDepartures] = useState<string[]>(
    existingRoute?.schedule?.returnDepartures ?? []
  );
  const [newReturnDeparture, setNewReturnDeparture] = useState("");
  // Frequency-mode return direction
  const [returnFreqEnabled, setReturnFreqEnabled] = useState(
    !!existingRoute?.schedule?.returnFrequency
  );
  const [returnServiceStart, setReturnServiceStart] = useState(
    existingRoute?.schedule?.returnFrequency?.start ?? "06:00"
  );
  const [returnServiceEnd, setReturnServiceEnd] = useState(
    existingRoute?.schedule?.returnFrequency?.end ?? "23:00"
  );

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

  /** Rail + misc; bus stop-based fetch uses `lastBusStopDirectionsKeyRef` so edited geometry does not retrigger it. */
  const lastFetchKeyRef = useRef<string>("");
  /** Dedupes train drawGeometry → routeGeometry sync when the serialized line is unchanged. */
  const prevTrainDrawKeyRef = useRef<string>("");
  const lastBusStopDirectionsKeyRef = useRef<string>("");
  /** Latest line from Mapbox Draw (vertex edit). */
  const lastVertexEditCoordsRef = useRef<[number, number][] | null>(null);
  /** When true, finishing vertex edit re-runs driving directions through the edited handles. */
  const pendingSnapBusRouteAfterVertexEditRef = useRef(false);
  // Prevent re-seeding terminus stops if user clears them
  const stopsSeededRef = useRef(false);

  /** Bus: place a brand-new stop on the map (not from GTFS search). */
  const [placingBusStop, setPlacingBusStop] = useState(false);
  const [pendingBusStop, setPendingBusStop] = useState<{ lat: number; lon: number } | null>(null);
  const [pendingBusStopName, setPendingBusStopName] = useState("");
  const [savePlacedStopToLibrary, setSavePlacedStopToLibrary] = useState(false);

  // ── Train: place new station on map ──────────────────────────────────────
  const [placingTrainStation, setPlacingTrainStation] = useState(false);
  const [pendingTrainStation, setPendingTrainStation] = useState<{ lat: number; lon: number } | null>(null);
  const [pendingTrainStationName, setPendingTrainStationName] = useState("");
  const [saveTrainStationToLibrary, setSaveTrainStationToLibrary] = useState(true);
  // True when pin mode interrupted an active drawing session — resume after station placed/cancelled
  const resumeDrawAfterPinRef = useRef(false);

  // ── Snap drawn train geometry to actual rail network ─────────────────────
  const [isSnappingToRail, setIsSnappingToRail] = useState(false);
  const [snapRailError, setSnapRailError] = useState<string | null>(null);

  const snapGeometryToRail = useCallback(async (geometry: [number, number][]) => {
    if (geometry.length < 2) return;
    setIsSnappingToRail(true);
    setSnapRailError(null);
    try {
      // Use ~8 evenly-spaced waypoints from the drawn line as routing hints
      const step = Math.max(1, Math.floor((geometry.length - 1) / 7));
      const waypoints: [number, number][] = [];
      for (let i = 0; i < geometry.length; i += step) waypoints.push(geometry[i]);
      if (waypoints[waypoints.length - 1] !== geometry[geometry.length - 1]) {
        waypoints.push(geometry[geometry.length - 1]);
      }
      // drawGeometry is already [lon, lat] (Mapbox format) — same as the API's LngLat
      const res = await fetch("/api/rail/route", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ points: waypoints }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Rail routing failed");
      // API returns geometry as [lon, lat][] — same format the wizard stores
      const snapped: [number, number][] = data.geometry as [number, number][];
      setRouteGeometry(snapped);
      const km = geometryDistanceKm(snapped);
      setRouteDistanceKm(km);
      setRouteDurationSecs(data.travelSecs ?? (km != null ? estimateTrainTravelSecsForPathLengthMeters(km * 1000) : null));
      if (data.warnings?.length) setRouteWarnings(data.warnings);
    } catch (err) {
      setSnapRailError(err instanceof Error ? err.message : "Could not snap to rail network");
    } finally {
      setIsSnappingToRail(false);
    }
  }, []);

  function startPlaceTrainStationOnMap() {
    if (!onStartPinMode || isEditing || pendingTrainStation) return;
    // If the user is mid-draw (step=draw, no completed geometry yet), we need to
    // interrupt drawing. Map.tsx's startPinMode will stop MapboxDraw automatically.
    // Track this so we can restart drawing when they're done.
    resumeDrawAfterPinRef.current = step === "draw" && !routeGeometry;
    setPlacingTrainStation(true);
    onStartPinMode((lat, lon) => {
      setPendingTrainStation({ lat, lon });
      setPendingTrainStationName("");
      setSaveTrainStationToLibrary(true);
      onStopPinMode?.();
      setPlacingTrainStation(false);
    });
  }

  function cancelPlaceTrainStationOnMap() {
    setPlacingTrainStation(false);
    setPendingTrainStation(null);
    setPendingTrainStationName("");
    onStopPinMode?.();
    // Resume drawing if we interrupted it
    if (resumeDrawAfterPinRef.current) {
      resumeDrawAfterPinRef.current = false;
      onDrawRequest();
    }
  }

  function confirmPendingTrainStation() {
    if (!pendingTrainStation) return;
    const name = pendingTrainStationName.trim() || "New Station";
    const stop: CustomStop = {
      id: uuidv4(),
      name,
      lat: pendingTrainStation.lat,
      lon: pendingTrainStation.lon,
      sequence: stops.length + 1,
    };
    addStop(stop);
    if (saveTrainStationToLibrary && onSaveStation) {
      onSaveStation({
        name,
        lat: pendingTrainStation.lat,
        lon: pendingTrainStation.lon,
        type: "train",
        code: name.split(/\s+/).map((w: string) => w[0]).join("").slice(0, 4).toUpperCase(),
      });
    }
    setPendingTrainStation(null);
    setPendingTrainStationName("");
    // Resume drawing if we interrupted it
    if (resumeDrawAfterPinRef.current) {
      resumeDrawAfterPinRef.current = false;
      onDrawRequest();
    }
  }

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

  // ── Train: geometry is your drawn line (or straight segments between stations if you never drew) ──
  useEffect(() => {
    if (routeType !== "train") return;

    const hasDraw = Boolean(drawGeometry && drawGeometry.length >= 2);
    if (!hasDraw) {
      prevTrainDrawKeyRef.current = "";
    }

    if (hasDraw && drawGeometry) {
      const drawKey = drawGeometry.map((p) => `${p[0]},${p[1]}`).join("|");
      if (drawKey !== prevTrainDrawKeyRef.current) {
        prevTrainDrawKeyRef.current = drawKey;
        setRouteGeometry(drawGeometry);
      }
      const km = geometryDistanceKm(drawGeometry);
      setRouteDistanceKm(km);
      setRouteDurationSecs(
        km != null ? estimateTrainTravelSecsForPathLengthMeters(km * 1000) : null
      );
      setRouteError(null);
      setRouteWarnings([]);
      lastFetchKeyRef.current = "";
      return;
    }

    if (stops.length < 2) {
      setRouteGeometry(null);
      setRouteDistanceKm(null);
      setRouteDurationSecs(null);
      setRouteError(null);
      setRouteWarnings([]);
      return;
    }

    const coords = stops.map((s) => [s.lon, s.lat] as [number, number]);
    const stopsKey = stops.map((s) => `${s.lon},${s.lat}`).join("|");
    if (stopsKey === lastFetchKeyRef.current) return;
    lastFetchKeyRef.current = stopsKey;

    setRouteGeometry(coords);
    const km = geometryDistanceKm(coords);
    setRouteDistanceKm(km);
    setRouteDurationSecs(
      km != null ? estimateTrainTravelSecsForPathLengthMeters(km * 1000) : null
    );
    setRouteError(null);
    setRouteWarnings([]);
  }, [drawGeometry, routeType, stops]);

  // ── Auto-fetch directions for bus when stops change ────────────────────────
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
    if (key === lastBusStopDirectionsKeyRef.current) return;

    setFetchingRoute(true);
    setRouteError(null);

    const timer = setTimeout(async () => {
      try {
        const stopCoords = stops.map((s) => [s.lon, s.lat] as [number, number]);
        const { geometry, distanceM, durationSecs } = await fetchMapboxDrivingRoute(stopCoords);

        setRouteGeometry(geometry);
        setRouteDistanceKm(Math.round(distanceM / 100) / 10);
        setRouteDurationSecs(Math.round(durationSecs));
        setRouteWarnings([]);
        lastBusStopDirectionsKeyRef.current = key;
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
    pendingSnapBusRouteAfterVertexEditRef.current =
      routeType === "bus" && stops.length >= 2;
    setIsEditing(true);
    onEditRequest(routeGeometry, (newCoords) => {
      lastVertexEditCoordsRef.current = newCoords;
      setRouteGeometry(newCoords);
      if (routeType === "train" && newCoords.length >= 2) {
        const km = geometryDistanceKm(newCoords);
        setRouteDistanceKm(km);
        setRouteDurationSecs(
          km != null ? estimateTrainTravelSecsForPathLengthMeters(km * 1000) : null
        );
      }
    });
  }

  function handleEditDone() {
    const snapBusRoadsAfterEdit = pendingSnapBusRouteAfterVertexEditRef.current;
    pendingSnapBusRouteAfterVertexEditRef.current = false;

    setIsEditing(false);
    onEditDone();

    const waypointLine = lastVertexEditCoordsRef.current;
    if (
      routeType === "bus" &&
      snapBusRoadsAfterEdit &&
      stops.length >= 2 &&
      waypointLine &&
      waypointLine.length >= 2
    ) {
      void (async () => {
        setFetchingRoute(true);
        setRouteError(null);
        try {
          const { geometry, distanceM, durationSecs } =
            await fetchMapboxDrivingRoute(waypointLine);
          lastVertexEditCoordsRef.current = geometry;
          setRouteGeometry(geometry);
          setRouteDistanceKm(Math.round(distanceM / 100) / 10);
          setRouteDurationSecs(Math.round(durationSecs));
          setRouteWarnings([]);
        } catch (err) {
          setRouteError(err instanceof Error ? err.message : "Could not remap to roads");
        } finally {
          setFetchingRoute(false);
        }
      })();
    }
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
    lastFetchKeyRef.current = "";
    lastBusStopDirectionsKeyRef.current = "";
  }

  function removeStop(id: string) {
    setStops((prev) =>
      prev.filter((s) => s.id !== id).map((s, i) => ({ ...s, sequence: i + 1 }))
    );
    lastFetchKeyRef.current = "";
    lastBusStopDirectionsKeyRef.current = "";
  }

  function buildSchedule(): CustomSchedule {
    if (scheduleType === "fixed") {
      return {
        type: "fixed",
        fixedDepartures,
        ...(returnEnabled && returnDepartures.length > 0 ? { returnDepartures } : {}),
        direction: returnEnabled ? "two-way" : "one-way",
      };
    }
    return {
      type: "frequency",
      frequency: {
        weekday: { start: serviceStart, end: serviceEnd, interval: frequencyInterval },
        weekend: { start: serviceStart, end: serviceEnd, interval: frequencyInterval * 2 },
      },
      ...(returnFreqEnabled
        ? { returnFrequency: { start: returnServiceStart, end: returnServiceEnd } }
        : {}),
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
    pendingSnapBusRouteAfterVertexEditRef.current = false;
    if (isEditing) onEditDone();
    onClearPreview();
    onCancel();
  }

  const steps: Step[] = routeType === "train"
    ? ["type", "draw", "stops", "schedule", "review"]
    : ["type", "stops", "schedule", "review"];
  const stepIndex = steps.indexOf(step);

  // ── Step renderer ────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 pt-4 pb-3 border-b border-slate-100 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h2 className="font-semibold text-slate-900 text-base">Design a route</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Step {stepIndex + 1} of {steps.length}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {onOpenSavedStations && (
            <button
              type="button"
              onClick={onOpenSavedStations}
              className="text-xs font-medium text-slate-500 underline-offset-2 hover:text-slate-800 hover:underline"
            >
              Saved stations
            </button>
          )}
          <button onClick={handleCancel} className="text-slate-400 hover:text-slate-600 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
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
                    setStep("stops");
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

        {/* ── Step 2 (train only): draw path ─────────────────────── */}
        {step === "draw" && (
          <div className="flex flex-col gap-4">
            <div className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3.5 flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                <Train className="w-4 h-4 text-emerald-700" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-900">Draw your line</p>
                <p className="text-xs text-slate-500 mt-0.5">
                  Click the map to place points. Double-click or press Enter to finish—the green preview follows your line
                  exactly.
                </p>
              </div>
            </div>

            {!routeGeometry && (
              <button
                className="flex items-center gap-2 text-sm text-[#007A33] font-medium py-3 px-4 rounded-xl border-2 border-dashed border-emerald-200 bg-emerald-50 hover:bg-emerald-100 transition-colors"
                onClick={onDrawRequest}
              >
                <Pencil className="w-4 h-4" />
                Draw on map
                <span className="ml-auto text-xs text-emerald-600 opacity-70">click to place points</span>
              </button>
            )}

            {routeGeometry && (
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2 text-xs text-emerald-700 bg-emerald-50 rounded-xl px-3 py-2.5">
                  <Check className="w-3.5 h-3.5 flex-shrink-0" />
                  {routeDurationSecs
                    ? `Your line · ~${Math.round(routeDurationSecs / 60)} min${routeDistanceKm ? ` · ${routeDistanceKm} km` : ""}`
                    : `${routeGeometry.length} points on the map`}
                </div>

                {routeWarnings.length > 0 && (
                  <div className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2.5">
                    {routeWarnings[0]}
                  </div>
                )}

                {isEditing ? (
                  <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5">
                    <Move className="w-3.5 h-3.5 text-amber-600 flex-shrink-0" />
                    <span className="text-xs text-amber-700 font-medium flex-1">Drag points to adjust the line</span>
                    <button
                      onClick={handleEditDone}
                      className="text-xs font-semibold text-[#007A33] hover:underline whitespace-nowrap"
                    >
                      Done ✓
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    <div className="flex gap-2">
                      <button
                        className="flex-1 flex items-center justify-center gap-1.5 text-sm font-medium py-2 px-3 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 transition-colors"
                        onClick={handleEditRequest}
                      >
                        <Move className="w-3.5 h-3.5 text-slate-400" />
                        Edit shape
                      </button>
                      <button
                        className="flex items-center justify-center gap-1.5 text-sm text-slate-500 py-2 px-3 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 transition-colors"
                        onClick={() => { setRouteGeometry(null); setSnapRailError(null); onDrawRequest(); }}
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        Redraw
                      </button>
                    </div>

                    {/* ── Snap to rail ─────────────────────────────────────── */}
                    <button
                      className="flex items-center justify-center gap-2 text-sm font-medium py-2 px-3 rounded-xl border-2 border-dashed border-emerald-300 bg-emerald-50 hover:bg-emerald-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      disabled={isSnappingToRail}
                      onClick={() => routeGeometry && snapGeometryToRail(routeGeometry)}
                    >
                      {isSnappingToRail ? (
                        <Loader2 className="w-3.5 h-3.5 text-emerald-700 animate-spin" />
                      ) : (
                        <Train className="w-3.5 h-3.5 text-emerald-700" />
                      )}
                      <span className="text-emerald-800">
                        {isSnappingToRail ? "Snapping to rail…" : "Snap to existing rail track"}
                      </span>
                    </button>

                    {snapRailError && (
                      <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">
                        {snapRailError}
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* ── Station picker (draw step) ──────────────────────────────── */}
            <div className="border-t border-slate-100 pt-4 flex flex-col gap-2">
              <p className="text-xs font-medium text-slate-500">Add stations along your line</p>

              {!pendingTrainStation && (
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Input
                      placeholder="Search GO stations…"
                      value={stopQuery}
                      onChange={(e) => { setStopQuery(e.target.value); searchStops(e.target.value); }}
                      className="rounded-xl h-9 text-sm pr-7"
                      disabled={placingTrainStation}
                    />
                    {searching && (
                      <div className="absolute right-3 top-1/2 -translate-y-1/2 w-3 h-3 border-2 border-slate-300 border-t-transparent rounded-full animate-spin" />
                    )}
                  </div>
                  {onStartPinMode && (
                    <button
                      onClick={placingTrainStation ? cancelPlaceTrainStationOnMap : startPlaceTrainStationOnMap}
                      title={placingTrainStation ? "Cancel" : "Place new station on map"}
                      className={`flex-shrink-0 flex items-center gap-1 rounded-xl px-3 text-xs font-medium border transition-colors ${
                        placingTrainStation
                          ? "bg-amber-50 border-amber-200 text-amber-700"
                          : "bg-white border-slate-200 text-slate-600 hover:border-slate-400"
                      }`}
                    >
                      <MapPin className="w-3.5 h-3.5" />
                      {placingTrainStation ? "Cancel" : "New"}
                    </button>
                  )}
                </div>
              )}

              {placingTrainStation && !pendingTrainStation && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-700">
                  <p className="font-medium">Click anywhere on the map to place the station</p>
                </div>
              )}

              {pendingTrainStation && (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 flex flex-col gap-2">
                  <p className="text-xs font-semibold text-[#007A33] flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 flex-shrink-0" />
                    {pendingTrainStation.lat.toFixed(4)}, {pendingTrainStation.lon.toFixed(4)}
                  </p>
                  <input
                    autoFocus
                    type="text"
                    placeholder="Station name"
                    value={pendingTrainStationName}
                    onChange={(e) => setPendingTrainStationName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") confirmPendingTrainStation(); }}
                    className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-[#007A33]/30"
                  />
                  <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
                    <input type="checkbox" checked={saveTrainStationToLibrary} onChange={(e) => setSaveTrainStationToLibrary(e.target.checked)} className="rounded" />
                    Save to station library
                  </label>
                  <div className="flex gap-2">
                    <button onClick={cancelPlaceTrainStationOnMap} className="flex-1 rounded-lg border border-slate-200 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50">Cancel</button>
                    <button onClick={confirmPendingTrainStation} className="flex-1 rounded-lg bg-[#007A33] py-1.5 text-xs font-medium text-white hover:bg-[#005f28]">Add to route</button>
                  </div>
                </div>
              )}

              {stopResults.length > 0 && !pendingTrainStation && (
                <div className="rounded-xl border border-slate-100 shadow-sm bg-white overflow-hidden">
                  {stopResults.map((s) => {
                    const isCustom = s.id.startsWith("station:");
                    return (
                      <button
                        key={s.id}
                        className="w-full flex items-center gap-2 px-3 py-2.5 text-sm hover:bg-slate-50 text-left border-b border-slate-50 last:border-0"
                        onClick={() => addStop(s)}
                      >
                        {isCustom
                          ? <Train className="w-4 h-4 text-[#007A33] flex-shrink-0" />
                          : <MapPin className="w-4 h-4 text-slate-400 flex-shrink-0" />}
                        <span className="flex-1 truncate">{s.name}</span>
                        {isCustom && <span className="text-[10px] text-[#007A33] bg-emerald-50 rounded px-1.5 py-0.5 font-medium">saved</span>}
                        <Plus className="w-4 h-4 text-slate-300 flex-shrink-0" />
                      </button>
                    );
                  })}
                </div>
              )}

              {stops.length > 0 && (
                <div className="flex flex-col gap-1 pt-1">
                  <p className="text-xs text-slate-400">{stops.length} station{stops.length !== 1 ? "s" : ""} added</p>
                  {stops.map((s, i) => (
                    <div key={s.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-white border border-slate-100">
                      <div className="w-4 h-4 rounded-full flex items-center justify-center text-white text-[9px] font-bold flex-shrink-0" style={{ backgroundColor: color }}>{i + 1}</div>
                      <span className="text-xs text-slate-700 flex-1 truncate">{s.name}</span>
                      <button onClick={() => removeStop(s.id)} className="text-slate-300 hover:text-red-400 transition-colors"><X className="w-3 h-3" /></button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <p className="text-xs text-slate-400 text-center">
              Travel time is estimated from line length (not real-world timetables). Use Edit to reshape anytime.
            </p>
          </div>
        )}

        {/* ── Stops (includes name & style) ─────────────────────────────── */}
        {step === "stops" && (
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-4 rounded-xl border border-slate-100 bg-slate-50/80 p-3">
              <div>
                <Label className="text-sm font-medium text-slate-700 mb-1.5 block">
                  What should we call it?
                </Label>
                <Input
                  placeholder={routeType === "train" ? "e.g. East Bayfront Rail" : "e.g. Airport Express"}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="rounded-xl h-11"
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
                      type="button"
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
                              Drag points to adjust the route
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
                            <span className="ml-auto text-xs text-slate-400">few control points</span>
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
                  Search GO Transit stations or your saved stations to add them to the route. No station nearby? Place a new one directly on the map.
                </p>

                {/* Search + place button row */}
                {!pendingTrainStation && (
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Input
                        placeholder="Search GO stations…"
                        value={stopQuery}
                        onChange={(e) => {
                          setStopQuery(e.target.value);
                          searchStops(e.target.value);
                        }}
                        className="rounded-xl h-10 pr-8"
                        disabled={isEditing || placingTrainStation}
                      />
                      {searching && (
                        <div className="absolute right-3 top-1/2 -translate-y-1/2 w-3 h-3 border-2 border-slate-300 border-t-transparent rounded-full animate-spin" />
                      )}
                    </div>
                    {onStartPinMode && (
                      <button
                        onClick={placingTrainStation ? cancelPlaceTrainStationOnMap : startPlaceTrainStationOnMap}
                        disabled={isEditing}
                        title={placingTrainStation ? "Cancel placement" : "Place new station on map"}
                        className={`flex-shrink-0 flex items-center gap-1.5 rounded-xl px-3 text-xs font-medium border transition-colors ${
                          placingTrainStation
                            ? "bg-amber-50 border-amber-200 text-amber-700"
                            : "bg-white border-slate-200 text-slate-600 hover:border-slate-400 hover:text-slate-800"
                        }`}
                      >
                        <MapPin className="w-3.5 h-3.5" />
                        {placingTrainStation ? "Cancel" : "New"}
                      </button>
                    )}
                  </div>
                )}

                {/* Pin instruction banner */}
                {placingTrainStation && !pendingTrainStation && (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-700">
                    <p className="font-medium">Click anywhere on the map to place the station</p>
                    <p className="text-amber-600 mt-0.5">You can name it and save it to your station library</p>
                  </div>
                )}

                {/* Pending train station form */}
                {pendingTrainStation && (
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 flex flex-col gap-2.5">
                    <p className="text-xs font-semibold text-[#007A33] flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5 flex-shrink-0" />
                      {pendingTrainStation.lat.toFixed(4)}, {pendingTrainStation.lon.toFixed(4)}
                    </p>
                    <input
                      autoFocus
                      type="text"
                      placeholder="Station name (e.g. Guelph Central)"
                      value={pendingTrainStationName}
                      onChange={(e) => setPendingTrainStationName(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") confirmPendingTrainStation(); }}
                      className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-[#007A33]/30"
                    />
                    <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={saveTrainStationToLibrary}
                        onChange={(e) => setSaveTrainStationToLibrary(e.target.checked)}
                        className="rounded"
                      />
                      Save to my station library for reuse
                    </label>
                    <div className="flex gap-2 pt-0.5">
                      <button
                        onClick={cancelPlaceTrainStationOnMap}
                        className="flex-1 rounded-lg border border-slate-200 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={confirmPendingTrainStation}
                        className="flex-1 rounded-lg bg-[#007A33] py-1.5 text-xs font-medium text-white hover:bg-[#005f28]"
                      >
                        Add to route
                      </button>
                    </div>
                  </div>
                )}

                {/* Search results — custom stations first, then GO stops */}
                {stopResults.length > 0 && !pendingTrainStation && (
                  <div className="rounded-xl border border-slate-100 shadow-sm bg-white overflow-hidden">
                    {stopResults.map((s) => {
                      const isCustom = s.id.startsWith("station:");
                      return (
                        <button
                          key={s.id}
                          className="w-full flex items-center gap-2 px-3 py-2.5 text-sm hover:bg-slate-50 text-left border-b border-slate-50 last:border-0"
                          onClick={() => addStop(s)}
                        >
                          {isCustom
                            ? <Train className="w-4 h-4 text-[#007A33] flex-shrink-0" />
                            : <MapPin className="w-4 h-4 text-slate-400 flex-shrink-0" />
                          }
                          <span className="flex-1 truncate">{s.name}</span>
                          {isCustom && (
                            <span className="text-[10px] text-[#007A33] bg-emerald-50 rounded px-1.5 py-0.5 font-medium">saved</span>
                          )}
                          <Plus className="w-4 h-4 text-slate-300 flex-shrink-0" />
                        </button>
                      );
                    })}
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
                  {routeError && (
                    <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2.5">
                      <X className="w-3.5 h-3.5 flex-shrink-0" />
                      {routeError}
                    </div>
                  )}

                  {routeWarnings.length > 0 && (
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
                        <p className="text-xs text-amber-700 font-medium">Drag points to adjust the line</p>
                        <p className="text-[10px] text-amber-600">Tap + on the line if you need an extra point</p>
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
                          ? `Your line · ~${Math.round(routeDurationSecs / 60)} min${routeDistanceKm ? ` · ${routeDistanceKm} km` : ""}`
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
              <div className="flex flex-col gap-4">
                {/* Service window */}
                <div>
                  <Label className="text-sm font-medium text-slate-700 mb-2 block">Service hours</Label>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="flex flex-col gap-1">
                      <span className="text-xs text-slate-400">Start</span>
                      <Input
                        type="time"
                        value={serviceStart}
                        onChange={(e) => setServiceStart(e.target.value)}
                        className="rounded-xl h-9"
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className="text-xs text-slate-400">End</span>
                      <Input
                        type="time"
                        value={serviceEnd}
                        onChange={(e) => setServiceEnd(e.target.value)}
                        className="rounded-xl h-9"
                      />
                    </div>
                  </div>
                </div>

                {/* Frequency */}
                <div>
                  <Label className="text-sm font-medium text-slate-700 mb-2 block">Frequency</Label>
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
                  {/* Custom interval */}
                  <div className="mt-2 flex items-center gap-2">
                    <Input
                      type="number"
                      min={1}
                      max={240}
                      value={frequencyInterval}
                      onChange={(e) => {
                        const v = Math.max(1, Math.min(240, Number(e.target.value)));
                        setFrequencyInterval(v);
                      }}
                      className="rounded-xl h-9 w-24"
                    />
                    <span className="text-sm text-slate-500">min custom interval</span>
                  </div>
                  <p className="text-xs text-slate-400 mt-2">
                    Weekends run every {frequencyInterval * 2} min
                  </p>
                </div>

                {/* Return direction */}
                <div className="rounded-xl border border-slate-100 p-3">
                  <button
                    type="button"
                    onClick={() => setReturnFreqEnabled((v) => !v)}
                    className={`flex w-full items-center justify-between text-sm font-medium transition-colors ${
                      returnFreqEnabled ? "text-[#007A33]" : "text-slate-600"
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <Repeat className="w-4 h-4" />
                      Return direction
                    </span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      returnFreqEnabled ? "bg-emerald-100 text-[#007A33]" : "bg-slate-100 text-slate-400"
                    }`}>
                      {returnFreqEnabled ? "On" : "Off"}
                    </span>
                  </button>

                  {returnFreqEnabled && (
                    <div className="mt-3 flex flex-col gap-3">
                      <button
                        type="button"
                        onClick={() => {
                          setReturnServiceStart(serviceStart);
                          setReturnServiceEnd(serviceEnd);
                        }}
                        className="self-start text-xs text-[#007A33] underline underline-offset-2 hover:text-[#005f28]"
                      >
                        Copy from outbound
                      </button>
                      <div>
                        <Label className="text-xs text-slate-500 mb-1.5 block">Return service hours</Label>
                        <div className="grid grid-cols-2 gap-2">
                          <div className="flex flex-col gap-1">
                            <span className="text-xs text-slate-400">Start</span>
                            <Input
                              type="time"
                              value={returnServiceStart}
                              onChange={(e) => setReturnServiceStart(e.target.value)}
                              className="rounded-xl h-9"
                            />
                          </div>
                          <div className="flex flex-col gap-1">
                            <span className="text-xs text-slate-400">End</span>
                            <Input
                              type="time"
                              value={returnServiceEnd}
                              onChange={(e) => setReturnServiceEnd(e.target.value)}
                              className="rounded-xl h-9"
                            />
                          </div>
                        </div>
                      </div>
                      <p className="text-xs text-slate-400">
                        Same frequency ({frequencyInterval} min) in the return direction
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {scheduleType === "fixed" && (
              <div className="flex flex-col gap-4">
                {/* Outbound times */}
                <div>
                  <Label className="text-sm font-medium text-slate-700 mb-2 block">
                    Outbound departures
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

                {/* Return direction toggle */}
                <div className="rounded-xl border border-slate-100 p-3">
                  <button
                    type="button"
                    onClick={() => {
                      setReturnEnabled((v) => !v);
                      if (!returnEnabled && returnDepartures.length === 0) {
                        // Pre-fill with same times as outbound
                        setReturnDepartures([...fixedDepartures]);
                      }
                    }}
                    className={`flex w-full items-center justify-between text-sm font-medium transition-colors ${
                      returnEnabled ? "text-[#007A33]" : "text-slate-600"
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <Repeat className="w-4 h-4" />
                      Return direction times
                    </span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      returnEnabled ? "bg-emerald-100 text-[#007A33]" : "bg-slate-100 text-slate-400"
                    }`}>
                      {returnEnabled ? "On" : "Off"}
                    </span>
                  </button>

                  {returnEnabled && (
                    <div className="mt-3 flex flex-col gap-2">
                      {fixedDepartures.length > 0 && (
                        <button
                          type="button"
                          onClick={() => setReturnDepartures([...fixedDepartures])}
                          className="self-start text-xs text-[#007A33] underline underline-offset-2 hover:text-[#005f28]"
                        >
                          Copy from outbound
                        </button>
                      )}
                      <div className="flex gap-2">
                        <Input
                          type="time"
                          value={newReturnDeparture}
                          onChange={(e) => setNewReturnDeparture(e.target.value)}
                          className="rounded-xl h-9 flex-1"
                        />
                        <Button
                          size="sm"
                          className="rounded-xl bg-[#007A33] text-white"
                          onClick={() => {
                            if (newReturnDeparture && !returnDepartures.includes(newReturnDeparture)) {
                              setReturnDepartures((prev) => [...prev, newReturnDeparture].sort());
                              setNewReturnDeparture("");
                            }
                          }}
                        >
                          Add
                        </Button>
                      </div>
                      {returnDepartures.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {returnDepartures.map((t) => (
                            <Badge key={t} variant="secondary" className="gap-1 pr-1">
                              {t}
                              <button
                                onClick={() => setReturnDepartures((p) => p.filter((d) => d !== t))}
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
            disabled={
              (step === "draw" && !routeGeometry)
              || (step === "stops" && stops.length < 2)
            }
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
