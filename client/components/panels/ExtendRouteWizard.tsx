"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  ArrowLeft, ArrowRight, Check, Plus, X, MapPin, ChevronUp, ChevronDown, Loader2, Train, Bus,
  Pencil, Move, RotateCcw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  EnrichedRoute, CustomRoute, CustomStop, CustomSchedule, GTFSStop, ExtensionMeta, CustomStation,
  CustomTimetableTrip, StopTimeEntry,
} from "@/lib/gtfs";
import { CUSTOM_ROUTE_COLORS } from "@/lib/routeColors";
import { v4 as uuidv4 } from "uuid";

// ─── Types ──────────────────────────────────────────────────────────────────

interface ExtendRouteWizardProps {
  initialRoute?: EnrichedRoute;
  onSave: (route: CustomRoute) => void;
  onDrawRequest: () => void;
  onEditRequest: (
    coords: [number, number][],
    onChange: (coords: [number, number][]) => void
  ) => void;
  onEditDone: () => void;
  onPreviewRoute: (coords: [number, number][], color: string) => void;
  onClearPreview: () => void;
  onStartPinMode: (cb: (lat: number, lon: number) => void) => void;
  onStopPinMode: () => void;
  onCancel: () => void;
  drawGeometry?: [number, number][];
  /** Fires whenever a rail route is selected (or deselected) for extension. */
  onTrainModeChange?: (isTrain: boolean) => void;
  /** Custom stations created by the user — included in stop search results. */
  customStations?: CustomStation[];
}

type Step = 1 | 2 | 3 | 4;
type FreqChip = "quarter" | "half" | "same" | "custom";

// ─── Schedule builder ────────────────────────────────────────────────────────

function buildExtendedSchedule(
  parentWeeklyTrips: number,
  multiplier: number,
  headwayOverrideMins: number | null,
  direction: "one-way" | "two-way",
): CustomSchedule {
  const dailyTrips = Math.round(parentWeeklyTrips / 5);
  const baseHeadway = headwayOverrideMins ?? Math.round((16 * 60) / Math.max(1, dailyTrips));
  const effectiveHeadway = Math.round(baseHeadway / multiplier);
  const h = Math.max(5, Math.min(120, effectiveHeadway));

  return {
    type: "banded",
    direction,
    weekday: {
      active: true,
      bands: [
        { id: uuidv4(), label: "Morning peak",   startHour: 6,  startMin: 0, endHour: 9,  endMin: 0,  headwayMins: Math.max(5, Math.round(h * 0.6)) },
        { id: uuidv4(), label: "Midday",         startHour: 9,  startMin: 0, endHour: 15, endMin: 0,  headwayMins: h },
        { id: uuidv4(), label: "Afternoon peak", startHour: 15, startMin: 0, endHour: 19, endMin: 0,  headwayMins: Math.max(5, Math.round(h * 0.7)) },
        { id: uuidv4(), label: "Evening",        startHour: 19, startMin: 0, endHour: 22, endMin: 0,  headwayMins: Math.min(120, Math.round(h * 1.4)) },
      ],
    },
    saturday: {
      active: parentWeeklyTrips > 300,
      bands: parentWeeklyTrips > 300 ? [
        { id: uuidv4(), label: "All day", startHour: 7, startMin: 0, endHour: 21, endMin: 0, headwayMins: Math.min(120, h * 2) },
      ] : [],
    },
    sunday: { active: false, bands: [] },
  };
}

/** Reduce coords to at most `max` waypoints, keeping start + end. */
function sampleCoords(coords: [number, number][], max = 25): [number, number][] {
  if (coords.length <= max) return coords;
  const result: [number, number][] = [coords[0]];
  const step = (coords.length - 2) / (max - 2);
  for (let i = 1; i < max - 1; i++) {
    result.push(coords[Math.round(i * step)]);
  }
  result.push(coords[coords.length - 1]);
  return result;
}

function simplifyForEdit(coords: [number, number][], target = 60): [number, number][] {
  if (coords.length <= target) return coords;
  const step = Math.ceil(coords.length / target);
  return coords.filter((_, i) => i === 0 || i === coords.length - 1 || i % step === 0);
}

function distanceM(a: [number, number], b: [number, number]): number {
  const r = 6371000;
  const dLat = ((b[1] - a[1]) * Math.PI) / 180;
  const dLon = ((b[0] - a[0]) * Math.PI) / 180;
  const lat1 = (a[1] * Math.PI) / 180;
  const lat2 = (b[1] * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(h));
}

function geometryDistanceM(coords: [number, number][]): number {
  let total = 0;
  for (let i = 1; i < coords.length; i++) total += distanceM(coords[i - 1], coords[i]);
  return total;
}

function nearlySamePoint(a: [number, number], b: [number, number]): boolean {
  return distanceM(a, b) < 30;
}

function combineRailGeometry(
  baseStops: GTFSStop[],
  extensionStops: CustomStop[],
  drawnGeometry: [number, number][] | null,
): [number, number][] {
  const baseCoords = baseStops.map((stop) => [stop.stop_lon, stop.stop_lat] as [number, number]);
  const stopCoords = extensionStops.map((stop) => [stop.lon, stop.lat] as [number, number]);
  const extensionCoords = drawnGeometry && drawnGeometry.length >= 2 ? drawnGeometry : stopCoords;
  const result = [...baseCoords];
  for (const coord of extensionCoords) {
    const last = result[result.length - 1];
    if (!last || !nearlySamePoint(last, coord)) result.push(coord);
  }
  return result;
}

async function fetchDrivingRoute(coords: [number, number][]): Promise<{
  coordinates: [number, number][];
  durationSecs: number;
  distanceM: number;
} | null> {
  if (coords.length < 2) return null;
  const token = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;
  if (!token) return null;

  const sampled = sampleCoords(coords, 25);
  const coordStr = sampled.map(([lon, lat]) => `${lon},${lat}`).join(";");
  const res = await fetch(
    `https://api.mapbox.com/directions/v5/mapbox/driving/${coordStr}?access_token=${token}&geometries=geojson&overview=full&annotations=duration`
  );
  if (!res.ok) return null;

  const data = await res.json();
  const route = data.routes?.[0];
  const coordinates = route?.geometry?.coordinates as [number, number][] | undefined;
  if (!route || !coordinates || coordinates.length < 2) return null;

  return {
    coordinates,
    durationSecs: route.duration ?? 0,
    distanceM: route.distance ?? 0,
  };
}

