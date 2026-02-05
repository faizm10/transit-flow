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
import {
  useRouteBuilder,
  expandSchedule,
  ROUTE_COLORS,
  type Stop,
  type Schedule,
} from "@/hooks/useRouteBuilder";
import { fetchDirections } from "@/lib/mapboxDirections";
import type { } from "@/lib/mapboxDirections";
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
  showCustomNetwork?: boolean;
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
  showCustomNetwork = true,
}: RouteBuilderProps) {
  const {
    routes,
    currentRoute,
    activeRoute,
    stops,
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
  const [extensionSuggestions, setExtensionSuggestions] = useState<
    Array<{ id: string; name: string; lat: number; lng: number; distanceKm: number }>
  >([]);
  const [showExtensions, setShowExtensions] = useState(false);

  const [showGoVariantSelector, setShowGoVariantSelector] = useState(false);
  const [selectedGoVariant, setSelectedGoVariant] = useState<string | null>(null);

  const goVariantOptions = useMemo(() => {
    if (!goVariantsIndex) return new Map();
    const groupedOptions = new Map<string, { value: string; label: string }[]>();

    Object.entries(goVariantsIndex).forEach(([routeShortName, variants]) => {
      const optionsForGroup: { value: string; label: string }[] = [];
      variants.forEach((variant) => {
        optionsForGroup.push({
          value: variant.variant_id,
          label: `${routeShortName} - ${variant.label}`,
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
  const markersRef = useRef<mapboxgl.Marker[]>([]);
  const lastQuickEndpointsRef = useRef<string | null>(null);
  const lastQuickStyleKeyRef = useRef<string | null>(null);
  const rawQuickStartRef = useRef<Stop | null>(null);
  const rawQuickEndRef = useRef<Stop | null>(null);
  const [scheduleTargetIds, setScheduleTargetIds] = useState<string[]>(() => [
    currentRoute?.id ?? activeRoute.id,
  ]);
  const [scheduleDraft, setScheduleDraft] = useState<{
    startTime: string;
    endTime: string;
    outboundHeadway: number;
    returnEnabled: boolean;
    returnBufferMinutes: number;
    returnHeadway: number;
    returnSameAsOutbound: boolean;
    departures: string[];
  }>({
    startTime: "06:00",
    endTime: "22:00",
    outboundHeadway: 30,
    returnEnabled: true,
    returnBufferMinutes: 10,
    returnHeadway: 30,
    returnSameAsOutbound: true,
    departures: [],
  });
  const [scheduleDeparturesText, setScheduleDeparturesText] = useState("");
  const scheduleInitializedRef = useRef(false);
  const [scheduleHasData, setScheduleHasData] = useState(true);
  const [scheduleGenerating, setScheduleGenerating] = useState(false);
  const [scheduleOutboundTimes, setScheduleOutboundTimes] = useState<string[]>([]);
  const [scheduleReturnTimes, setScheduleReturnTimes] = useState<string[]>([]);

  

  const routeColor = activeRoute.color;

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
    [activeRoute.profile, availableStops.length, buildStopsFromGeometry, setStops]
  );

  useEffect(() => {
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
  }, [buildMode, stops, quickStopsLoaded, quickGenerating, quickStyle, generateQuickRoute]);

  useEffect(() => {
    if (buildMode !== "quick") return;
    if (quickStyle !== "express") return;
    if (stops.length !== 2) return;
    if (!quickStopsLoaded || quickGenerating) return;
    const key = `${stops[0].id}-${stops[1].id}-express-${includeUniversitiesExpress ? "u1" : "u0"}`;
    if (lastQuickStyleKeyRef.current === key) return;
    lastQuickStyleKeyRef.current = key;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    generateQuickRoute("express", stops);
  }, [buildMode, quickStyle, stops, quickStopsLoaded, quickGenerating, includeUniversitiesExpress, generateQuickRoute]);

  

  

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
      if (map.getLayer(ROUTE_LAYER_ID)) map.removeLayer(ROUTE_LAYER_ID);
      if (map.getSource(ROUTE_SOURCE_ID)) map.removeSource(ROUTE_SOURCE_ID);
    };
  }, [mapRef, mapReady, isActive, routeColor]);

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

  // Markers for stops (only when panel is open)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !enabled) return;

    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    stops.forEach((stop, index) => {
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

      markersRef.current.push(marker);
    });

    return () => {
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];
    };
  }, [mapRef, mapReady, enabled, stops, routeColor, updateStop, buildMode, setSelectedStopId]);

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

  const buildExtensionSuggestions = useCallback(() => {
    if (!selectedStop || !goVariantStops) return [];
    const candidates: Array<{ id: string; name: string; lat: number; lng: number; distanceKm: number }> = [];
    Object.values(goVariantStops).forEach((list) => {
      list.forEach((stop) => {
        if (stop.stop_lat == null || stop.stop_lon == null) return;
        const distanceKm = haversineKm(
          { lat: selectedStop.lat, lng: selectedStop.lng },
          { lat: stop.stop_lat, lng: stop.stop_lon }
        );
        if (distanceKm >= 5 && distanceKm <= 20) {
          candidates.push({
            id: stop.stop_id,
            name: stop.stop_name,
            lat: stop.stop_lat,
            lng: stop.stop_lon,
            distanceKm,
          });
        }
      });
    });
    candidates.sort((a, b) => a.distanceKm - b.distanceKm);
    const unique: Array<{ id: string; name: string; lat: number; lng: number; distanceKm: number }> = [];
    const seen = new Set<string>();
    for (const c of candidates) {
      const key = `${c.name}-${c.lat.toFixed(4)}-${c.lng.toFixed(4)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      unique.push(c);
      if (unique.length >= 3) break;
    }
    return unique;
  }, [selectedStop, goVariantStops]);

  useEffect(() => {
// eslint-disable-next-line react-hooks/set-state-in-effect
    setExtensionSuggestions(buildExtensionSuggestions());
  }, [showExtensions, selectedStop, buildExtensionSuggestions]);

  const applyExtension = useCallback(
    (target: { name: string; lat: number; lng: number }) => {
      if (!selectedStop) return;
      const selectedIndex = stops.findIndex((s) => s.id === selectedStop.id);
      if (selectedIndex < 0) return;
      const targetStop: Stop = {
        id: buildStopId(),
        name: target.name,
        lat: target.lat,
        lng: target.lng,
        timepoint: true,
      };
      const next = [...stops.slice(0, selectedIndex + 1), targetStop];
      setStops(next);
    },
    [selectedStop, stops, setStops]
  );

  useEffect(() => {
    if (!currentRoute?.id) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setScheduleTargetIds((prev) =>
      prev.length === 1 && prev[0] === currentRoute.id ? prev : [currentRoute.id]
    );
  }, [currentRoute?.id]);

  const primaryScheduleTargetId = scheduleTargetIds[0] ?? activeRoute.id;
  const scheduleTargetRoute =
    primaryScheduleTargetId && primaryScheduleTargetId !== activeRoute.id
      ? routes.find((r) => r.id === primaryScheduleTargetId) ?? activeRoute
      : activeRoute;
  const schedule = scheduleTargetRoute.schedule;
  
  const scheduleTargetName =
    scheduleTargetIds.length > 1
      ? "Multiple routes"
      : primaryScheduleTargetId === activeRoute.id || !primaryScheduleTargetId
      ? "Current route"
      : routes.find((r) => r.id === primaryScheduleTargetId)?.name ?? "Current route";

  const parseTimeToMinutes = useCallback((value: string) => {
    const [h, m] = value.split(":").map(Number);
    if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
    return h * 60 + m;
  }, []);

  const formatMinutesToTime = useCallback((minutes: number) => {
    const clamped = Math.max(0, minutes);
    const h = Math.floor(clamped / 60) % 24;
    const m = clamped % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  }, []);

  const buildDeparturesFromDraft = useCallback(
    (draft: typeof scheduleDraft, durationSeconds?: number) => {
      const startMins = parseTimeToMinutes(draft.startTime);
      const endMins = parseTimeToMinutes(draft.endTime);
      if (startMins == null || endMins == null || endMins < startMins) {
        return { outbound: [] as number[], returns: [] as number[], merged: [] as number[] };
      }
      const outboundHeadway = Math.max(1, Math.round(draft.outboundHeadway));
      const returnHeadway = draft.returnSameAsOutbound
        ? outboundHeadway
        : Math.max(0, Math.round(draft.returnHeadway));
      const durationMinutes = durationSeconds ? Math.max(1, Math.round(durationSeconds / 60)) : 0;
      const returnBuffer = Math.max(0, Math.round(draft.returnBufferMinutes));

      const outbound: number[] = [];
      for (let t = startMins; t <= endMins; t += outboundHeadway) {
        outbound.push(t);
      }

      const returns: number[] = [];
      if (draft.returnEnabled) {
        for (const depart of outbound) {
          const returnDepart = depart + durationMinutes + returnBuffer + returnHeadway;
          if (returnDepart <= endMins) {
            returns.push(returnDepart);
          }
        }
      }

      const merged = Array.from(new Set([...outbound, ...returns])).sort((a, b) => a - b);
      return { outbound, returns, merged };
    },
    [parseTimeToMinutes],
  );

  const applyScheduleToTargets = useCallback(
    (nextSchedule: Schedule | undefined) => {
      const targets = scheduleTargetIds.length > 0 ? scheduleTargetIds : [activeRoute.id];
      targets.forEach((targetId) => {
        const isSavedTarget = routes.some((r) => r.id === targetId);
        if (!targetId || !isSavedTarget || targetId === activeRoute.id) {
          updateCurrent({ schedule: nextSchedule });
        } else {
          updateRouteById(targetId, { schedule: nextSchedule });
        }
      });
    },
    [activeRoute.id, routes, scheduleTargetIds, updateCurrent, updateRouteById],
  );

  const applyDeparturesText = useCallback(() => {
    const tokens = scheduleDeparturesText
      .split(/[\s,]+/g)
      .map((t) => t.trim())
      .filter(Boolean);
    const times = tokens
      .map((t) => {
        const mins = parseTimeToMinutes(t);
        if (mins == null) return null;
        return formatMinutesToTime(mins);
      })
      .filter((t): t is string => Boolean(t));
    const unique = Array.from(new Set(times)).sort();
    setScheduleDraft((prev) => ({ ...prev, departures: unique }));
    setScheduleDeparturesText(unique.join("\n"));
    setScheduleHasData(unique.length > 0);
    setScheduleOutboundTimes([]);
    setScheduleReturnTimes([]);
    applyScheduleToTargets({ type: "fixed", departures: unique });
  }, [
    applyScheduleToTargets,
    formatMinutesToTime,
    parseTimeToMinutes,
    scheduleDeparturesText,
  ]);

  useEffect(() => {
    if (!showSchedulePanel) {
      scheduleInitializedRef.current = false;
      return;
    }

    const existingDepartures = schedule ? expandSchedule(schedule) : [];
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setScheduleHasData(existingDepartures.length > 0);

    const generated = buildDeparturesFromDraft(
      scheduleDraft,
      scheduleTargetRoute.durationSeconds ?? route?.duration ?? activeRoute.durationSeconds,
    );
    const generatedDepartures = generated.merged.map(formatMinutesToTime);
    const initialDepartures =
      existingDepartures.length > 0 ? existingDepartures : generatedDepartures;

    const start = initialDepartures[0] ?? scheduleDraft.startTime;
    const end = initialDepartures[initialDepartures.length - 1] ?? scheduleDraft.endTime;

    setScheduleDraft((prev) => ({
      ...prev,
      startTime: start,
      endTime: end,
      departures: initialDepartures,
    }));
    setScheduleDeparturesText(initialDepartures.join("\n"));
    if (existingDepartures.length > 0) {
      setScheduleOutboundTimes([]);
      setScheduleReturnTimes([]);
    } else {
      setScheduleOutboundTimes(generated.outbound.map(formatMinutesToTime));
      setScheduleReturnTimes(generated.returns.map(formatMinutesToTime));
    }

    if (!schedule && initialDepartures.length > 0) {
      applyScheduleToTargets({ type: "fixed", departures: initialDepartures });
    }

    scheduleInitializedRef.current = true;
  }, [
    activeRoute.durationSeconds,
    applyScheduleToTargets,
    buildDeparturesFromDraft,
    route?.duration,
    schedule,
    scheduleTargetIds,
    scheduleTargetRoute.durationSeconds,
    showSchedulePanel,
    formatMinutesToTime,
    scheduleDraft,
  ]);

  if (!showPanel && !showSchedulePanel) return null;

  return (
    <div className="flex gap-3 items-start">
      {showPanel && (
      <div className="w-72 overflow-hidden rounded-xl bg-black/60 backdrop-blur-md border border-white/20 shadow-2xl text-white/90 flex flex-col max-h-[85vh]">
        <div className="px-3 py-2.5 border-b border-white/10 bg-black/40 shrink-0">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-xs font-semibold text-white">Route Builder</h3>
          </div>
          <p className="text-[10px] text-white/50 mt-0.5">
            Add start/end from the command bar, then generate or edit stops.
          </p>
        </div>

        <div className="p-3 space-y-3 overflow-y-auto flex-1 min-h-0">
          <div className="rounded-lg bg-black/30 border border-white/10 p-2 text-[11px] space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-white/70">Load GO Transit Line</span>
              <button
                onClick={() => setShowGoVariantSelector((v) => !v)}
                className="text-[10px] text-blue-300 hover:text-blue-200"
              >
                {showGoVariantSelector ? "Hide" : "Show"}
              </button>
            </div>
            {showGoVariantSelector && (
              <Combobox
                value={selectedGoVariant}
                onValueChange={(value) => {
                  setSelectedGoVariant(value);
                  let selectedOption: { value: string; label: string } | undefined;
                  for (const optionsArray of goVariantOptions.values()) {
                    selectedOption = optionsArray.find((opt) => opt.value === value);
                    if (selectedOption) break;
                  }
                  if (selectedOption) {
                    loadFromGoVariant(selectedOption.value, selectedOption.label);
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
                        {options.map((option) => (
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
        <div className="flex gap-2">
          <input
            type="text"
            value={activeRoute.name}
            onChange={(e) => updateCurrent({ name: e.target.value })}
            placeholder="Route name"
            className="flex-1 rounded-lg bg-black/50 border border-white/10 px-2 py-1.5 text-xs text-white/90 placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
          />
          <div className="flex gap-1 flex-wrap">
            {ROUTE_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => updateCurrent({ color: c })}
                className={`w-6 h-6 rounded-full border-2 transition-all ${
                  activeRoute.color === c ? "border-white scale-110" : "border-white/30"
                }`}
                style={{ backgroundColor: c }}
                title={c}
              />
            ))}
          </div>
        </div>

        {route && (
          <div
            className="rounded-lg px-2.5 py-2 text-xs border"
            style={{
              backgroundColor: `${routeColor}20`,
              borderColor: `${routeColor}50`,
            }}
          >
            <div className="flex justify-between">
              <span className="text-white/70">Distance</span>
              <span className="font-medium">
                {(route.distance / 1000).toFixed(1)} km
              </span>
            </div>
            <div className="flex justify-between mt-1">
              <span className="text-white/70">Duration</span>
              <span className="font-medium">
                {Math.round(route.duration / 60)} min
              </span>
            </div>
          </div>
        )}

        {loading && (
          <div className="text-[10px] text-white/50">Calculating route...</div>
        )}
        {error && (
          <div className="text-[10px] text-red-300">{error}</div>
        )}

        {/* Current route stops */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] text-white/60">Current route stops ({stops.length})</span>
          </div>

          <div className="max-h-52 overflow-y-auto space-y-1">
            {stops.length === 0 ? (
              <div className="text-[10px] text-white/40 py-4 text-center">
                Add start and end, then generate stops.
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
          <div className="rounded-lg bg-black/30 border border-white/10 p-2 text-[11px] space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-white/70">Stop details</span>
              <button
                onClick={() => setSelectedStopId(null)}
                className="text-[10px] text-white/40 hover:text-white/70"
              >
                Close
              </button>
            </div>
            <div className="text-white/90">{selectedStop.name ?? "Stop"}</div>
            <div className="text-white/50">
              {selectedStop.lat.toFixed(5)}, {selectedStop.lng.toFixed(5)}
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={() => setStopAsStart(selectedStop.id)}
                className="text-[10px] text-emerald-300 hover:text-emerald-200"
              >
                Set as start
              </button>
              <button
                onClick={() => setStopAsEnd(selectedStop.id)}
                className="text-[10px] text-blue-300 hover:text-blue-200"
              >
                Set as end
              </button>
              <button
                onClick={() =>
                  updateStop(selectedStop.id, { timepoint: !selectedStop.timepoint })
                }
                className="text-[10px] text-amber-300 hover:text-amber-200"
              >
                {selectedStop.timepoint ? "Unset timepoint" : "Mark timepoint"}
              </button>
              <button
                onClick={() => removeStop(selectedStop.id)}
                className="text-[10px] text-red-300 hover:text-red-200"
              >
                Remove stop
              </button>
            </div>
          </div>
        )}

        {validationWarnings.length > 0 && (
          <div className="rounded-lg bg-black/30 border border-white/10 p-2 text-[11px] space-y-2">
            <div className="text-white/70">Route checks</div>
            {validationWarnings.map((warning) => (
              <div
                key={warning.id}
                className="flex items-center justify-between gap-2 text-white/80"
              >
                <span>{warning.message}</span>
                {warning.action && warning.actionLabel && (
                  <button
                    onClick={warning.action}
                    className="text-[10px] text-amber-300 hover:text-amber-200"
                  >
                    {warning.actionLabel}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        <div className="rounded-lg bg-black/30 border border-white/10 p-2 text-[11px] space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-white/70">Suggest extension</span>
            <button
              onClick={() => {
                setExtensionSuggestions(buildExtensionSuggestions());
                setShowExtensions((v) => !v);
              }}
              className="text-[10px] text-blue-300 hover:text-blue-200"
              disabled={!selectedStop}
            >
              {showExtensions ? "Hide" : "Suggest"}
            </button>
          </div>
          {!selectedStop && (
            <div className="text-white/40">
              Select a stop to get extension suggestions.
            </div>
          )}
          {showExtensions && extensionSuggestions.length > 0 && (
            <div className="space-y-1 max-h-36 overflow-y-auto pr-1">
              {extensionSuggestions.map((opt) => (
                <button
                  key={`${opt.name}-${opt.id}`}
                  onClick={() => applyExtension(opt)}
                  className="w-full text-left rounded bg-black/40 border border-white/10 px-2 py-1 text-[10px] hover:bg-white/10"
                >
                  {opt.name} · {opt.distanceKm.toFixed(0)} km away
                </button>
              ))}
            </div>
          )}
          {showExtensions && selectedStop && extensionSuggestions.length === 0 && (
            <div className="text-white/40">No nearby extensions found.</div>
          )}
        </div>

        {/* Saved routes */}
        {routes.length > 0 && (
          <div className="space-y-2">
            <div className="text-[10px] text-white/60">Saved routes ({routes.length})</div>
            {routes.map((r) => (
              <div
                key={r.id}
                className="rounded-lg bg-black/30 border border-white/10 px-2 py-2 space-y-2"
              >
                <div className="flex items-center gap-2">
                  <span
                    className="w-3 h-3 rounded-full shrink-0"
                    style={{ backgroundColor: r.color }}
                  />
                  <span className="text-[11px] truncate flex-1">{r.name}</span>
                  <button
                    onClick={() => loadRoute(r)}
                    className="text-[10px] text-blue-400 hover:text-blue-300"
                  >
                    Load
                  </button>
                  <button
                    onClick={() => deleteRoute(r.id)}
                    className="text-[10px] text-red-400 hover:text-red-300"
                  >
                    Del
                  </button>
                </div>
                <div className="space-y-1 max-h-28 overflow-y-auto pr-1">
                  {r.stops.length === 0 ? (
                    <div className="text-[10px] text-white/40">No stops saved.</div>
                  ) : (
                    r.stops.map((stop, idx) => (
                      <div
                        key={`${r.id}-${stop.id}-${idx}`}
                        className="rounded bg-black/40 border border-white/10 px-2 py-1 text-[10px] text-white/80"
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
        </div>
        <div className="px-3 py-2 border-t border-white/10 bg-black/40 shrink-0 flex items-center gap-2">
          <button
            onClick={saveRoute}
            disabled={stops.length < 2}
            className="flex-1 rounded-lg bg-emerald-600 text-white px-3 py-2 text-[11px] font-semibold hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed shadow-sm"
          >
            Save route
          </button>
          <button
            onClick={clearRoute}
            className="flex-1 rounded-lg bg-red-600 text-white px-3 py-2 text-[11px] font-semibold hover:bg-red-700 shadow-sm"
          >
            Clear
          </button>
        </div>
      </div>
      )}

      {showSchedulePanel && (
        <div className="fixed inset-0 z-40 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
          <div className="relative z-10 w-[1040px] max-w-[96vw] overflow-hidden rounded-2xl border border-white/10 bg-neutral-950/95 shadow-2xl text-white">
            <div className="pointer-events-none absolute -top-32 -right-28 h-72 w-72 rounded-full bg-emerald-500/20 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-32 -left-28 h-72 w-72 rounded-full bg-amber-500/20 blur-3xl" />

            <div className="relative border-b border-white/10 px-6 py-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] uppercase tracking-[0.24em] text-white/60">
                    Schedule Lab
                  </div>
                  <h3 className="mt-3 text-lg font-semibold">Schedule Builder</h3>
                  <p className="text-xs text-white/60">
                    Build a single-day A → B schedule, generate returns, and refine the departures.
                  </p>
                </div>
                <div className="text-right">
                  <div className="text-[10px] uppercase tracking-[0.2em] text-white/40">
                    Editing
                  </div>
                  <div className="text-sm font-medium text-white/90">{scheduleTargetName}</div>
                  <div className="mt-2 flex items-center justify-end gap-2 text-[11px] text-white/50">
                    <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5">
                      {scheduleDraft.departures.length} trips
                    </span>
                    <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5">
                      {scheduleDraft.startTime}–{scheduleDraft.endTime}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="relative grid gap-6 p-6 lg:grid-cols-[340px_1fr]">
              <div className="space-y-4">
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <div className="text-[11px] uppercase tracking-[0.2em] text-white/50">
                    Applies To
                  </div>
                  <select
                    multiple
                    value={scheduleTargetIds}
                    onChange={(e) => {
                      const selected = Array.from(e.target.selectedOptions).map(
                        (option) => option.value
                      );
                      setScheduleTargetIds(
                        selected.length > 0 ? selected : [activeRoute.id]
                      );
                    }}
                    className="mt-3 h-32 w-full rounded-xl bg-black/40 border border-white/10 px-2 py-2 text-xs text-white/90 focus:outline-none focus:ring-1 focus:ring-emerald-300/40"
                  >
                    <option value={activeRoute.id}>Current route</option>
                    {routes.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                  <div className="mt-2 text-[10px] text-white/40">
                    Hold Cmd/Ctrl to select multiple routes.
                  </div>
                </div>

                <div className="rounded-2xl border border-white/10 bg-white/5 p-4 space-y-3">
                  <div className="text-[11px] uppercase tracking-[0.2em] text-white/50">
                    Trip Window
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="time"
                      value={scheduleDraft.startTime}
                      onChange={(e) =>
                        setScheduleDraft((prev) => ({ ...prev, startTime: e.target.value }))
                      }
                      className="rounded-xl bg-black/40 border border-white/10 px-2.5 py-2 text-xs text-white/90 focus:outline-none focus:ring-1 focus:ring-emerald-300/40"
                    />
                    <input
                      type="time"
                      value={scheduleDraft.endTime}
                      onChange={(e) =>
                        setScheduleDraft((prev) => ({ ...prev, endTime: e.target.value }))
                      }
                      className="rounded-xl bg-black/40 border border-white/10 px-2.5 py-2 text-xs text-white/90 focus:outline-none focus:ring-1 focus:ring-emerald-300/40"
                    />
                  </div>

                  <div>
                    <div className="text-[11px] text-white/60">Outbound headway (minutes)</div>
                    <input
                      type="number"
                      min={0}
                      value={scheduleDraft.outboundHeadway}
                      onChange={(e) =>
                        setScheduleDraft((prev) => ({
                          ...prev,
                          outboundHeadway: e.target.value === "" ? 0 : Number(e.target.value),
                        }))
                      }
                      className="mt-2 w-full rounded-xl bg-black/40 border border-white/10 px-2.5 py-2 text-xs text-white/90 focus:outline-none focus:ring-1 focus:ring-emerald-300/40"
                    />
                  </div>

                  <div className="border-t border-white/10 pt-3 space-y-2">
                    <label className="flex items-center gap-2 text-xs text-white/80">
                      <input
                        type="checkbox"
                        checked={scheduleDraft.returnEnabled}
                        onChange={(e) =>
                          setScheduleDraft((prev) => ({
                            ...prev,
                            returnEnabled: e.target.checked,
                          }))
                        }
                        className="h-4 w-4 rounded accent-emerald-400"
                      />
                      Include return trip to A
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <div className="text-[11px] text-white/60">Return buffer (min)</div>
                        <input
                          type="number"
                          min={0}
                          value={scheduleDraft.returnBufferMinutes}
                          onChange={(e) =>
                            setScheduleDraft((prev) => ({
                              ...prev,
                              returnBufferMinutes: e.target.value === "" ? 0 : Number(e.target.value),
                            }))
                          }
                          className="mt-2 w-full rounded-xl bg-black/40 border border-white/10 px-2.5 py-2 text-xs text-white/90 focus:outline-none focus:ring-1 focus:ring-emerald-300/40"
                        />
                      </div>
                      <div>
                        <div className="text-[11px] text-white/60">Return headway (min)</div>
                        <input
                          type="number"
                          min={0}
                          value={
                            scheduleDraft.returnSameAsOutbound
                              ? scheduleDraft.outboundHeadway
                              : scheduleDraft.returnHeadway
                          }
                          onChange={(e) =>
                            setScheduleDraft((prev) => ({
                              ...prev,
                              returnHeadway: e.target.value === "" ? 0 : Number(e.target.value),
                            }))
                          }
                          disabled={scheduleDraft.returnSameAsOutbound}
                          className="mt-2 w-full rounded-xl bg-black/40 border border-white/10 px-2.5 py-2 text-xs text-white/90 focus:outline-none focus:ring-1 focus:ring-emerald-300/40 disabled:opacity-50"
                        />
                      </div>
                    </div>
                    <label className="flex items-center gap-2 text-xs text-white/70">
                      <input
                        type="checkbox"
                        checked={scheduleDraft.returnSameAsOutbound}
                        onChange={(e) =>
                          setScheduleDraft((prev) => ({
                            ...prev,
                            returnSameAsOutbound: e.target.checked,
                          }))
                        }
                        className="h-4 w-4 rounded accent-emerald-400"
                      />
                      Return headway same as outbound
                    </label>
                  </div>

                  <button
                    onClick={() => {
                      setScheduleGenerating(true);
                      window.setTimeout(() => {
                        const generated = buildDeparturesFromDraft(
                          scheduleDraft,
                          scheduleTargetRoute.durationSeconds ??
                            route?.duration ??
                            activeRoute.durationSeconds,
                        );
                        const nextDepartures = generated.merged.map(formatMinutesToTime);
                        setScheduleDraft((prev) => ({
                          ...prev,
                          departures: nextDepartures,
                        }));
                        setScheduleDeparturesText(nextDepartures.join("\n"));
                        setScheduleHasData(nextDepartures.length > 0);
                        setScheduleOutboundTimes(generated.outbound.map(formatMinutesToTime));
                        setScheduleReturnTimes(generated.returns.map(formatMinutesToTime));
                        applyScheduleToTargets({ type: "fixed", departures: nextDepartures });
                        setScheduleGenerating(false);
                      }, 250);
                    }}
                    className="w-full rounded-xl bg-gradient-to-r from-emerald-400 to-amber-300 px-3 py-2.5 text-xs font-semibold text-neutral-900 shadow-lg shadow-emerald-500/10 transition hover:from-emerald-300 hover:to-amber-200"
                  >
                    {scheduleGenerating ? "Generating..." : "Generate Schedule"}
                  </button>
                </div>
              </div>

              <div className="space-y-4">
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="text-[11px] uppercase tracking-[0.2em] text-white/50">
                      Departures (editable)
                    </div>
                    <div className="text-xs text-white/60">
                      {scheduleDraft.departures.length} trips
                    </div>
                  </div>

                  {!scheduleHasData && (
                    <div className="rounded-lg border border-amber-300/30 bg-amber-300/10 px-3 py-2 text-[10px] text-amber-100">
                      This route has no schedule yet. Generate one or paste times.
                    </div>
                  )}
                  <div className="text-[10px] text-white/45">
                    Outbound/Return lists are auto-generated. Custom Times override both and become
                    the departures used for simulation.
                  </div>

                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="rounded-xl border border-white/10 bg-black/30 p-3">
                      <div className="text-[10px] uppercase tracking-[0.2em] text-emerald-300">
                        Outbound A → B
                      </div>
                      {scheduleOutboundTimes.length === 0 ? (
                        <div className="mt-3 text-[10px] text-white/40">
                          Generate a schedule to see outbound trips.
                        </div>
                      ) : (
                        <div className="mt-3 max-h-28 space-y-1 overflow-y-auto text-xs text-white/80">
                          {scheduleOutboundTimes.map((time) => (
                            <div key={`out-${time}`} className="rounded-lg bg-white/5 px-2 py-1">
                              {time}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="rounded-xl border border-white/10 bg-black/30 p-3">
                      <div className="text-[10px] uppercase tracking-[0.2em] text-amber-300">
                        Return B → A
                      </div>
                      {scheduleReturnTimes.length === 0 ? (
                        <div className="mt-3 text-[10px] text-white/40">
                          Generate a schedule to see return trips.
                        </div>
                      ) : (
                        <div className="mt-3 max-h-28 space-y-1 overflow-y-auto text-xs text-white/80">
                          {scheduleReturnTimes.map((time) => (
                            <div key={`ret-${time}`} className="rounded-lg bg-white/5 px-2 py-1">
                              {time}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="rounded-xl border border-white/10 bg-black/30 p-3">
                    <div className="text-[10px] uppercase tracking-[0.2em] text-white/50">
                      Custom Times (override)
                    </div>
                    <textarea
                      value={scheduleDeparturesText}
                      onChange={(e) => setScheduleDeparturesText(e.target.value)}
                      placeholder="HH:MM per line"
                      className="mt-3 h-40 w-full rounded-xl bg-black/40 border border-white/10 p-3 text-xs text-white/90 focus:outline-none focus:ring-1 focus:ring-emerald-300/40"
                    />
                    <div className="mt-2 text-[10px] text-white/40">
                      Separate times by line or comma. Example: 06:00, 06:30, 07:00
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={applyDeparturesText}
                    className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/80 hover:bg-white/10"
                  >
                    Apply Edits
                  </button>
                  <button
                    onClick={() => {
                      applyDeparturesText();
                      onCloseSchedule?.();
                    }}
                    className="rounded-xl bg-emerald-500 hover:bg-emerald-400 px-3 py-2 text-xs font-semibold text-neutral-900 shadow-sm transition-all"
                  >
                    Save & Close
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <AlertDialog open={showPinNameDialog} onOpenChange={setShowPinNameDialog}>
        <AlertDialogContent size="sm">
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
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
              placeholder="Pinned stop"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => {
                setPinCandidate(null);
                window.dispatchEvent(new CustomEvent("route-builder-pin-complete"));
              }}
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
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
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Save this stop?</AlertDialogTitle>
            <AlertDialogDescription>
              Saved stops appear in the command bar for quick reuse.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => {
                setPinCandidate(null);
                setShowPinSaveDialog(false);
                window.dispatchEvent(new CustomEvent("route-builder-pin-complete"));
              }}
            >
              Skip
            </AlertDialogCancel>
            <AlertDialogAction
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
      className={`flex items-center gap-2 rounded-lg border px-2 py-1.5 group ${
        isSelected ? "bg-white/10 border-white/20" : "bg-black/30 border-white/10"
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
        <div className="text-[11px] truncate">{stop.name ?? `Stop ${index + 1}`}</div>
        <div className="text-[10px] text-white/45 truncate">
          {stop.lat.toFixed(5)}, {stop.lng.toFixed(5)}
        </div>
      </div>
      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleTimepoint();
          }}
          className="p-1 rounded hover:bg-white/10 text-[10px]"
          title="Toggle timepoint"
        >
          {stop.timepoint ? "★" : "☆"}
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="p-1 rounded hover:bg-red-500/30 text-red-300 text-[10px]"
          title="Remove"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
