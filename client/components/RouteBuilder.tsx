"use client";

import {
  Combobox,
  ComboboxInput,
  ComboboxContent,
  ComboboxList,
  ComboboxItem,
  ComboboxGroup,
  ComboboxLabel,
} from "@/components/ui/combobox";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import MapboxDraw from "@mapbox/mapbox-gl-draw";
import "@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css";
import {
  useRouteBuilder,
  ROUTE_COLORS,
  type Stop,
  type Schedule,
  getScheduleDirection,
} from "@/hooks/useRouteBuilder";
import { fetchDirections } from "@/lib/mapboxDirections";
import type { } from "@/lib/mapboxDirections";
import { RouteScorecard } from "@/components/RouteScorecard";
import type { ScheduleFrequency } from "@/hooks/useRouteBuilder";
import {
  ScheduleBuilderModal,
  type ScheduleRouteTarget,
} from "@/components/ScheduleBuilderModal";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const ROUTE_LAYER_ID = "route-builder-line";
const ROUTE_SOURCE_ID = "route-builder-route";
const SAVED_STOPS_KEY = "route_builder_saved_stops";

type SavedStop = {
  id: string;
  name: string;
  lat: number;
  lng: number;
};

type GoVariant = {
  variant_id: string;
  label: string;
  route_variant: string;
};

type GoScheduleBuilderPayload = {
  variantId: string;
  routeShortName: string;
  routeLabel: string;
  directionId: number;
  seededSchedule?: Schedule;
  stopTimings: Array<{
    stop_id: string;
    stop_name: string;
    stop_sequence: number;
    arrival_time: string;
    departure_time: string;
  }>;
  timedStopCount: number;
  departureCount: number;
  startStopName: string;
  endStopName: string;
};

type GoVariantsIndex = Record<string, GoVariant[]>;

type GoVariantStop = {
  stop_id: string;
  stop_name: string;
  stop_lat: number | null;
  stop_lon: number | null;
  stop_sequence: number;
};

type GoStopPoint = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  isStation: boolean;
  isUniversity: boolean;
  isStreet: boolean;
};

type RouteBuilderProps = {
  mapRef: React.RefObject<mapboxgl.Map | null>;
  mapReady: boolean;
  enabled: boolean;
  showPanel?: boolean;
  showSchedulePanel?: boolean;
  onCloseSchedule?: () => void;
  goVariantsIndex: GoVariantsIndex | null;
  goVariantStops: Record<string, GoVariantStop[]> | null;
  goRouteTypes?: Record<string, string>;
  showCustomNetwork?: boolean;
  onOpenComparison?: () => void;
};



const QUICK_STYLE_CONFIG = {
  normal: { label: "Normal (more stops)", spacingKm: 1.2 },
  medium: { label: "Medium", spacingKm: 2.4 },
  express: { label: "Express (fewer stops)", spacingKm: 4.8 },
} as const;

type QuickStyle = keyof typeof QUICK_STYLE_CONFIG;