async function fetchRailRoute(
  coords: [number, number][],
  dwellStopCount: number
): Promise<{
  geometry: [number, number][];
  durationSecs: number;
  distanceM: number;
}> {
  const sampled = sampleCoords(coords, 24);
  const res = await fetch("/api/rail/route", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      points: sampled,
      dwellStopCount,
      maxSnapDistanceM: 1800,
      terminalBufferSec: 60,
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Rail route unavailable");
  return data;
}

function baseStopKey(stop: GTFSStop, index: number): string {
  return `${stop.stop_id}:${index}`;
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function ExtendRouteWizard({
  initialRoute,
  onSave,
  onDrawRequest,
  onEditRequest,
  onEditDone,
  onPreviewRoute,
  onClearPreview,
  onStartPinMode,
  onStopPinMode,
  onCancel,
  drawGeometry,
  onTrainModeChange,
  customStations = [],
}: ExtendRouteWizardProps) {
  // ── Step management ────────────────────────────────────────────────────────
  const [step, setStep] = useState<Step>(initialRoute ? 2 : 1);

  // ── Step 1: route selection ────────────────────────────────────────────────
  const [allRoutes, setAllRoutes] = useState<EnrichedRoute[]>([]);
  const [routesLoading, setRoutesLoading] = useState(false);
  const [routeQuery, setRouteQuery] = useState("");
  const [selectedRoute, setSelectedRoute] = useState<EnrichedRoute | undefined>(initialRoute);
  const [selectedVariantId, setSelectedVariantId] = useState<string | undefined>(
    initialRoute?.variants[0]?.variant_id
  );
  const [branchStopIndex, setBranchStopIndex] = useState<number | null>(null);
  const [excludedBaseStopKeys, setExcludedBaseStopKeys] = useState<string[]>([]);
  const [rangeStartIndex, setRangeStartIndex] = useState<number | null>(null);
  const [rangeEndIndex, setRangeEndIndex] = useState<number | null>(null);

  // ── Step 2: extension stops ────────────────────────────────────────────────
  const [extensionStops, setExtensionStops] = useState<CustomStop[]>([]);
  const [stopQuery, setStopQuery] = useState("");
  const [stopResults, setStopResults] = useState<Array<{ stop_id: string; stop_name: string; lat: number; lon: number }>>([]);
  const [stopSearching, setStopSearching] = useState(false);
  const [pinActive, setPinActive] = useState(false);
  const [baseStops, setBaseStops] = useState<GTFSStop[]>([]);
  const [baseStopsLoading, setBaseStopsLoading] = useState(false);
  const [directionInfo, setDirectionInfo] = useState<{ durationSecs: number; distanceM: number } | null>(null);
  const [directionLoading, setDirectionLoading] = useState(false);
  const [extensionGeometry, setExtensionGeometry] = useState<[number, number][] | null>(null);
  const [routedRailGeometry, setRoutedRailGeometry] = useState<[number, number][] | null>(null);
  const [railRouteError, setRailRouteError] = useState<string | null>(null);
  const [isEditingGeometry, setIsEditingGeometry] = useState(false);
  const pinCounterRef = useRef(0);
  const ignoredDrawGeometryRef = useRef<[number, number][] | null>(null);

  // ── Step 3: name & options ─────────────────────────────────────────────────
  const [routeName, setRouteName] = useState("");
  const [branchSuffix, setBranchSuffix] = useState("R");
  const [color, setColor] = useState(CUSTOM_ROUTE_COLORS[0]);
  const [keepOriginal, setKeepOriginal] = useState(true);

  // ── Step 4: schedule ───────────────────────────────────────────────────────
  const [freqChip, setFreqChip] = useState<FreqChip>("same");
  const [customHeadway, setCustomHeadway] = useState<string>("");
  const [direction, setDirection] = useState<"one-way" | "two-way">("two-way");
  const [saving, setSaving] = useState(false);

  // ── Derived values ─────────────────────────────────────────────────────────
  const multiplier = freqChip === "quarter" ? 0.25 : freqChip === "half" ? 0.5 : freqChip === "same" ? 1 : 1;
  const headwayOverride = freqChip === "custom" && customHeadway ? Number(customHeadway) : null;
  const selectedVariant = selectedRoute?.variants.find((v) => v.variant_id === selectedVariantId)
    ?? selectedRoute?.variants[0];
  const isRailExtension = Boolean(selectedRoute?.is_rail);
  const hasDrawnRailExtension = Boolean(isRailExtension && extensionGeometry && extensionGeometry.length >= 2);
  const parentWeeklyTrips = selectedVariant
    ? (selectedVariant.weekly_trip_count ?? selectedVariant.trip_count ?? selectedRoute?.weekly_trips ?? 0)
    : (selectedRoute?.weekly_trips ?? 0);
  const estimatedWeeklyTrips = freqChip === "custom" && headwayOverride
    ? Math.round((16 * 60 / headwayOverride) * 5)
    : Math.round(parentWeeklyTrips * multiplier);
  const branchStop = branchStopIndex === null ? undefined : baseStops[branchStopIndex];
  const baseStopsThroughBranch = branchStopIndex === null
    ? baseStops
    : baseStops.slice(0, branchStopIndex + 1);
  const excludedBaseStopSet = new Set(excludedBaseStopKeys);
  const baseStopItems = baseStopsThroughBranch.map((stop, index) => {
    const required = index === 0 || index === baseStopsThroughBranch.length - 1;
    const key = baseStopKey(stop, index);
    return {
      stop,
      index,
      key,
      required,
      included: required || !excludedBaseStopSet.has(key),
    };
  });
  const includedBaseStops = baseStopItems.filter((item) => item.included).map((item) => item.stop);
  const removableBaseStopItems = baseStopItems.filter((item) => !item.required);
  const skippedBaseStopCount = baseStopItems.length - includedBaseStops.length;
  const rangeStart = rangeStartIndex ?? removableBaseStopItems[0]?.index ?? 0;
  const rangeEnd = rangeEndIndex ?? removableBaseStopItems[removableBaseStopItems.length - 1]?.index ?? rangeStart;
  const hasRouteChange = extensionStops.length > 0 || skippedBaseStopCount > 0 || hasDrawnRailExtension;
  const previewGeometry = isRailExtension
    ? combineRailGeometry(includedBaseStops, extensionStops, extensionGeometry)
    : [
        ...includedBaseStops.map((stop) => [stop.stop_lon, stop.stop_lat] as [number, number]),
        ...extensionStops.map((stop) => [stop.lon, stop.lat] as [number, number]),
      ];
  const canContinueFromStops = Boolean(
    branchStop &&
    hasRouteChange &&
    !baseStopsLoading &&
    (isRailExtension ? previewGeometry.length >= 2 : includedBaseStops.length + extensionStops.length >= 2)
  );
  const includedBaseStopKey = includedBaseStops
    .map((stop, index) => `${stop.stop_id}:${index}:${stop.stop_lat}:${stop.stop_lon}`)
    .join("|");
  const routeWaypoints: [number, number][] = previewGeometry;
  const railRoutePoints: [number, number][] = (() => {
    if (!isRailExtension) return routeWaypoints;
    const base = includedBaseStops.map((stop) => [stop.stop_lon, stop.stop_lat] as [number, number]);
    if (extensionStops.length > 0) {
      return [
        ...base,
        ...extensionStops.map((stop) => [stop.lon, stop.lat] as [number, number]),
      ];
    }
    if (extensionGeometry && extensionGeometry.length >= 2) {
      const sampledExtension = sampleCoords(extensionGeometry, 18);
      const result = [...base];
      for (const coord of sampledExtension) {
        const last = result[result.length - 1];
        if (!last || !nearlySamePoint(last, coord)) result.push(coord);
      }
      return result;
    }
    return base;
  })();
  const railRouteKey = railRoutePoints
    .map((point) => `${point[0].toFixed(5)},${point[1].toFixed(5)}`)
    .join("|");
  const railDwellStopCount = Math.max(0, includedBaseStops.length + extensionStops.length - 2);

  // ── Notify parent whenever rail extension status changes ──────────────────
  useEffect(() => {
    onTrainModeChange?.(isRailExtension);
    return () => { onTrainModeChange?.(false); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRailExtension]);

  // ── Load routes for step 1 ─────────────────────────────────────────────────
  useEffect(() => {
    if (initialRoute) return; // skip if pre-selected
    setRoutesLoading(true);
    fetch("/api/routes")
      .then((r) => r.json())
      .then((d) => { setAllRoutes(d.routes ?? []); setRoutesLoading(false); })
      .catch(() => setRoutesLoading(false));
  }, [initialRoute]);

  useEffect(() => {
    const variantId = selectedRoute?.variants[0]?.variant_id;
    setSelectedVariantId(variantId);
    setBaseStops([]);
    setBranchStopIndex(null);
    setExcludedBaseStopKeys([]);
    setRangeStartIndex(null);
    setRangeEndIndex(null);
    setExtensionGeometry(null);
    setRoutedRailGeometry(null);
    setRailRouteError(null);
    setIsEditingGeometry(false);
    onEditDone();
  }, [selectedRoute, onEditDone]);

  useEffect(() => {
    if (!isRailExtension || !drawGeometry || drawGeometry.length < 2) return;
    if (drawGeometry === ignoredDrawGeometryRef.current) return;
    setExtensionGeometry(drawGeometry);
    setRoutedRailGeometry(null);
    setRailRouteError(null);
  }, [drawGeometry, isRailExtension]);

  // ── Load base stops when branch variant selected ──────────────────────────
  useEffect(() => {
    if (!selectedVariantId) {
      setBaseStops([]);
      setBranchStopIndex(null);
      setBaseStopsLoading(false);
      return;
    }
    setBaseStopsLoading(true);
    fetch(`/api/variant-stops?variant_id=${encodeURIComponent(selectedVariantId)}`)
      .then((r) => r.json())
      .then((d) => {
        const stops: GTFSStop[] = d.stops ?? [];
        setBaseStops(stops);
        setBranchStopIndex(stops.length > 0 ? stops.length - 1 : null);
        setExcludedBaseStopKeys([]);
        setRangeStartIndex(null);
        setRangeEndIndex(null);
        setRoutedRailGeometry(null);
        setRailRouteError(null);
        setBaseStopsLoading(false);
      })
      .catch(() => {
        setBaseStops([]);
        setBranchStopIndex(null);
        setExcludedBaseStopKeys([]);
        setRangeStartIndex(null);
        setRangeEndIndex(null);
        setRoutedRailGeometry(null);
        setRailRouteError(null);
        setBaseStopsLoading(false);
      });
  }, [selectedVariantId]);

  // ── Pre-fill name when route/suffix/extensionStops changes ────────────────
  useEffect(() => {
    if (!selectedRoute) return;
    const lastStop = extensionStops[extensionStops.length - 1]?.name
      ?? (hasDrawnRailExtension ? "Drawn extension" : undefined)
      ?? branchStop?.stop_name
      ?? selectedRoute.to_stop;
    setRouteName(`${selectedRoute.short_name}${branchSuffix} — ${lastStop}`);
  }, [selectedRoute, branchSuffix, extensionStops, branchStop?.stop_name, hasDrawnRailExtension]);

  // ── Stop search (GTFS + custom stations) ──────────────────────────────────
  useEffect(() => {
    if (!stopQuery.trim()) { setStopResults([]); return; }
    const q = stopQuery.toLowerCase();

    // Immediately show matching custom stations (client-side, no latency)
    const stationMatches = customStations
      .filter((s) => s.name.toLowerCase().includes(q))
      .map((s) => ({ stop_id: `station:${s.id}`, stop_name: s.name, lat: s.lat, lon: s.lon }));

    if (stationMatches.length > 0) {
      setStopResults(stationMatches);
    }

    const tid = setTimeout(() => {
      setStopSearching(true);
      fetch(`/api/stops?q=${encodeURIComponent(stopQuery)}`)
        .then((r) => r.json())
        .then((d) => {
          const gtfsStops = d.stops ?? [];
          // Merge: custom stations first, then GTFS, dedup by name
          const seen = new Set(stationMatches.map((s) => s.stop_name.toLowerCase()));
          const merged = [
            ...stationMatches,
            ...gtfsStops.filter((s: { stop_name: string }) => !seen.has(s.stop_name.toLowerCase())),
          ];
          setStopResults(merged);
          setStopSearching(false);
        })
        .catch(() => { setStopResults(stationMatches); setStopSearching(false); });
    }, 250);
    return () => clearTimeout(tid);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stopQuery, customStations]);

  // ── Directions fetch ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!branchStop) {
      setDirectionInfo(null);
      onClearPreview();
      return;
    }

    if (!hasRouteChange || routeWaypoints.length < 2) {
      setDirectionInfo(null);
      onClearPreview();
      return;
    }

    if (isRailExtension) {
      if (isEditingGeometry) return;
      let cancelled = false;
      setDirectionLoading(true);
      setRailRouteError(null);
      setRoutedRailGeometry(null);
      fetchRailRoute(railRoutePoints, railDwellStopCount)
        .then((route) => {
          if (cancelled) return;
          if (route.geometry.length >= 2) {
            setRoutedRailGeometry(route.geometry);
            setDirectionInfo({ durationSecs: route.durationSecs, distanceM: route.distanceM });
            onPreviewRoute(route.geometry, color);
          } else {
            throw new Error("Rail route returned no geometry");
          }
          setDirectionLoading(false);
        })
        .catch((err) => {
          if (cancelled) return;
          const distanceM = geometryDistanceM(previewGeometry);
          const durationSecs = Math.round((distanceM / 1000 / 65) * 3600);
          setRoutedRailGeometry(null);
          setRailRouteError(`${err instanceof Error ? err.message : "Rail route unavailable"} Using manual line.`);
          setDirectionInfo({ durationSecs, distanceM });
          onPreviewRoute(previewGeometry, color);
          setDirectionLoading(false);
        });
      return () => {
        cancelled = true;
      };
    }

    let cancelled = false;
    setDirectionLoading(true);
    fetchDrivingRoute(routeWaypoints)
      .then((route) => {
        if (cancelled) return;
        if (route) {
          setDirectionInfo({ durationSecs: route.durationSecs, distanceM: route.distanceM });
          onPreviewRoute(route.coordinates, color);
        } else {
          setDirectionInfo(null);
          onPreviewRoute(routeWaypoints, color);
        }
        setDirectionLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setDirectionInfo(null);
        onPreviewRoute(routeWaypoints, color);
        setDirectionLoading(false);
      });

    return () => {
      cancelled = true;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    extensionStops,
    branchStop,
    color,
    skippedBaseStopCount,
    includedBaseStopKey,
    hasRouteChange,
    isRailExtension,
    isEditingGeometry,
    extensionGeometry,
    railRouteKey,
  ]);

  // ── Cleanup pin mode on unmount ───────────────────────────────────────────
  useEffect(() => {
    return () => {
      onStopPinMode();
      onEditDone();
      onClearPreview();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleSelectRoute = useCallback((route: EnrichedRoute) => {
    ignoredDrawGeometryRef.current = drawGeometry ?? null;
    setSelectedRoute(route);
    setStep(2);
  }, [drawGeometry]);

  const handleAddStop = useCallback((stop: { stop_id?: string; stop_name: string; lat: number; lon: number }) => {
    setExtensionStops((prev) => [
      ...prev,
      { id: uuidv4(), name: stop.stop_name, lat: stop.lat, lon: stop.lon, sequence: prev.length + 1 },
    ]);
    setStopQuery("");
    setStopResults([]);
  }, []);

  const handleRemoveStop = useCallback((id: string) => {
    setExtensionStops((prev) => prev.filter((s) => s.id !== id));
  }, []);

  const handleToggleBaseStop = useCallback((key: string, skipped: boolean) => {
    setExcludedBaseStopKeys((prev) => {
      if (skipped) return Array.from(new Set([...prev, key]));
      return prev.filter((item) => item !== key);
    });
  }, []);

  const handleRemoveBaseStopRange = useCallback(() => {
    const start = Math.min(rangeStart, rangeEnd);
    const end = Math.max(rangeStart, rangeEnd);
    const keys = baseStopItems
      .filter((item) => !item.required && item.index >= start && item.index <= end)
      .map((item) => item.key);

    setExcludedBaseStopKeys((prev) => Array.from(new Set([...prev, ...keys])));
  }, [baseStopItems, rangeStart, rangeEnd]);

  const handleMoveStop = useCallback((idx: number, dir: -1 | 1) => {
    setExtensionStops((prev) => {
      const next = [...prev];
      const target = idx + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });
  }, []);

  const togglePinMode = useCallback(() => {
    if (pinActive) {
      onStopPinMode();
      setPinActive(false);
    } else {
      onStartPinMode((lat, lon) => {
        pinCounterRef.current += 1;
        handleAddStop({ stop_name: `Stop ${pinCounterRef.current}`, lat, lon });
      });
      setPinActive(true);
    }
  }, [pinActive, onStartPinMode, onStopPinMode, handleAddStop]);

  const handleDrawExtension = useCallback(() => {
    if (pinActive) {
      onStopPinMode();
      setPinActive(false);
    }
    setIsEditingGeometry(false);
    setRoutedRailGeometry(null);
    setRailRouteError(null);
    ignoredDrawGeometryRef.current = drawGeometry ?? null;
    onEditDone();
    onDrawRequest();
  }, [drawGeometry, onDrawRequest, onEditDone, onStopPinMode, pinActive]);

  const handleEditExtensionGeometry = useCallback(() => {
    if (!extensionGeometry || extensionGeometry.length < 2) return;
    if (pinActive) {
      onStopPinMode();
      setPinActive(false);
    }
    const editCoords = simplifyForEdit(extensionGeometry);
    setIsEditingGeometry(true);
    setRoutedRailGeometry(null);
    onEditRequest(editCoords, (coords) => {
      setExtensionGeometry(coords);
    });
  }, [extensionGeometry, onEditRequest, onStopPinMode, pinActive]);

  const handleEditGeometryDone = useCallback(() => {
    setIsEditingGeometry(false);
    onEditDone();
  }, [onEditDone]);

  const handleRedrawExtension = useCallback(() => {
    setExtensionGeometry(null);
    setRoutedRailGeometry(null);
    setRailRouteError(null);
    setIsEditingGeometry(false);
    ignoredDrawGeometryRef.current = drawGeometry ?? null;
    onEditDone();
    onClearPreview();
    onDrawRequest();
  }, [drawGeometry, onClearPreview, onDrawRequest, onEditDone]);

  const handleSave = useCallback(async () => {
    if (!selectedRoute || !branchStop) return;
    setSaving(true);

    try {
      // Convert base GTFSStops to CustomStop[]
      const baseCustomStops: CustomStop[] = includedBaseStops.map((s, i) => ({
        id: uuidv4(),
        name: s.stop_name,
        lat: s.stop_lat,
        lon: s.stop_lon,
        sequence: i + 1,
      }));

      const shouldUseDrawnEndpoint = selectedRoute.is_rail
        && extensionGeometry !== null
        && extensionGeometry.length >= 2
        && extensionStops.length === 0;
      const drawnEndpoint = shouldUseDrawnEndpoint
        ? extensionGeometry[extensionGeometry.length - 1]
        : null;

      // Re-sequence extension stops after base stops
      const resequencedExtension: CustomStop[] = drawnEndpoint
        ? [{
            id: uuidv4(),
            name: "Drawn extension endpoint",
            lat: drawnEndpoint[1],
            lon: drawnEndpoint[0],
            sequence: baseCustomStops.length + 1,
          }]
        : extensionStops.map((s, i) => ({
            ...s,
            sequence: baseCustomStops.length + i + 1,
          }));

      const allStops = [...baseCustomStops, ...resequencedExtension];

      // Build one geometry through retained base stops plus any added extension alignment.
      let geometry: [number, number][] | undefined;
      if (selectedRoute.is_rail) {
        geometry = routedRailGeometry ?? combineRailGeometry(includedBaseStops, extensionStops, extensionGeometry);
      } else {
        try {
          const routed = await fetchDrivingRoute(allStops.map((s) => [s.lon, s.lat] as [number, number]));
          geometry = routed?.coordinates;
        } catch {
          // fall back to straight-line below
        }
      }

      // Fallback: straight lines through all stops
      if (!geometry) {
        geometry = allStops.map((s) => [s.lon, s.lat] as [number, number]);
      }

      // ── Schedule ───────────────────────────────────────────────────────────
      // For train extensions: build a timetable that mirrors the parent GO
      // service, adding the rail-routed extension travel time to each trip.
      let schedule: CustomSchedule;
      const extensionTravelSecs = directionInfo ? directionInfo.durationSecs : 0;
      // Duration from route start to branch point is proportional to how many
      // base stops we retained vs the full parent variant.
      const baseStopRatio = baseCustomStops.length > 1
        ? (baseCustomStops.length - 1) / Math.max(1, includedBaseStops.length)
        : 1;

      if (selectedRoute.is_rail && selectedVariant && extensionTravelSecs > 0) {
        try {
          const today = new Date().toISOString().split("T")[0];
          const res = await fetch(
            `/api/variant-schedule?variant_id=${encodeURIComponent(selectedVariant.variant_id)}&date=${today}`
          );
          const data = await res.json();
          const parentTrips: { trip_id: string; departureSec: number; stops: { stopId: string; stopName: string; departureSec: number }[] }[]
            = data.trips ?? [];

          if (parentTrips.length > 0) {
            // Build a timetable trip for each parent trip, appending the extension stop timing
            const timetableTrips: CustomTimetableTrip[] = parentTrips.map((pt) => {
              // Find arrival time at the branch stop (last retained base stop)
              const branchStopTime = (() => {
                if (pt.stops.length === 0) return pt.departureSec;
                // Match by name since stop_ids may differ between GTFS and our lookup
                const branchName = branchStop.stop_name.toLowerCase();
                const match = pt.stops.find((s) => s.stopName.toLowerCase() === branchName);
                if (match) return match.departureSec;
                // Fallback: interpolate based on base stop ratio
                const idx = Math.round(baseStopRatio * (pt.stops.length - 1));
                return pt.stops[Math.min(idx, pt.stops.length - 1)]?.departureSec ?? pt.departureSec;
              })();

              // Per-stop timetable: all retained base stops + extension stops
              const stopTimes: StopTimeEntry[] = baseCustomStops.map((bs, idx) => {
                // Try exact name match in parent trip stops
                const ptStop = pt.stops.find((s) => s.stopName.toLowerCase() === bs.name.toLowerCase());
                const arrivalSec = ptStop?.departureSec ?? (() => {
                  const frac = idx / Math.max(1, baseCustomStops.length - 1);
                  const first = pt.stops[0]?.departureSec ?? pt.departureSec;
                  return Math.round(first + frac * (branchStopTime - first));
                })();
                return { stopId: bs.id, stopName: bs.name, arrivalSec };
              });

              // Add extension stops: distribute travel time evenly after branch stop
              resequencedExtension.forEach((es, idx) => {
                const frac = (idx + 1) / resequencedExtension.length;
                stopTimes.push({
                  stopId: es.id,
                  stopName: es.name,
                  arrivalSec: Math.round(branchStopTime + frac * extensionTravelSecs),
                });
              });

              return {
                id: pt.trip_id,
                departureSec: pt.departureSec,
                stopTimes,
              };
            });

            schedule = {
              type: "timetable",
              direction,
              timetableTrips,
            };
          } else {
            // No parent trips found → fall back to banded schedule
            schedule = buildExtendedSchedule(parentWeeklyTrips, multiplier, headwayOverride, direction);
          }
        } catch {
          // API error → fall back to banded schedule
          schedule = buildExtendedSchedule(parentWeeklyTrips, multiplier, headwayOverride, direction);
        }
      } else {
        schedule = buildExtendedSchedule(parentWeeklyTrips, multiplier, headwayOverride, direction);
      }

      const extensionMeta: ExtensionMeta = {
        parentRouteShortName: selectedRoute.short_name,
        parentRouteName: selectedRoute.long_name,
        parentRouteColor: selectedRoute.color,
        parentWeeklyTrips: selectedRoute.weekly_trips,
        branchSuffix,
        scheduleMultiplier: multiplier,
        keepOriginalRunning: keepOriginal,
        extensionTravelTimeMins: directionInfo ? Math.round(directionInfo.durationSecs / 60) : 0,
        baseStopCount: baseCustomStops.length,
        parentVariantId: selectedVariant?.variant_id,
        parentVariantLabel: selectedVariant?.label,
        branchStopName: branchStop.stop_name,
        branchStopSequence: branchStop.stop_sequence,
        originalBaseStopCount: baseStopsThroughBranch.length,
        skippedBaseStopCount,
      };

      const route: CustomRoute = {
        id: uuidv4(),
        name: routeName,
        color,
        type: selectedRoute.is_rail ? "train" : "bus",
        stops: allStops,
        geometry,
        schedule,
        createdAt: new Date().toISOString(),
        extension: extensionMeta,
      };

      onSave(route);
      onClearPreview();
    } finally {
      setSaving(false);
    }
  }, [
    selectedRoute, selectedVariant, branchStop, extensionStops, includedBaseStops, routeName, color,
    branchSuffix, keepOriginal, multiplier, headwayOverride, direction, directionInfo, parentWeeklyTrips,
    baseStopsThroughBranch.length, skippedBaseStopCount, extensionGeometry, onSave, onClearPreview,
    routedRailGeometry,
  ]);

  // ── Filtered routes for step 1 ─────────────────────────────────────────────
  const filteredRoutes = routeQuery.trim()
    ? allRoutes.filter(
        (r) =>
          r.short_name.toLowerCase().includes(routeQuery.toLowerCase()) ||
          r.long_name.toLowerCase().includes(routeQuery.toLowerCase())
      )
    : allRoutes;

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 pt-4 pb-3 border-b border-slate-100">
        <div className="flex items-center gap-2 mb-2">
          <button
            onClick={onCancel}
            className="p-1 rounded-lg hover:bg-slate-100 transition-colors text-slate-400 hover:text-slate-600"
            aria-label="Cancel"
          >
            <X className="w-4 h-4" />
          </button>
          <h2 className="font-semibold text-slate-900 text-base">Extend a GO Route</h2>
        </div>
        {/* Step indicator */}
        <div className="flex items-center gap-1.5">
          {([1, 2, 3, 4] as Step[]).map((s) => (
            <div
              key={s}
              className={`h-1.5 flex-1 rounded-full transition-colors ${
                s < step ? "bg-[#007A33]" : s === step ? "bg-[#007A33]" : "bg-slate-200"
              }`}
            />
          ))}
        </div>
        <p className="text-xs text-slate-400 mt-1.5">
          {step === 1 && "Select a base route"}
          {step === 2 && "Choose branch & add extension stops"}
          {step === 3 && "Name & options"}
          {step === 4 && "Schedule"}
        </p>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-3">

        {/* ── Step 1: Pick a route ── */}
        {step === 1 && (
          <>
            <Input
              placeholder="Search routes..."
              value={routeQuery}
              onChange={(e) => setRouteQuery(e.target.value)}
              className="h-9 text-sm"
            />
            {routesLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
              </div>
            ) : (
              <div className="flex flex-col gap-1.5">
                {filteredRoutes.map((route) => (
                  <button
                    key={route.route_id}
                    onClick={() => handleSelectRoute(route)}
                    className="w-full flex items-center gap-3 p-2.5 rounded-xl border border-transparent hover:border-slate-200 hover:bg-slate-50 text-left transition-colors"
                  >
                    <div
                      className="w-9 h-9 rounded-lg flex items-center justify-center text-white font-bold text-xs flex-shrink-0"
                      style={{ backgroundColor: route.color }}
                    >
                      {route.short_name}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800 truncate">{route.long_name || route.short_name}</p>
                      <p className="text-xs text-slate-400 truncate">{route.from_stop} → {route.to_stop}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1 flex-shrink-0">
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                        {route.weekly_trips.toLocaleString()}/wk
                      </Badge>
                      {route.is_rail ? <Train className="w-3 h-3 text-slate-300" /> : <Bus className="w-3 h-3 text-slate-300" />}
                    </div>
                  </button>
                ))}
                {filteredRoutes.length === 0 && !routesLoading && (
                  <p className="text-sm text-slate-400 text-center py-6">No routes found</p>
                )}
              </div>
            )}
          </>
        )}

        {/* ── Step 2: Add extension stops ── */}
        {step === 2 && selectedRoute && (
          <>
            {/* Base route badge */}
            <div className="flex items-center gap-2 p-2.5 rounded-xl bg-slate-50 border border-slate-100">
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold text-xs flex-shrink-0"
                style={{ backgroundColor: selectedRoute.color }}
              >
                {selectedRoute.short_name}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-slate-700 truncate">{selectedRoute.long_name}</p>
                <p className="text-xs text-slate-400">
                  Extending from <span className="font-medium">{branchStop?.stop_name ?? "selected stop"}</span>
                </p>
              </div>
            </div>

            {/* Base branch + branch stop controls */}
            <div className="flex flex-col gap-2 rounded-xl border border-slate-100 bg-white p-2.5">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Base branch</label>
                <select
                  value={selectedVariant?.variant_id ?? ""}
                  onChange={(e) => {
                    setSelectedVariantId(e.target.value);
                    setBaseStops([]);
                    setBranchStopIndex(null);
                    setExcludedBaseStopKeys([]);
                    setRangeStartIndex(null);
                    setRangeEndIndex(null);
                    setDirectionInfo(null);
                    setExtensionGeometry(null);
                    setRoutedRailGeometry(null);
                    setRailRouteError(null);
                    setIsEditingGeometry(false);
                    ignoredDrawGeometryRef.current = drawGeometry ?? null;
                    onEditDone();
                    onClearPreview();
                  }}
                  disabled={selectedRoute.variants.length === 0}
                  className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-xs text-slate-700 outline-none focus:border-[#007A33]"
                >
                  {selectedRoute.variants.map((variant) => (
                    <option key={variant.variant_id} value={variant.variant_id}>
                      {variant.label || variant.route_variant || variant.variant_id}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Start extension from stop</label>
                <select
                  value={branchStopIndex ?? ""}
                  onChange={(e) => {
                    setBranchStopIndex(Number(e.target.value));
                    setExcludedBaseStopKeys([]);
                    setRangeStartIndex(null);
                    setRangeEndIndex(null);
                    setDirectionInfo(null);
                    setExtensionGeometry(null);
                    setRoutedRailGeometry(null);
                    setRailRouteError(null);
                    setIsEditingGeometry(false);
                    ignoredDrawGeometryRef.current = drawGeometry ?? null;
                    onEditDone();
                    onClearPreview();
                  }}
                  disabled={baseStopsLoading || baseStops.length === 0}
                  className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-xs text-slate-700 outline-none focus:border-[#007A33] disabled:bg-slate-50 disabled:text-slate-400"
                >
                  {baseStops.map((stop, index) => (
                    <option key={`${stop.stop_id}-${index}`} value={index}>
                      {index + 1}. {stop.stop_name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Base stop count note */}
            {baseStopsLoading ? (
              <p className="text-xs text-slate-400 flex items-center gap-1">
                <Loader2 className="w-3 h-3 animate-spin" /> Loading base stops…
              </p>
            ) : (
              <p className="text-xs text-slate-500">
                Keeps <span className="font-medium">{includedBaseStops.length} of {baseStopsThroughBranch.length} base stops</span>{" "}
                through <span className="font-medium">{branchStop?.stop_name ?? "the selected stop"}</span>.
              </p>
            )}

            {isRailExtension && (
              <div className="flex flex-col gap-2 rounded-lg border border-slate-100 bg-white p-2.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-slate-700">Rail alignment</p>
                    <p className="text-[11px] text-slate-400">
                      Draw the new track from the branch stop, then refine the shape on the map.
                    </p>
                  </div>
                  {extensionGeometry && extensionGeometry.length >= 2 && !isEditingGeometry && (
                    <Badge variant="secondary" className="shrink-0 px-1.5 py-0 text-[10px]">
                      {extensionGeometry.length} pts
                    </Badge>
                  )}
                </div>

                {isEditingGeometry ? (
                  <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
                    <Move className="h-3.5 w-3.5 shrink-0 text-amber-600" />
                    <span className="min-w-0 flex-1 text-xs font-medium text-amber-700">
                      Drag vertices to reshape the extension.
                    </span>
                    <button
                      type="button"
                      onClick={handleEditGeometryDone}
                      className="text-xs font-semibold text-[#007A33] hover:underline"
                    >
                      Done
                    </button>
                  </div>
                ) : extensionGeometry && extensionGeometry.length >= 2 ? (
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={handleEditExtensionGeometry}
                      className="flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
                    >
                      <Move className="h-3.5 w-3.5 text-slate-400" />
                      Edit shape
                    </button>
                    <button
                      type="button"
                      onClick={handleRedrawExtension}
                      className="flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50"
                    >
                      <RotateCcw className="h-3.5 w-3.5 text-slate-400" />
                      Redraw
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={handleDrawExtension}
                    className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-[#007A33] hover:bg-emerald-100"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    Draw extension on map
                    <span className="ml-auto text-[11px] text-emerald-700/70">click points, then finish</span>
                  </button>
                )}
              </div>
            )}

            {/* Base stop editor */}
            {!baseStopsLoading && baseStopItems.length > 0 && (
              <div className="rounded-lg border border-slate-100 bg-white p-2.5">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div>
                    <p className="text-xs font-medium text-slate-700">Base stops</p>
                    <p className="text-[11px] text-slate-400">
                      Skip stops to make this branch express.
                    </p>
                  </div>
                  {skippedBaseStopCount > 0 && (
                    <button
                      type="button"
                      onClick={() => setExcludedBaseStopKeys([])}
                      className="rounded-md px-2 py-1 text-[11px] font-medium text-[#007A33] hover:bg-emerald-50"
                    >
                      Restore all
                    </button>
                  )}
                </div>

                {removableBaseStopItems.length > 0 && (
                  <div className="mb-2 grid grid-cols-[1fr_1fr_auto] gap-1.5">
                    <select
                      value={rangeStart}
                      onChange={(e) => setRangeStartIndex(Number(e.target.value))}
                      className="h-8 min-w-0 rounded-md border border-slate-200 bg-white px-1.5 text-[11px] text-slate-700 outline-none focus:border-[#007A33]"
                    >
                      {removableBaseStopItems.map((item) => (
                        <option key={`from-${item.key}`} value={item.index}>
                          {item.index + 1}. {item.stop.stop_name}
                        </option>
                      ))}
                    </select>
                    <select
                      value={rangeEnd}
                      onChange={(e) => setRangeEndIndex(Number(e.target.value))}
                      className="h-8 min-w-0 rounded-md border border-slate-200 bg-white px-1.5 text-[11px] text-slate-700 outline-none focus:border-[#007A33]"
                    >
                      {removableBaseStopItems.map((item) => (
                        <option key={`to-${item.key}`} value={item.index}>
                          {item.index + 1}. {item.stop.stop_name}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={handleRemoveBaseStopRange}
                      className="rounded-md bg-slate-900 px-2 text-[11px] font-medium text-white hover:bg-slate-700"
                    >
                      Skip
                    </button>
                  </div>
                )}

                <div className="max-h-44 overflow-y-auto rounded-md border border-slate-100">
                  {baseStopItems.map((item) => (
                    <div
                      key={item.key}
                      className={`flex items-center gap-2 border-b border-slate-50 px-2 py-1.5 last:border-b-0 ${
                        item.included ? "bg-white" : "bg-slate-50 text-slate-400"
                      }`}
                    >
                      <span className="w-5 flex-shrink-0 text-[10px] tabular-nums text-slate-400">
                        {item.index + 1}
                      </span>
                      <span className={`min-w-0 flex-1 truncate text-xs ${item.included ? "text-slate-700" : "line-through"}`}>
                        {item.stop.stop_name}
                      </span>
                      {item.required ? (
                        <Badge variant="secondary" className="px-1 py-0 text-[10px]">
                          keep
                        </Badge>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleToggleBaseStop(item.key, item.included)}
                          className={`rounded-md px-2 py-1 text-[11px] font-medium transition-colors ${
                            item.included
                              ? "text-slate-500 hover:bg-red-50 hover:text-red-600"
                              : "text-[#007A33] hover:bg-emerald-50"
                          }`}
                        >
                          {item.included ? "Skip" : "Keep"}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Branch point (locked) */}
            <div>
              <p className="text-xs font-medium text-slate-600 mb-1.5">Added stops</p>
              <div className="flex items-center gap-2 p-2 rounded-lg bg-slate-100 mb-1">
                <MapPin className="w-3.5 h-3.5 text-[#007A33] flex-shrink-0" />
                <span className="text-xs text-slate-600 truncate">{branchStop?.stop_name ?? "Select a branch stop"}</span>
                <Badge variant="secondary" className="text-[10px] px-1 py-0 ml-auto">branch point</Badge>
              </div>

              {/* Extension stop list */}
              {extensionStops.map((stop, idx) => (
                <div key={stop.id} className="flex items-center gap-2 p-2 rounded-lg hover:bg-slate-50 group mb-1">
                  <MapPin className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                  <span className="text-xs text-slate-700 flex-1 truncate">{stop.name}</span>
                  <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => handleMoveStop(idx, -1)}
                      disabled={idx === 0}
                      className="p-0.5 rounded hover:bg-slate-200 disabled:opacity-30"
                      aria-label="Move up"
                    >
                      <ChevronUp className="w-3 h-3 text-slate-500" />
                    </button>
                    <button
                      onClick={() => handleMoveStop(idx, 1)}
                      disabled={idx === extensionStops.length - 1}
                      className="p-0.5 rounded hover:bg-slate-200 disabled:opacity-30"
                      aria-label="Move down"
                    >
                      <ChevronDown className="w-3 h-3 text-slate-500" />
                    </button>
                    <button
                      onClick={() => handleRemoveStop(stop.id)}
                      className="p-0.5 rounded hover:bg-red-100 text-slate-400 hover:text-red-500"
                      aria-label="Remove stop"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Stop search */}
            <div className="relative">
              <Input
                placeholder={isRailExtension ? "Search for a station to add..." : "Search for a stop to add..."}
                value={stopQuery}
                onChange={(e) => setStopQuery(e.target.value)}
                className="h-9 text-sm pr-8"
              />
              {stopSearching && (
                <Loader2 className="absolute right-2.5 top-2.5 w-4 h-4 animate-spin text-slate-400" />
              )}
              {stopResults.length > 0 && (
                <div className="absolute top-full mt-1 left-0 right-0 bg-white border border-slate-200 rounded-xl shadow-lg z-10 overflow-hidden">
                  {stopResults.map((s) => (
                    <button
                      key={s.stop_id}
                      onClick={() => handleAddStop(s)}
                      className="w-full flex items-center gap-2 px-3 py-2 hover:bg-slate-50 text-left text-xs text-slate-700 border-b border-slate-50 last:border-0"
                    >
                      <Plus className="w-3 h-3 text-slate-400 flex-shrink-0" />
                      {s.stop_name}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Pin on map button */}
            <button
              onClick={togglePinMode}
              className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-medium transition-colors ${
                pinActive
                  ? "bg-[#007A33] text-white border-[#007A33]"
                  : "bg-white text-slate-700 border-slate-200 hover:border-[#007A33] hover:text-[#007A33]"
              }`}
            >
              <MapPin className="w-3.5 h-3.5" />
              {pinActive
                ? "Pinning active — tap Done to stop"
                : isRailExtension
                  ? "Pin station on map"
                  : "Pin stop on map"}
            </button>

            {/* Pin mode banner */}
            {pinActive && (
              <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-[#007A33]/10 border border-[#007A33]/20 text-xs text-[#007A33]">
                <span className="font-medium">Click on the map to pin a stop</span>
                <button
                  onClick={togglePinMode}
                  className="font-semibold hover:text-[#005f28] transition-colors"
                >
                  Done
                </button>
              </div>
            )}

            {/* Direction info */}
            {directionLoading && (
              <p className="text-xs text-slate-400 flex items-center gap-1">
                <Loader2 className="w-3 h-3 animate-spin" /> Calculating route…
              </p>
            )}
            {railRouteError && !directionLoading && isRailExtension && (
              <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-100 text-xs text-amber-700">
                {railRouteError}
              </div>
            )}
            {directionInfo && !directionLoading && (
              <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-100 text-xs text-emerald-700">
                {isRailExtension && routedRailGeometry ? "Rail graph route" : isRailExtension ? "Manual rail path" : "Mapbox route"}: ~{Math.round(directionInfo.durationSecs / 60)} min · {(directionInfo.distanceM / 1000).toFixed(1)} km
              </div>
            )}
          </>
        )}

        {/* ── Step 3: Name & options ── */}
        {step === 3 && selectedRoute && (
          <>
            <div>
              <label className="text-xs font-medium text-slate-700 mb-1.5 block">Route name</label>
              <Input
                value={routeName}
                onChange={(e) => setRouteName(e.target.value)}
                className="h-9 text-sm"
                placeholder="e.g. 30R — Richmond Hill"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-slate-700 mb-1.5 block">Branch suffix</label>
              <Input
                value={branchSuffix}
                onChange={(e) => setBranchSuffix(e.target.value.slice(0, 2).toUpperCase())}
                className="h-9 text-sm w-20"
                placeholder="R"
                maxLength={2}
              />
              <p className="text-xs text-slate-400 mt-1">Displayed as {selectedRoute.short_name}{branchSuffix || "R"}</p>
            </div>

            <div>
              <label className="text-xs font-medium text-slate-700 mb-1.5 block">Route colour</label>
              <div className="flex gap-2 flex-wrap">
                {CUSTOM_ROUTE_COLORS.map((c) => (
                  <button
                    key={c}
                    onClick={() => setColor(c)}
                    className={`w-7 h-7 rounded-lg border-2 transition-all ${
                      color === c ? "border-slate-800 scale-110" : "border-transparent hover:scale-105"
                    }`}
                    style={{ backgroundColor: c }}
                    aria-label={`Select colour ${c}`}
                  />
                ))}
              </div>
            </div>

            <button
              onClick={() => setKeepOriginal((v) => !v)}
              className={`flex items-center gap-2.5 p-3 rounded-xl border text-sm transition-colors ${
                keepOriginal
                  ? "border-[#007A33] bg-[#007A33]/5 text-[#007A33]"
                  : "border-slate-200 bg-white text-slate-600"
              }`}
            >
              <div className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 ${
                keepOriginal ? "border-[#007A33] bg-[#007A33]" : "border-slate-300"
              }`}>
                {keepOriginal && <Check className="w-2.5 h-2.5 text-white" />}
              </div>
              <span>Keep Route {selectedRoute.short_name} running alongside</span>
            </button>
          </>
        )}

        {/* ── Step 4: Schedule ── */}
        {step === 4 && selectedRoute && (
          <>
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-100 text-xs text-slate-600">
              Selected branch runs ~
              <span className="font-semibold"> {parentWeeklyTrips.toLocaleString()}</span> trips/week
            </div>

            <div>
              <label className="text-xs font-medium text-slate-700 mb-1.5 block">Frequency relative to parent</label>
              <div className="flex gap-2">
                {(["quarter", "half", "same", "custom"] as FreqChip[]).map((chip) => (
                  <button
                    key={chip}
                    onClick={() => setFreqChip(chip)}
                    className={`flex-1 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
                      freqChip === chip
                        ? "bg-slate-900 text-white border-slate-900"
                        : "bg-white text-slate-600 border-slate-200 hover:border-slate-400"
                    }`}
                  >
                    {chip === "quarter" ? "¼×" : chip === "half" ? "½×" : chip === "same" ? "Same" : "Custom"}
                  </button>
                ))}
              </div>
            </div>

            {freqChip === "custom" && (
              <div>
                <label className="text-xs font-medium text-slate-700 mb-1.5 block">Headway (minutes)</label>
                <Input
                  type="number"
                  min={5}
                  max={120}
                  value={customHeadway}
                  onChange={(e) => setCustomHeadway(e.target.value)}
                  className="h-9 text-sm w-28"
                  placeholder="e.g. 20"
                />
              </div>
            )}

            <div>
              <label className="text-xs font-medium text-slate-700 mb-1.5 block">Direction</label>
              <div className="flex gap-2">
                {(["one-way", "two-way"] as const).map((d) => (
                  <button
                    key={d}
                    onClick={() => setDirection(d)}
                    className={`flex-1 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
                      direction === d
                        ? "bg-slate-900 text-white border-slate-900"
                        : "bg-white text-slate-600 border-slate-200 hover:border-slate-400"
                    }`}
                  >
                    {d === "one-way" ? "One-way" : "Two-way"}
                  </button>
                ))}
              </div>
            </div>

            <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-100 text-xs text-emerald-700">
              <span className="font-semibold">{selectedRoute.short_name}{branchSuffix}</span> will run ~
              <span className="font-semibold"> {estimatedWeeklyTrips.toLocaleString()}</span> trips/week
            </div>
          </>
        )}
      </div>

      {/* Footer nav */}
      <div className="px-4 pb-4 pt-2 border-t border-slate-100 flex gap-2">
        {step > 1 && (
          <Button
            variant="outline"
            size="sm"
            className="gap-1"
            onClick={() => setStep((s) => (s - 1) as Step)}
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back
          </Button>
        )}

        {step < 4 && step !== 1 && (
          <Button
            size="sm"
            className="flex-1 gap-1 bg-[#007A33] hover:bg-[#005f28] text-white"
            disabled={step === 2 && !canContinueFromStops}
            onClick={() => {
              if (pinActive) { onStopPinMode(); setPinActive(false); }
              setStep((s) => (s + 1) as Step);
            }}
          >
            Next <ArrowRight className="w-3.5 h-3.5" />
          </Button>
        )}

        {step === 4 && (
          <Button
            size="sm"
            className="flex-1 gap-1 bg-[#007A33] hover:bg-[#005f28] text-white"
            disabled={saving || !routeName.trim()}
            onClick={handleSave}
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
            Save route
          </Button>
        )}
      </div>
    </div>
  );
}