function buildStopId(): string {
  return `stop-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function toRad(value: number): number {
  return (value * Math.PI) / 180;
}

function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return 2 * R * Math.asin(Math.sqrt(h));
}

function interpolateStops(
  start: Stop,
  end: Stop,
  count: number,
  namePrefix: string
): Stop[] {
  if (count <= 0) return [];
  const stops: Stop[] = [];
  for (let i = 1; i <= count; i += 1) {
    const t = i / (count + 1);
    stops.push({
      id: buildStopId(),
      name: `${namePrefix} ${i}`,
      lng: start.lng + (end.lng - start.lng) * t,
      lat: start.lat + (end.lat - start.lat) * t,
      timepoint: false,
    });
  }
  return stops;
}

function approximateDistanceKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
): number {
  const latRad = toRad((a.lat + b.lat) / 2);
  const x = (b.lng - a.lng) * Math.cos(latRad);
  const y = b.lat - a.lat;
  return Math.sqrt(x * x + y * y) * 111.32;
}

function distancePointToSegmentKm(
  p: { lat: number; lng: number },
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
): { distanceKm: number; t: number } {
  const latRad = toRad((a.lat + b.lat) / 2);
  const ax = a.lng * Math.cos(latRad);
  const ay = a.lat;
  const bx = b.lng * Math.cos(latRad);
  const by = b.lat;
  const px = p.lng * Math.cos(latRad);
  const py = p.lat;
  const abx = bx - ax;
  const aby = by - ay;
  const apx = px - ax;
  const apy = py - ay;
  const ab2 = abx * abx + aby * aby;
  const t = ab2 === 0 ? 0 : Math.max(0, Math.min(1, (apx * abx + apy * aby) / ab2));
  const cx = ax + abx * t;
  const cy = ay + aby * t;
  const dx = px - cx;
  const dy = py - cy;
  const km = Math.sqrt(dx * dx + dy * dy) * 111.32;
  return { distanceKm: km, t };
}

export function RouteBuilder({
  mapRef,
  mapReady,
  enabled,
  showPanel = true,
  showSchedulePanel = false,
  onCloseSchedule,
  goVariantsIndex,
  goVariantStops,
  goRouteTypes = {},
  showCustomNetwork = true,
  onOpenComparison,
}: RouteBuilderProps) {
  const {
    routes,
    currentRoute,
    activeRoute,
    stops,
    mode,
    geometrySource,
    route,
    loading,
    error,
    addStop,
    updateStop,
    removeStop,
    setStops,
    saveRoute,
    loadRoute,
    deleteRoute,
    clearRoute,
    updateCurrent,
    updateRouteById,
    loadFromGoVariant,
    setMode,
    applyManualGeometry,
  } = useRouteBuilder(goVariantStops);

  const [buildMode, setBuildMode] = useState<"quick" | "manual">("quick");
  const [quickStyle, setQuickStyle] = useState<QuickStyle | null>(null);
  const [quickGenerating, setQuickGenerating] = useState(false);
  const [, setQuickError] = useState<string | null>(null);
  const [, setQuickNoStops] = useState(false);
  const [quickStopsLoaded, setQuickStopsLoaded] = useState(false);
  const [includeUniversitiesExpress, ] = useState(false);
  const [selectedStopId, setSelectedStopId] = useState<string | null>(null);
  const [availableStops, setAvailableStops] = useState<GoStopPoint[]>([]);

  const [showGoVariantSelector, setShowGoVariantSelector] = useState(false);
  const [selectedGoVariant, setSelectedGoVariant] = useState<string | null>(null);
  const goScheduleCacheRef = useRef<Map<string, GoScheduleBuilderPayload>>(new Map());

  const goVariantOptions = useMemo(() => {
    if (!goVariantsIndex) return new Map();
    const groupedOptions = new Map<string, { value: string; label: string; routeShortName: string }[]>();

    Object.entries(goVariantsIndex).forEach(([routeShortName, variants]) => {
      const optionsForGroup: { value: string; label: string; routeShortName: string }[] = [];
      variants.forEach((variant) => {
        optionsForGroup.push({
          value: variant.variant_id,
          label: `${routeShortName} - ${variant.label}`,
          routeShortName,
        });
      });
      if (optionsForGroup.length > 0) {
        groupedOptions.set(routeShortName, optionsForGroup.sort((a, b) => a.label.localeCompare(b.label)));
      }
    });

    return new Map([...groupedOptions.entries()].sort((a, b) => a[0].localeCompare(b[0])));
  }, [goVariantsIndex]);
  
  const [pinMode, setPinMode] = useState(false);
  const [pinCandidate, setPinCandidate] = useState<{
    id: string;
    lat: number;
    lng: number;
  } | null>(null);
  const [pinName, setPinName] = useState("Pinned stop");
  const [showPinNameDialog, setShowPinNameDialog] = useState(false);
  const [showPinSaveDialog, setShowPinSaveDialog] = useState(false);
  const [isRailDrawing, setIsRailDrawing] = useState(false);
  // Keyed by stop.id so we can reconcile without full teardown/rebuild.
  const markerByIdRef = useRef<Map<string, mapboxgl.Marker>>(new Map());
  const drawRef = useRef<MapboxDraw | null>(null);
  const lastQuickEndpointsRef = useRef<string | null>(null);
  const lastQuickStyleKeyRef = useRef<string | null>(null);
  const rawQuickStartRef = useRef<Stop | null>(null);
  const rawQuickEndRef = useRef<Stop | null>(null);
  const routeColor = activeRoute.color;
  const isTrainMode = mode === "train";

  const isActive = enabled || showCustomNetwork;
  const selectedStop = useMemo(
    () => stops.find((s) => s.id === selectedStopId) ?? null,
    [stops, selectedStopId]
  );
  

  // Listen for add-stop events from command bar
  useEffect(() => {
    const handleAddStop = (e: Event) => {
      const detail = (e as CustomEvent<{ name: string; lat: number; lng: number }>).detail;
      if (detail) {
        addStop(detail.lng, detail.lat, detail.name);
      }
    };
    window.addEventListener("route-builder-add-stop", handleAddStop);
    return () => {
      window.removeEventListener("route-builder-add-stop", handleAddStop);
    };
  }, [addStop]);

  // Listen for AI-generated routes
  useEffect(() => {
    const handleAIRoute = (e: Event) => {
      const detail = (e as CustomEvent<{
        name: string;
        stops: Array<{ name: string; lat: number; lng: number }>;
        reasoning: string;
      }>).detail;

      if (detail && detail.stops) {
        // Convert AI stops to Stop objects
        const newStops: Stop[] = detail.stops.map((stop, index) => ({
          id: `stop-${Date.now()}-${index}`,
          name: stop.name,
          lng: stop.lng,
          lat: stop.lat,
          timepoint: index === 0 || index === detail.stops.length - 1,
        }));

        // Update current route with AI-generated data
        updateCurrent({
          name: detail.name,
          stops: newStops,
        });

        // Switch to quick mode so Generate can add corridor stops
        setBuildMode("quick");
        setQuickStyle(null);
      }
    };
    window.addEventListener("route-builder-ai-route", handleAIRoute);
    return () => {
      window.removeEventListener("route-builder-ai-route", handleAIRoute);
    };
  }, [updateCurrent]);

  // Finalize and save route with schedule prompt
  

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setQuickStopsLoaded(false);
    fetch("/api/gotransit/all-stops")
      .then((res) => res.json())
      .then((data: GeoJSON.FeatureCollection) => {
        if (cancelled) return;
        const points: GoStopPoint[] = (data.features || [])
          .map((feature) => {
            const coords = feature.geometry?.type === "Point"
              ? (feature.geometry.coordinates as [number, number])
              : null;
            if (!coords) return null;
            const props = feature.properties as {
              stop_id?: string;
              stop_name?: string;
              location_type?: string;
              parent_station?: string;
            };
            const name = props.stop_name || "Stop";
            const upper = name.toUpperCase();
            const locationType = String(props.location_type || "");
            const isStation =
              locationType === "1" ||
              upper.includes(" STATION") ||
              upper.includes("BUS TERMINAL") ||
              upper.includes("GO BUS") ||
              upper.includes("TRANSITWAY");
            const isUniversity = upper.includes("UNIVERSITY") || upper.includes("COLLEGE");
            const isStreet = !isStation && !props.parent_station;
            return {
              id: props.stop_id || `${coords[1]}-${coords[0]}`,
              name,
              lat: coords[1],
              lng: coords[0],
              isStation,
              isUniversity,
              isStreet,
            };
          })
          .filter(Boolean) as GoStopPoint[];
        setAvailableStops(points);
      })
      .catch(() => {
        if (!cancelled) setAvailableStops([]);
      })
      .finally(() => {
        if (!cancelled) setQuickStopsLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  const buildStopsFromGeometry = useCallback(
    (
      geometry: GeoJSON.LineString,
      style: QuickStyle,
      start: Stop,
      end: Stop
    ): { stops: Stop[]; hasNearbyStops: boolean } => {
      if (!geometry?.coordinates?.length) {
        return { stops: [start, end], hasNearbyStops: false };
      }
      const coords = geometry.coordinates.map(([lng, lat]) => ({ lng, lat }));
      const segmentLengths = coords.slice(1).map((coord, idx) =>
        approximateDistanceKm(coords[idx], coord)
      );
      const cumulative = [0];
      segmentLengths.forEach((len, idx) => {
        cumulative[idx + 1] = cumulative[idx] + len;
      });
      const routeLengthKm = cumulative[cumulative.length - 1] || 0;
      const styleConfig = QUICK_STYLE_CONFIG[style];
      const maxDistanceKm = 2;
      const spacingKm = styleConfig.spacingKm;
      const maxExtraByDuration = Number.POSITIVE_INFINITY;

      const candidates = availableStops
        .filter((stop) => {
          if (style !== "express") return true;
          if (stop.isStation) return true;
          return includeUniversitiesExpress && stop.isUniversity;
        })
        .filter((stop) => {
          // Keep raw start/end coordinates; avoid snapping to nearby stops
          const nearStart = haversineKm(stop, start) < 0.2;
          const nearEnd = haversineKm(stop, end) < 0.2;
          return !nearStart && !nearEnd;
        })
        .map((stop) => {
          let bestDistance = Number.POSITIVE_INFINITY;
          let bestAlong = 0;
          for (let i = 0; i < coords.length - 1; i += 1) {
            const segStart = coords[i];
            const segEnd = coords[i + 1];
            const { distanceKm, t } = distancePointToSegmentKm(stop, segStart, segEnd);
            if (distanceKm < bestDistance) {
              bestDistance = distanceKm;
              bestAlong = cumulative[i] + segmentLengths[i] * t;
            }
          }
          return { stop, distanceKm: bestDistance, alongKm: bestAlong };
        })
        .filter((item) => item.distanceKm <= maxDistanceKm)
        .sort((a, b) => a.alongKm - b.alongKm);

      const selected: Stop[] = [{ ...start, timepoint: true }];
      const selectedIntermediates: Stop[] = [];
      let lastKm = 0;
      candidates.forEach((item) => {
        if (item.alongKm < spacingKm) return;
        if (item.alongKm - lastKm < spacingKm * 0.8) return;
        if (item.alongKm > routeLengthKm - spacingKm * 0.5) return;
        selectedIntermediates.push({
          id: `gtfs-${item.stop.id}`,
          name: item.stop.name,
          lat: item.stop.lat,
          lng: item.stop.lng,
          timepoint: false,
        });
        lastKm = item.alongKm;
      });

      const normalExtras = selectedIntermediates.filter((_, idx) => idx < maxExtraByDuration);
      const reducedCount =
        style === "medium"
          ? Math.floor(normalExtras.length * 0.5)
          : style === "express"
            ? Math.floor(normalExtras.length * 0.2)
            : normalExtras.length;
      let finalExtras: Stop[] = [];
      if (style === "normal") {
        finalExtras = normalExtras;
      } else if (reducedCount > 0) {
        const step = Math.max(1, Math.floor(normalExtras.length / reducedCount));
        finalExtras = normalExtras.filter((_, idx) => idx % step === 0).slice(0, reducedCount);
      }

      selected.push(...finalExtras, { ...end, timepoint: true });
      return { stops: selected.slice(0, 25), hasNearbyStops: candidates.length > 0 };
    },
    [availableStops, includeUniversitiesExpress]
  );

  const generateQuickRoute = useCallback(
    async (style: QuickStyle, currentStops: Stop[]) => {
      if (isTrainMode) return;
      if (currentStops.length < 2) return;
      const token = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;
      if (!token) {
        setQuickError("Mapbox token not configured");
        return;
      }
      setQuickGenerating(true);
      setQuickError(null);
      setQuickNoStops(false);
      const rawStart = rawQuickStartRef.current ?? currentStops[0];
      const rawEnd = rawQuickEndRef.current ?? currentStops[currentStops.length - 1];
      const start = { ...rawStart, timepoint: true };
      const end = { ...rawEnd, timepoint: true };
      const result = await fetchDirections(
        [
          { lng: start.lng, lat: start.lat },
          { lng: end.lng, lat: end.lat },
        ],
        activeRoute.profile,
        token
      );
      if (!result.ok) {
        setQuickError(result.error.message);
        setQuickGenerating(false);
        return;
      }
      if (availableStops.length > 0) {
        const { stops: derivedStops, hasNearbyStops } = buildStopsFromGeometry(
          result.data.geometry,
          style,
          start,
          end
        );
        setStops(derivedStops);
        setQuickNoStops(!hasNearbyStops);
      } else {
        setStops([start, end]);
        setQuickNoStops(true);
      }
      setQuickStyle(style);
      setQuickGenerating(false);
    },
    [activeRoute.profile, availableStops.length, buildStopsFromGeometry, isTrainMode, setStops]
  );

  useEffect(() => {
    if (isTrainMode) return;
    if (buildMode !== "quick") return;
    if (stops.length !== 2) {
      lastQuickEndpointsRef.current = null;
      lastQuickStyleKeyRef.current = null;
      return;
    }
    if (!quickStopsLoaded || quickGenerating || quickStyle) return;
    const key = `${stops[0].id}-${stops[1].id}`;
    if (lastQuickEndpointsRef.current === key) return;
    lastQuickEndpointsRef.current = key;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    generateQuickRoute("normal", stops);
  }, [buildMode, stops, quickStopsLoaded, quickGenerating, quickStyle, generateQuickRoute, isTrainMode]);

  useEffect(() => {
    if (isTrainMode) return;
    if (buildMode !== "quick") return;
    if (quickStyle !== "express") return;
    if (stops.length !== 2) return;
    if (!quickStopsLoaded || quickGenerating) return;
    const key = `${stops[0].id}-${stops[1].id}-express-${includeUniversitiesExpress ? "u1" : "u0"}`;
    if (lastQuickStyleKeyRef.current === key) return;
    lastQuickStyleKeyRef.current = key;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    generateQuickRoute("express", stops);
  }, [buildMode, quickStyle, stops, quickStopsLoaded, quickGenerating, includeUniversitiesExpress, generateQuickRoute, isTrainMode]);

  

  

  const savePinnedStop = useCallback((stop: SavedStop) => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(SAVED_STOPS_KEY);
      const existing = raw ? (JSON.parse(raw) as SavedStop[]) : [];
      const next = Array.isArray(existing) ? existing : [];
      if (!next.find((s) => s.id === stop.id)) {
        next.push(stop);
      }
      window.localStorage.setItem(SAVED_STOPS_KEY, JSON.stringify(next));
      window.dispatchEvent(new CustomEvent("route-builder-saved-stop", { detail: stop }));
    } catch {
      // ignore storage errors
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const startPin = () => {
      setPinMode(true);
      setSelectedStopId(null);
    };
    window.addEventListener("route-builder-pin-start", startPin);
    return () => {
      window.removeEventListener("route-builder-pin-start", startPin);
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!showPanel && pinMode) {
      window.dispatchEvent(new CustomEvent("route-builder-open"));
    }
  }, [pinMode, showPanel]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const openBuilder = () => window.dispatchEvent(new CustomEvent("route-builder-open"));
    window.addEventListener("route-builder-pin-complete", openBuilder);
    return () => {
      window.removeEventListener("route-builder-pin-complete", openBuilder);
    };
  }, []);

  const applyPinnedStop = useCallback(
    (stop: Stop) => {
      if (stops.length === 0) {
        rawQuickStartRef.current = stop;
        setStops([stop]);
        return;
      }
      if (stops.length === 1) {
        rawQuickEndRef.current = stop;
        setStops([stops[0], stop]);
        return;
      }
      setStops([...stops, stop]);
    },
    [stops, setStops]
  );

  

  const setStopAsStart = useCallback(
    (id: string) => {
      const idx = stops.findIndex((s) => s.id === id);
      if (idx <= 0) return;
      const reordered = [stops[idx], ...stops.filter((s) => s.id !== id)];
      const next = reordered.map((s, i) => ({
        ...s,
        timepoint: i === 0 || i === reordered.length - 1 ? true : s.timepoint,
      }));
      rawQuickStartRef.current = next[0];
      setStops(next);
    },
    [stops, setStops]
  );

  const setStopAsEnd = useCallback(
    (id: string) => {
      const idx = stops.findIndex((s) => s.id === id);
      if (idx < 0 || idx === stops.length - 1) return;
      const reordered = [...stops.filter((s) => s.id !== id), stops[idx]];
      const next = reordered.map((s, i) => ({
        ...s,
        timepoint: i === 0 || i === reordered.length - 1 ? true : s.timepoint,
      }));
      rawQuickEndRef.current = next[next.length - 1];
      setStops(next);
    },
    [stops, setStops]
  );

  const reorderStops = useCallback(
    (fromId: string, toId: string) => {
      if (fromId === toId) return;
      const fromIndex = stops.findIndex((s) => s.id === fromId);
      const toIndex = stops.findIndex((s) => s.id === toId);
      if (fromIndex < 0 || toIndex < 0) return;
      const next = [...stops];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      setStops(next);
    },
    [stops, setStops]
  );

  const startRailDraw = useCallback(() => {
    const map = mapRef.current;
    if (!map || !drawRef.current || !isTrainMode || stops.length < 2) return;
    drawRef.current.deleteAll();
    drawRef.current.changeMode("draw_line_string");
    map.getCanvas().style.cursor = "crosshair";
    setIsRailDrawing(true);
  }, [isTrainMode, mapRef, stops.length]);

  const cancelRailDraw = useCallback(() => {
    const map = mapRef.current;
    if (drawRef.current) {
      drawRef.current.deleteAll();
      drawRef.current.changeMode("simple_select");
    }
    if (map) {
      map.getCanvas().style.cursor = "";
    }
    setIsRailDrawing(false);
  }, [mapRef]);

  // Ensure route layer exists when active; remove on unmount
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !isActive) return;

    const ensureLayer = () => {
      if (!map.getSource(ROUTE_SOURCE_ID)) {
        map.addSource(ROUTE_SOURCE_ID, {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] },
        });
      }
      if (!map.getLayer(ROUTE_LAYER_ID)) {
        map.addLayer({
          id: ROUTE_LAYER_ID,
          type: "line",
          source: ROUTE_SOURCE_ID,
          layout: { "line-join": "round", "line-cap": "round" },
          paint: {
            "line-color": routeColor,
            "line-width": 4,
          },
        });
      } else {
        map.setPaintProperty(ROUTE_LAYER_ID, "line-color", routeColor);
      }
    };

    if (map.isStyleLoaded()) {
      ensureLayer();
    } else {
      map.once("style.load", ensureLayer);
    }
    return () => {
      map.off("style.load", ensureLayer);
      if (!(map as mapboxgl.Map & { style?: unknown }).style) return;
      if (map.getLayer(ROUTE_LAYER_ID)) map.removeLayer(ROUTE_LAYER_ID);
      if (map.getSource(ROUTE_SOURCE_ID)) map.removeSource(ROUTE_SOURCE_ID);
    };
  }, [mapRef, mapReady, isActive, routeColor]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !enabled) return;

    if (!drawRef.current) {
      drawRef.current = new MapboxDraw({
        displayControlsDefault: false,
      });
      map.addControl(drawRef.current, "top-left");
    }

    const handleDrawCreate = (event: { features: GeoJSON.Feature[] }) => {
      const feature = event.features[0];
      if (!feature || feature.geometry.type !== "LineString") return;
      applyManualGeometry({
        type: "LineString",
        coordinates: feature.geometry.coordinates as [number, number][],
      });
      cancelRailDraw();
    };

    map.on("draw.create", handleDrawCreate);

    return () => {
      map.off("draw.create", handleDrawCreate);
      if (drawRef.current) {
        map.removeControl(drawRef.current);
        drawRef.current = null;
      }
    };
  }, [applyManualGeometry, cancelRailDraw, enabled, mapReady, mapRef]);

  // Update route line geometry
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !isActive) return;

    const source = map.getSource(ROUTE_SOURCE_ID) as mapboxgl.GeoJSONSource;
    if (!source) return;

    const geometry = route?.geometry ?? activeRoute.geometry;
    if (geometry?.coordinates?.length) {
      source.setData({
        type: "Feature",
        properties: {},
        geometry,
      });
    } else {
      source.setData({ type: "FeatureCollection", features: [] });
    }
  }, [mapRef, mapReady, isActive, route?.geometry, activeRoute.geometry]);

  // Map click to pin stop (only when pin mode is active)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || (!enabled && !pinMode) || !pinMode) return;

    const handleClick = (e: mapboxgl.MapMouseEvent) => {
      const { lng, lat } = e.lngLat;
      setPinCandidate({ id: buildStopId(), lat, lng });
      setPinName("Pinned stop");
      setShowPinNameDialog(true);
      setPinMode(false);
    };

    map.on("click", handleClick);
    map.getCanvas().style.cursor = "crosshair";
    return () => {
      map.off("click", handleClick);
      map.getCanvas().style.cursor = "";
    };
  }, [mapRef, mapReady, enabled, pinMode]);

  // When buildMode changes, wipe the marker cache so every marker is recreated
  // with the correct draggable setting (Mapbox Marker doesn't support setDraggable).
  useEffect(() => {
    const markerMap = markerByIdRef.current;
    markerMap.forEach((m) => m.remove());
    markerMap.clear();
  }, [buildMode]);

  // Reconcile markers by stop ID — only create/remove what actually changed.
  // With 16 stops this previously destroyed and recreated all 16 DOM nodes on
  // every render; now it only updates position + label for existing stops.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !enabled) {
      markerByIdRef.current.forEach((m) => m.remove());
      markerByIdRef.current.clear();
      return;
    }

    const markerMap = markerByIdRef.current;
    const liveIds = new Set(stops.map((s) => s.id));

    // Remove markers whose stops were deleted
    for (const [id, marker] of markerMap) {
      if (!liveIds.has(id)) {
        marker.remove();
        markerMap.delete(id);
      }
    }

    // Update existing or create new
    stops.forEach((stop, index) => {
      const existing = markerMap.get(stop.id);
      if (existing) {
        existing.setLngLat([stop.lng, stop.lat]);
        const el = existing.getElement();
        el.textContent = String(index + 1);
        el.style.boxShadow = stop.timepoint
          ? "0 0 0 2px rgba(255,255,255,0.8), 0 2px 6px rgba(0,0,0,0.3)"
          : "0 2px 6px rgba(0,0,0,0.3)";
        return;
      }

      const el = document.createElement("div");
      el.className = "route-builder-marker";
      el.style.cssText = `
        width: 24px; height: 24px; border-radius: 50%;
        background: ${routeColor}; border: 2px solid white;
        cursor: grab; box-shadow: 0 2px 6px rgba(0,0,0,0.3);
        display: flex; align-items: center; justify-content: center;
        color: white; font-size: 10px; font-weight: 700;
      `;
      if (stop.timepoint) {
        el.style.boxShadow = "0 0 0 2px rgba(255,255,255,0.8), 0 2px 6px rgba(0,0,0,0.3)";
      }
      el.textContent = String(index + 1);
      el.addEventListener("click", (evt) => {
        evt.stopPropagation();
        setSelectedStopId(stop.id);
      });

      const marker = new mapboxgl.Marker({
        element: el,
        draggable: buildMode === "manual",
      })
        .setLngLat([stop.lng, stop.lat])
        .addTo(map);

      if (buildMode === "manual") {
        marker.on("dragend", () => {
          const pos = marker.getLngLat();
          updateStop(stop.id, { lng: pos.lng, lat: pos.lat });
        });
      }

      markerMap.set(stop.id, marker);
    });
  }, [mapRef, mapReady, enabled, stops, routeColor, updateStop, buildMode, setSelectedStopId]);

  // Final cleanup on unmount
  useEffect(() => {
    return () => {
      markerByIdRef.current.forEach((m) => m.remove());
      markerByIdRef.current.clear();
    };
  }, []);

  // Layer visibility when disabled or custom network hidden
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    if (map.getLayer(ROUTE_LAYER_ID)) {
      const visible = enabled && showCustomNetwork;
      map.setLayoutProperty(
        ROUTE_LAYER_ID,
        "visibility",
        visible ? "visible" : "none"
      );
    }
  }, [mapRef, mapReady, enabled, showCustomNetwork]);

  const totalDistanceKm = useMemo(() => {
    if (route?.distance) return route.distance / 1000;
    if (stops.length < 2) return 0;
    return stops.slice(1).reduce((sum, stop, idx) => {
      const prev = stops[idx];
      return sum + haversineKm(prev, stop);
    }, 0);
  }, [route?.distance, stops]);

  const fixRemoveCloseStops = useCallback(() => {
    if (stops.length < 2) return;
    const filtered: Stop[] = [stops[0]];
    stops.slice(1).forEach((stop) => {
      const last = filtered[filtered.length - 1];
      if (haversineKm(last, stop) >= 0.2) {
        filtered.push(stop);
      }
    });
    setStops(filtered);
  }, [stops, setStops]);

  const fixInsertGapStops = useCallback(() => {
    if (stops.length < 2) return;
    const next: Stop[] = [stops[0]];
    stops.slice(1).forEach((stop) => {
      const prev = next[next.length - 1];
      const gap = haversineKm(prev, stop);
      if (gap > 5) {
        const inserts = Math.min(4, Math.floor(gap / 5));
        const intermediates = interpolateStops(prev, stop, inserts, "Gap stop");
        next.push(...intermediates);
      }
      next.push(stop);
    });
    setStops(next);
  }, [stops, setStops]);

  const fixExpressStops = useCallback(() => {
    if (stops.length < 3) return;
    const keep = stops.filter(
      (stop, idx) => idx === 0 || idx === stops.length - 1 || stop.timepoint
    );
    if (keep.length >= 2 && keep.length < stops.length) {
      setStops(keep);
      return;
    }
    const sampled: Stop[] = [];
    const target = Math.min(8, stops.length);
    for (let i = 0; i < target; i += 1) {
      const idx = Math.round((i * (stops.length - 1)) / (target - 1));
      if (!sampled.find((s) => s.id === stops[idx].id)) sampled.push(stops[idx]);
    }
    setStops(sampled);
  }, [stops, setStops]);

  const fixTrimLongRoute = useCallback(() => {
    if (stops.length < 2) return;
    const maxStops = Math.max(2, Math.min(stops.length, Math.ceil(totalDistanceKm / 4) + 1));
    if (stops.length <= maxStops) return;
    const sampled: Stop[] = [];
    for (let i = 0; i < maxStops; i += 1) {
      const idx = Math.round((i * (stops.length - 1)) / (maxStops - 1));
      if (!sampled.find((s) => s.id === stops[idx].id)) sampled.push(stops[idx]);
    }
    setStops(sampled);
  }, [stops, setStops, totalDistanceKm]);

  const validationWarnings = useMemo(() => {
    if (stops.length < 2) return [];
    const warnings: Array<{ id: string; message: string; action?: () => void; actionLabel?: string }> = [];
    const segmentDistances = stops
      .slice(1)
      .map((stop, idx) => haversineKm(stops[idx], stop));
    const hasTooClose = segmentDistances.some((d) => d > 0 && d < 0.2);
    const hasTooFar = segmentDistances.some((d) => d > 5);
    const durationTooLong = (route?.duration ?? 0) > 2 * 3600;
    const stopDensity = totalDistanceKm > 0 ? stops.length / totalDistanceKm : 0;
    const tooManyStopsForDistance = totalDistanceKm > 5 && stopDensity > 1.2;

    if (hasTooClose) {
      warnings.push({
        id: "too-close",
        message: "Some stops are too close together.",
        action: fixRemoveCloseStops,
        actionLabel: "Remove duplicates",
      });
    }
    if (hasTooFar) {
      warnings.push({
        id: "too-far",
        message: "Some stops are too far apart.",
        action: fixInsertGapStops,
        actionLabel: "Insert gap stops",
      });
    }
    if (durationTooLong) {
      warnings.push({
        id: "too-long",
        message: "Route duration looks longer than 2 hours.",
        action: fixTrimLongRoute,
        actionLabel: "Trim under 2h",
      });
    }
    if (tooManyStopsForDistance) {
      warnings.push({
        id: "too-many",
        message: "Too many stops for the distance.",
        action: fixExpressStops,
        actionLabel: "Convert to express",
      });
    }
    return warnings;
  }, [
    stops,
    route?.duration,
    totalDistanceKm,
    fixRemoveCloseStops,
    fixInsertGapStops,
    fixTrimLongRoute,
    fixExpressStops,
  ]);

  const scheduleRouteTargets = useMemo<ScheduleRouteTarget[]>(() => {
    const targets: ScheduleRouteTarget[] = [];

    if (currentRoute) {
      targets.push({
        key: `current:${currentRoute.id}`,
        routeId: currentRoute.id,
        source: "current",
        label: currentRoute.name || "New Route",
        route: currentRoute,
      });
    }

    routes.forEach((savedRoute) => {
      targets.push({
        key: `saved:${savedRoute.id}`,
        routeId: savedRoute.id,
        source: "saved",
        label: savedRoute.name || "Untitled Route",
        route: savedRoute,
      });
    });

    return targets;
  }, [currentRoute, routes]);

  const scheduleGoVariantOptions = useMemo(
    () =>
      [...goVariantOptions.values()].flatMap(
        (optionsArray: Array<{ value: string; label: string; routeShortName: string }>) =>
          optionsArray.map((option: { value: string; label: string; routeShortName: string }) => ({
          value: option.value,
          label: option.label,
          routeShortName: option.routeShortName,
          })),
      ),
    [goVariantOptions],
  );

  const initialScheduleTargetKey = currentRoute
    ? `current:${currentRoute.id}`
    : scheduleRouteTargets[0]?.key;

  const handleScheduleSave = (
    target: ScheduleRouteTarget,
    nextSchedule: Schedule | undefined,
  ) => {
    if (target.source === "current") {
      updateCurrent({ schedule: nextSchedule });
      if (routes.some((routeItem) => routeItem.id === target.routeId)) {
        updateRouteById(target.routeId, { schedule: nextSchedule });
      }
      onCloseSchedule?.();
      return;
    }

    updateRouteById(target.routeId, { schedule: nextSchedule });
    if (currentRoute?.id === target.routeId) {
      updateCurrent({ schedule: nextSchedule });
    }
    onCloseSchedule?.();
  };

  const loadGoVariantData = useCallback(
    async (variantId: string): Promise<GoScheduleBuilderPayload | undefined> => {
      const cached = goScheduleCacheRef.current.get(variantId);
      if (cached) return cached;

      const response = await fetch(
        `/api/gotransit/schedule-builder?variant_id=${encodeURIComponent(variantId)}`,
      );
      if (!response.ok) return undefined;
      const payload = (await response.json()) as GoScheduleBuilderPayload;
      goScheduleCacheRef.current.set(variantId, payload);
      return payload;
    },
    [],
  );

  const loadGoVariantWithSchedule = useCallback(
    async (variantId: string, label: string, routeShortName?: string) => {
      const immediateMode =
        goRouteTypes?.[routeShortName ?? ""] === "2" ? "train" : "bus";
      loadFromGoVariant(variantId, label, immediateMode);

      try {
        const payload = await loadGoVariantData(variantId);
        const inferredMode =
          goRouteTypes?.[routeShortName ?? payload?.routeShortName ?? ""] === "2" ? "train" : "bus";
        if (inferredMode !== immediateMode) {
          loadFromGoVariant(variantId, label, inferredMode);
        }
        updateCurrent({ schedule: payload?.seededSchedule });
        return {
          schedule: payload?.seededSchedule,
          stopTimings: payload?.stopTimings,
          timedStopCount: payload?.timedStopCount,
          routeLabel: payload?.routeLabel,
        };
      } catch {
        return undefined;
      }
    },
    [goRouteTypes, loadFromGoVariant, loadGoVariantData, updateCurrent],
  );

  const handleSaveRoute = () => {
    saveRoute();
    setSelectedStopId(null);
    setShowGoVariantSelector(false);
    setSelectedGoVariant(null);
    setBuildMode("quick");
    setQuickStyle(null);
    setQuickStopsLoaded(false);
    setQuickError(null);
    setQuickNoStops(false);
    setPinMode(false);
    setPinCandidate(null);
    setPinName("Pinned stop");
    setShowPinNameDialog(false);
    setShowPinSaveDialog(false);
  };

  if (!showPanel && !showSchedulePanel) return null;

  return (
    <div className="flex gap-3 items-start">
      {showPanel && (
      <div className="flex max-h-[82vh] w-[320px] flex-col overflow-hidden rounded-[28px] border border-white/50 bg-[rgba(248,250,252,0.94)] text-slate-900 shadow-[0_24px_60px_rgba(15,23,42,0.18)] backdrop-blur-xl">
        <div className="shrink-0 border-b border-slate-200 px-4 py-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold text-slate-950">Route Builder</h3>
              <p className="mt-1 text-[11px] text-slate-500">
                Build the route, review stops, then save.
              </p>
            </div>
          </div>
          <p className="mt-2 text-[11px] text-slate-500">
            Add start and end points from the command bar, then generate or edit stops.
          </p>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
          <div className="space-y-2 rounded-[22px] border border-slate-200 bg-white p-3 text-[11px] shadow-[0_8px_24px_rgba(15,23,42,0.05)]">
            <div className="flex items-center justify-between">
              <span className="font-medium text-slate-700">Load GO Transit line</span>
              <button
                onClick={() => setShowGoVariantSelector((v) => !v)}
                className="text-[10px] font-semibold text-sky-700 hover:text-sky-900"
              >
                {showGoVariantSelector ? "Hide" : "Show"}
              </button>
            </div>
            {showGoVariantSelector && (
              <Combobox
                value={selectedGoVariant}
                onValueChange={(value) => {
                  setSelectedGoVariant(value);
                  let selectedOption: { value: string; label: string; routeShortName: string } | undefined;
                  for (const [groupName, optionsArray] of goVariantOptions.entries()) {
                    const match = optionsArray.find((opt: { value: string; label: string }) => opt.value === value);
                    if (match) {
                      selectedOption = { ...match, routeShortName: groupName };
                      break;
                    }
                  }
                  if (selectedOption) {
                    const nextMode = goRouteTypes[selectedOption.routeShortName] === "2" ? "train" : "bus";
                    cancelRailDraw();
                    setMode(nextMode);
                    loadFromGoVariant(selectedOption.value, selectedOption.label, nextMode);
                  }
                }}
                disabled={!goVariantsIndex}
              >
                <ComboboxInput placeholder="Search GO Transit Lines..." />
                <ComboboxContent>
                  <ComboboxList>
                    {goVariantOptions.size === 0 && (
                      <ComboboxItem value="no-options" disabled>
                        No GO Transit Lines found.
                      </ComboboxItem>
                    )}
                    {[...goVariantOptions.entries()].map(([groupName, options]) => (
                      <ComboboxGroup key={groupName}>
                        <ComboboxLabel>{groupName}</ComboboxLabel>
                        {options.map((option: { value: string; label: string }) => (
                          <ComboboxItem key={option.value} value={option.value}>
                            {option.label}
                          </ComboboxItem>
                        ))}
                      </ComboboxGroup>
                    ))}
                  </ComboboxList>
                </ComboboxContent>
              </Combobox>
            )}
          </div>
        {/* Route name + color */}
        <div className="space-y-2">
          <input
            type="text"
            value={activeRoute.name}
            onChange={(e) => updateCurrent({ name: e.target.value })}
            placeholder="Route name"
            className="flex-1 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-200"
          />
          <div className="flex gap-1.5 flex-wrap">
            {ROUTE_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => updateCurrent({ color: c })}
                className={`h-6 w-6 rounded-full border-2 transition-all ${
                  activeRoute.color === c ? "scale-110 border-slate-700" : "border-slate-200"
                }`}
                style={{ backgroundColor: c }}
                title={c}
              />
            ))}
          </div>
        </div>

        {route && (
          <div
            className="rounded-[22px] border px-3 py-3 text-sm"
            style={{
              backgroundColor: `${routeColor}14`,
              borderColor: `${routeColor}40`,
            }}
          >
            <div className="flex justify-between">
              <span className="text-slate-600">Distance</span>
              <span className="font-medium">
                {(route.distance / 1000).toFixed(1)} km
              </span>
            </div>
            <div className="flex justify-between mt-1">
              <span className="text-slate-600">Duration</span>
              <span className="font-medium">
                {Math.round(route.duration / 60)} min
              </span>
            </div>
            <div className="mt-1 flex justify-between">
              <span className="text-slate-600">Geometry</span>
              <span className="font-medium capitalize">
                {geometrySource === "manual-rail"
                  ? "Custom rail corridor"
                  : geometrySource === "rail-network"
                    ? "Existing tracks"
                    : "Road network"}
              </span>
            </div>
          </div>
        )}

        {loading && (
          <div className="text-[11px] text-slate-500">
            {isTrainMode ? "Calculating rail path..." : "Calculating route..."}
          </div>
        )}
        {error && (
          <div className="text-[11px] text-red-600">{error}</div>
        )}
        {isTrainMode && stops.length >= 2 && (
          <div className="space-y-2 rounded-[22px] border border-slate-200 bg-white p-3 text-[11px] shadow-[0_8px_24px_rgba(15,23,42,0.05)]">
            <div className="font-medium text-slate-700">Rail corridor</div>
            <div className="text-slate-500">
              {geometrySource === "rail-network"
                ? "This train route is following existing GO or UP tracks."
                : geometrySource === "manual-rail"
                  ? "This train route is using a custom drawn rail corridor."
                  : "No tracked rail path yet. Draw a new corridor if needed."}
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={startRailDraw}
                className="rounded-2xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
              >
                {geometrySource === "manual-rail" ? "Redraw rail corridor" : "Draw rail corridor"}
              </button>
              {isRailDrawing && (
                <button
                  type="button"
                  onClick={cancelRailDraw}
                  className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
                >
                  Cancel draw
                </button>
              )}
            </div>
          </div>
        )}

        {/* Current route stops */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-medium text-slate-600">Current route stops ({stops.length})</span>
          </div>

          <div className="max-h-48 overflow-y-auto space-y-1">
            {stops.length === 0 ? (
              <div className="py-4 text-center text-[11px] text-slate-400">
                {isTrainMode
                  ? "Add train stops, then follow tracks or draw a corridor."
                  : "Add start and end, then generate stops."}
              </div>
            ) : (
              stops.map((stop, i) => (
                <StopRow
                  key={stop.id}
                  stop={stop}
                  index={i}
                  color={routeColor}
                  isSelected={selectedStopId === stop.id}
                  onSelect={() => setSelectedStopId(stop.id)}
                  onRemove={() => removeStop(stop.id)}
                  onToggleTimepoint={() =>
                    updateStop(stop.id, { timepoint: !stop.timepoint })
                  }
                  onReorder={reorderStops}
                />
              ))
            )}
          </div>
        </div>

        {selectedStop && (
          <div className="space-y-2 rounded-[22px] border border-slate-200 bg-white p-3 text-[11px] shadow-[0_8px_24px_rgba(15,23,42,0.05)]">
            <div className="flex items-center justify-between">
              <span className="font-medium text-slate-700">Stop details</span>
              <button
                onClick={() => setSelectedStopId(null)}
                className="text-[10px] text-slate-400 hover:text-slate-700"
              >
                Close
              </button>
            </div>
            <div className="text-slate-900">{selectedStop.name ?? "Stop"}</div>
            <div className="text-slate-500">
              {selectedStop.lat.toFixed(5)}, {selectedStop.lng.toFixed(5)}
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={() => setStopAsStart(selectedStop.id)}
                className="text-[10px] font-semibold text-emerald-700 hover:text-emerald-900"
              >
                Set as start
              </button>
              <button
                onClick={() => setStopAsEnd(selectedStop.id)}
                className="text-[10px] font-semibold text-sky-700 hover:text-sky-900"
              >
                Set as end
              </button>
              <button
                onClick={() =>
                  updateStop(selectedStop.id, { timepoint: !selectedStop.timepoint })
                }
                className="text-[10px] font-semibold text-amber-700 hover:text-amber-900"
              >
                {selectedStop.timepoint ? "Unset timepoint" : "Mark timepoint"}
              </button>
              <button
                onClick={() => removeStop(selectedStop.id)}
                className="text-[10px] font-semibold text-red-600 hover:text-red-800"
              >
                Remove stop
              </button>
            </div>
          </div>
        )}

        {validationWarnings.length > 0 && (
          <div className="space-y-2 rounded-[22px] border border-slate-200 bg-white p-3 text-[11px] shadow-[0_8px_24px_rgba(15,23,42,0.05)]">
            <div className="font-medium text-slate-700">Route checks</div>
            {validationWarnings.map((warning) => (
              <div
                key={warning.id}
                className="flex items-start justify-between gap-3 text-slate-700"
              >
                <span className="leading-5">{warning.message}</span>
                {warning.action && warning.actionLabel && (
                  <button
                    onClick={warning.action}
                    className="shrink-0 text-[10px] font-semibold text-orange-700 hover:text-orange-900"
                  >
                    {warning.actionLabel}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Saved routes */}
        {routes.length > 0 && (
          <div className="space-y-2">
            <div className="text-[11px] font-medium text-slate-600">Saved routes ({routes.length})</div>
            {routes.map((r) => (
              <div
                key={r.id}
                className="space-y-2 rounded-[22px] border border-slate-200 bg-white px-3 py-3 shadow-[0_8px_24px_rgba(15,23,42,0.05)]"
              >
                <div className="flex items-center gap-2">
                  <span
                    className="w-3 h-3 rounded-full shrink-0"
                    style={{ backgroundColor: r.color }}
                  />
                  <span className="flex-1 truncate text-[12px] text-slate-800">{r.name}</span>
                  <button
                    onClick={() => loadRoute(r)}
                    className="text-[10px] font-semibold text-sky-700 hover:text-sky-900"
                  >
                    Load
                  </button>
                  <button
                    onClick={() => deleteRoute(r.id)}
                    className="text-[10px] font-semibold text-red-600 hover:text-red-800"
                  >
                    Del
                  </button>
                </div>
                <div className="space-y-1 max-h-28 overflow-y-auto pr-1">
                  {r.stops.length === 0 ? (
                    <div className="text-[10px] text-slate-400">No stops saved.</div>
                  ) : (
                    r.stops.map((stop, idx) => (
                      <div
                        key={`${r.id}-${stop.id}-${idx}`}
                        className="rounded-xl border border-slate-200 bg-slate-50 px-2 py-1.5 text-[10px] text-slate-700"
                      >
                        {idx + 1}. {stop.name ?? "Stop"}
                      </div>
                    ))
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

          {/* Route Scorecard — visible when ≥2 stops + geometry */}
          {stops.length >= 2 && activeRoute.geometry && (
            <RouteScorecard
              stops={stops.map((s) => ({ lat: s.lat, lng: s.lng }))}
              intervalMinutes={
                (() => {
                  const primarySchedule = getScheduleDirection(activeRoute.schedule, "primary");
                  if (primarySchedule?.type !== "frequency") return undefined;
                  return Object.values((primarySchedule as ScheduleFrequency).dayConfigs ?? {}).find(
                    (c) => c?.enabled,
                  )?.intervalMinutes;
                })()
              }
              routeDistanceKm={
                route?.distance != null ? route.distance / 1000 : undefined
              }
            />
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2 border-t border-slate-200 bg-slate-50 px-4 py-3">
          <button
            onClick={handleSaveRoute}
            disabled={stops.length < 2}
            className="flex-1 rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Save route
          </button>
          {stops.length >= 2 && onOpenComparison && (
            <button
              onClick={onOpenComparison}
              className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
            >
              Compare
            </button>
          )}
          <button
            onClick={clearRoute}
            className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700 transition hover:bg-red-100"
          >
            Clear
          </button>
        </div>
      </div>
      )}

      <ScheduleBuilderModal
        key={`${initialScheduleTargetKey ?? "none"}-${currentRoute?.baseVariantId ?? "manual"}-${showSchedulePanel ? "open" : "closed"}`}
        isOpen={showSchedulePanel}
        routeTargets={scheduleRouteTargets}
        initialTargetKey={initialScheduleTargetKey}
        goVariantOptions={scheduleGoVariantOptions}
        getGoVariantData={loadGoVariantData}
        onLoadGoVariant={loadGoVariantWithSchedule}
        onClose={() => onCloseSchedule?.()}
        onSave={handleScheduleSave}
      />

      <AlertDialog open={showPinNameDialog} onOpenChange={setShowPinNameDialog}>
        <AlertDialogContent
          size="sm"
          className="rounded-[28px] border border-white/50 bg-[var(--glass-surface-strong)] p-6 shadow-[var(--glass-shadow)] backdrop-blur-2xl"
        >
          <AlertDialogHeader>
            <AlertDialogTitle>Name this stop</AlertDialogTitle>
            <AlertDialogDescription>
              Give this pinned stop a label. You can edit it later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="mt-3">
            <input
              type="text"
              value={pinName}
              onChange={(e) => setPinName(e.target.value)}
              className="w-full rounded-2xl border border-slate-200 bg-white/90 px-4 py-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-200"
              placeholder="Pinned stop"
            />
          </div>
          <AlertDialogFooter className="mt-1 flex-col-reverse !grid-cols-1">
            <AlertDialogCancel
              className="w-full rounded-2xl border border-slate-200 bg-white/85 px-4 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
              onClick={() => {
                setPinCandidate(null);
                window.dispatchEvent(new CustomEvent("route-builder-pin-complete"));
              }}
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="w-full rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white hover:bg-slate-800"
              onClick={() => {
                if (!pinCandidate) return;
                const name = pinName.trim() || "Pinned stop";
                const newStop: Stop = {
                  id: pinCandidate.id,
                  name,
                  lat: pinCandidate.lat,
                  lng: pinCandidate.lng,
                  timepoint: stops.length === 0 || stops.length === 1,
                };
                applyPinnedStop(newStop);
                setShowPinNameDialog(false);
                window.dispatchEvent(new CustomEvent("route-builder-open"));
                setShowPinSaveDialog(true);
              }}
            >
              Add stop
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showPinSaveDialog} onOpenChange={setShowPinSaveDialog}>
        <AlertDialogContent
          size="sm"
          className="rounded-[28px] border border-white/50 bg-[var(--glass-surface-strong)] p-6 shadow-[var(--glass-shadow)] backdrop-blur-2xl"
        >
          <AlertDialogHeader>
            <AlertDialogTitle>Save this stop?</AlertDialogTitle>
            <AlertDialogDescription>
              Saved stops appear in the command bar for quick reuse.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="mt-1 flex-col-reverse !grid-cols-1">
            <AlertDialogCancel
              className="w-full rounded-2xl border border-slate-200 bg-white/85 px-4 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
              onClick={() => {
                setPinCandidate(null);
                setShowPinSaveDialog(false);
                window.dispatchEvent(new CustomEvent("route-builder-pin-complete"));
              }}
            >
              Skip
            </AlertDialogCancel>
            <AlertDialogAction
              className="w-full rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white hover:bg-slate-800"
              onClick={() => {
                if (!pinCandidate) return;
                const name = pinName.trim() || "Pinned stop";
                savePinnedStop({
                  id: pinCandidate.id,
                  name,
                  lat: pinCandidate.lat,
                  lng: pinCandidate.lng,
                });
                setPinCandidate(null);
                setShowPinSaveDialog(false);
                window.dispatchEvent(new CustomEvent("route-builder-pin-complete"));
              }}
            >
              Save stop
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}



function StopRow({
  stop,
  index,
  color,
  isSelected,
  onSelect,
  onRemove,
  onToggleTimepoint,
  onReorder,
}: {
  stop: Stop;
  index: number;
  color: string;
  isSelected: boolean;
  onSelect: () => void;
  onRemove: () => void;
  onToggleTimepoint: () => void;
  onReorder: (fromId: string, toId: string) => void;
}) {
  return (
    <div
      className={`group flex items-center gap-3 rounded-[22px] border px-3 py-2.5 transition ${
        isSelected
          ? "border-sky-200 bg-sky-50 shadow-[0_8px_20px_rgba(14,165,233,0.12)]"
          : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
      }`}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", stop.id);
        e.dataTransfer.effectAllowed = "move";
      }}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
      }}
      onDrop={(e) => {
        e.preventDefault();
        const fromId = e.dataTransfer.getData("text/plain");
        if (fromId) onReorder(fromId, stop.id);
      }}
      onClick={onSelect}
    >
      <span
        className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 text-white"
        style={{ backgroundColor: color }}
      >
        {index + 1}
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[12px] font-medium text-slate-800">
          {stop.name ?? `Stop ${index + 1}`}
        </div>
        <div className="truncate text-[10px] text-slate-400">
          {stop.lat.toFixed(5)}, {stop.lng.toFixed(5)}
        </div>
      </div>
      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleTimepoint();
          }}
          className="rounded p-1 text-[10px] text-slate-500 hover:bg-slate-100 hover:text-slate-800"
          title="Toggle timepoint"
        >
          {stop.timepoint ? "★" : "☆"}
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="rounded p-1 text-[10px] text-rose-500 hover:bg-rose-50 hover:text-rose-700"
          title="Remove"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
