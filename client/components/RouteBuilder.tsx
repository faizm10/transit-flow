"use client";

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
import type { DirectionsProfile } from "@/lib/mapboxDirections";

const ROUTE_LAYER_ID = "route-builder-line";
const ROUTE_SOURCE_ID = "route-builder-route";

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
  goVariantsIndex: GoVariantsIndex | null;
  goVariantStops: Record<string, GoVariantStop[]> | null;
  showCustomNetwork?: boolean;
};

function getVariantLabel(
  variant: GoVariant,
  stops: GoVariantStop[] | undefined
): string {
  if (stops && stops.length >= 2) {
    const first = stops[0]?.stop_name ?? "";
    const last = stops[stops.length - 1]?.stop_name ?? "";
    const short = (s: string) =>
      s
        .replace(/\s+GO\s*$/i, "")
        .replace(/\s+Station\s*$/i, "")
        .replace(/\s+Bus\s*$/i, "")
        .replace(/\s+Terminal\s*$/i, "")
        .trim();
    if (first && last) return `${variant.route_variant || variant.variant_id} - ${short(first)} → ${short(last)}`;
  }
  return variant.label || variant.variant_id;
}

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
  goVariantsIndex,
  goVariantStops,
  showCustomNetwork = true,
}: RouteBuilderProps) {
  const {
    routes,
    currentRoute,
    activeRoute,
    stops,
    profile,
    setProfile,
    route,
    loading,
    error,
    addStop,
    updateStop,
    removeStop,
    setStops,
    loadFromGoVariant,
    clearBaseVariant,
    saveRoute,
    saveReversedRoute,
    loadRoute,
    deleteRoute,
    clearRoute,
    updateCurrent,
    updateRouteById,
  } = useRouteBuilder(goVariantStops);

  const [buildMode, setBuildMode] = useState<"quick" | "manual">("quick");
  const [quickStyle, setQuickStyle] = useState<QuickStyle | null>(null);
  const [quickGenerating, setQuickGenerating] = useState(false);
  const [quickError, setQuickError] = useState<string | null>(null);
  const [quickNoStops, setQuickNoStops] = useState(false);
  const [quickStopsLoaded, setQuickStopsLoaded] = useState(false);
  const [includeUniversitiesExpress, setIncludeUniversitiesExpress] = useState(false);
  const [selectedStopId, setSelectedStopId] = useState<string | null>(null);
  const [availableStops, setAvailableStops] = useState<GoStopPoint[]>([]);
  const [extensionSuggestions, setExtensionSuggestions] = useState<
    Array<{ id: string; name: string; lat: number; lng: number; distanceKm: number }>
  >([]);
  const [showExtensions, setShowExtensions] = useState(false);
  const [showExtendDropdown, setShowExtendDropdown] = useState(false);
  const [showSavedRoutes, setShowSavedRoutes] = useState(false);
  const markersRef = useRef<mapboxgl.Marker[]>([]);
  const lastQuickEndpointsRef = useRef<string | null>(null);
  const rawQuickStartRef = useRef<Stop | null>(null);
  const rawQuickEndRef = useRef<Stop | null>(null);
  const [scheduleTargetIds, setScheduleTargetIds] = useState<string[]>(() => [
    currentRoute?.id ?? activeRoute.id,
  ]);

  const variantOptions = useMemo(() => {
    if (!goVariantsIndex || !goVariantStops) return [];
    const out: { variantId: string; routeShortName: string; label: string }[] = [];
    Object.entries(goVariantsIndex).forEach(([routeShortName, variants]) => {
      variants.forEach((v) => {
        const s = goVariantStops[v.variant_id];
        if (s && s.length > 0) {
          out.push({
            variantId: v.variant_id,
            routeShortName,
            label: getVariantLabel(v, s),
          });
        }
      });
    });
    return out.sort((a, b) => a.label.localeCompare(b.label));
  }, [goVariantsIndex, goVariantStops]);

  const routeColor = activeRoute.color;

  const isActive = enabled || showCustomNetwork;
  const selectedStop = useMemo(
    () => stops.find((s) => s.id === selectedStopId) ?? null,
    [stops, selectedStopId]
  );
  const hasQuickEndpoints = stops.length >= 2;

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
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
      end: Stop,
      baseDurationSeconds?: number
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
    async (style: QuickStyle) => {
      if (stops.length < 2) return;
      const token = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;
      if (!token) {
        setQuickError("Mapbox token not configured");
        return;
      }
      setQuickGenerating(true);
      setQuickError(null);
      setQuickNoStops(false);
      const rawStart = rawQuickStartRef.current ?? stops[0];
      const rawEnd = rawQuickEndRef.current ?? stops[stops.length - 1];
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
          end,
          result.data.duration
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
    [stops, activeRoute.profile, availableStops.length, buildStopsFromGeometry, setStops]
  );

  useEffect(() => {
    if (buildMode !== "quick") return;
    if (stops.length !== 2) {
      lastQuickEndpointsRef.current = null;
      return;
    }
    if (!quickStopsLoaded || quickGenerating || quickStyle) return;
    const key = `${stops[0].id}-${stops[1].id}`;
    if (lastQuickEndpointsRef.current === key) return;
    lastQuickEndpointsRef.current = key;
    generateQuickRoute("normal");
  }, [buildMode, stops, quickStopsLoaded, quickGenerating, quickStyle, generateQuickRoute]);

  useEffect(() => {
    if (buildMode !== "quick") return;
    if (quickStyle !== "express") return;
    if (stops.length !== 2) return;
    if (!quickStopsLoaded || quickGenerating) return;
    generateQuickRoute("express");
  }, [buildMode, quickStyle, stops, quickStopsLoaded, quickGenerating, includeUniversitiesExpress, generateQuickRoute]);

  const applyQuickStyle = useCallback(
    (style: QuickStyle) => {
      generateQuickRoute(style);
    },
    [generateQuickRoute]
  );

  const resetQuickEndpoints = useCallback(() => {
    clearRoute();
    setQuickStyle(null);
    setQuickError(null);
    setQuickNoStops(false);
    setSelectedStopId(null);
    lastQuickEndpointsRef.current = null;
    rawQuickStartRef.current = null;
    rawQuickEndRef.current = null;
  }, [clearRoute]);

  const handleSaveReversed = useCallback(() => {
    const base = currentRoute ?? activeRoute;
    if (base.stops.length < 2) return;
    saveReversedRoute(base);
  }, [currentRoute, activeRoute, saveReversedRoute]);

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

  // Map click to add stop (only when panel is open)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !enabled) return;

    const handleClick = (e: mapboxgl.MapMouseEvent) => {
      const { lng, lat } = e.lngLat;
      if (buildMode === "manual") {
        addStop(lng, lat);
        return;
      }
      const newStop: Stop = {
        id: buildStopId(),
        name: stops.length === 0 ? "Start" : stops.length === 1 ? "End" : "End",
        lng,
        lat,
        timepoint: stops.length === 0 || stops.length === 1,
      };
      if (stops.length === 0) {
        rawQuickStartRef.current = newStop;
        setStops([newStop]);
      } else if (stops.length === 1) {
        rawQuickEndRef.current = newStop;
        setStops([stops[0], newStop]);
      } else {
        rawQuickEndRef.current = newStop;
        setStops([stops[0], newStop]);
      }
      setQuickStyle(null);
      setQuickError(null);
      setQuickNoStops(false);
    };

    map.on("click", handleClick);
    map.getCanvas().style.cursor = "crosshair";
    return () => {
      map.off("click", handleClick);
      map.getCanvas().style.cursor = "";
    };
  }, [mapRef, mapReady, enabled, buildMode, addStop, stops, setStops]);

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
    if (!showExtensions) return;
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
    setScheduleTargetIds((prev) =>
      prev.length === 1 && prev[0] === currentRoute.id ? prev : [currentRoute.id]
    );
  }, [currentRoute?.id]);

  if (!showPanel && !showSchedulePanel) return null;

  const primaryScheduleTargetId = scheduleTargetIds[0] ?? activeRoute.id;
  const scheduleTargetRoute =
    primaryScheduleTargetId && primaryScheduleTargetId !== activeRoute.id
      ? routes.find((r) => r.id === primaryScheduleTargetId) ?? activeRoute
      : activeRoute;
  const schedule = scheduleTargetRoute.schedule;
  const departures = schedule ? expandSchedule(schedule) : [];
  const scheduleTargetName =
    scheduleTargetIds.length > 1
      ? "Multiple routes"
      : primaryScheduleTargetId === activeRoute.id || !primaryScheduleTargetId
      ? "Current route"
      : routes.find((r) => r.id === primaryScheduleTargetId)?.name ?? "Current route";

  return (
    <div className="flex gap-3 items-start">
      {showPanel && (
      <div className="w-72 overflow-hidden rounded-xl bg-black/60 backdrop-blur-md border border-white/20 shadow-2xl text-white/90 flex flex-col max-h-[85vh]">
        <div className="px-3 py-2.5 border-b border-white/10 bg-black/40 shrink-0">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-xs font-semibold text-white">Route Builder</h3>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setBuildMode("quick")}
              className={`px-2 py-0.5 rounded text-[10px] border ${
                buildMode === "quick"
                  ? "bg-white/20 border-white/30 text-white"
                  : "bg-black/40 border-white/10 text-white/60"
              }`}
            >
              Quick
            </button>
            <button
              onClick={() => setBuildMode("manual")}
              className={`px-2 py-0.5 rounded text-[10px] border ${
                buildMode === "manual"
                  ? "bg-white/20 border-white/30 text-white"
                  : "bg-black/40 border-white/10 text-white/60"
              }`}
            >
              Manual
            </button>
          </div>
        </div>
        <p className="text-[10px] text-white/50 mt-0.5">
          {buildMode === "quick"
            ? "Pick start and end — generate a route in seconds"
            : "Click map to add stops · Drag markers · Extend GO routes"}
        </p>
        </div>

        <div className="p-3 space-y-3 overflow-y-auto flex-1 min-h-0">
        {/* Route name + color */}
        <div className="flex gap-2">
          <input
            type="text"
            value={activeRoute.name}
            onChange={(e) => updateCurrent({ name: e.target.value })}
            placeholder="Route name (e.g. 30 extended to London)"
            className="flex-1 rounded-lg bg-black/50 border border-white/10 px-2 py-1.5 text-xs text-white/90 placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
          />
          <div className="flex gap-1">
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

        {buildMode === "quick" && (
          <div className="rounded-xl bg-black/30 border border-white/10 p-3 space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-[11px] text-white/60">Pick start + end</div>
              <button
                onClick={resetQuickEndpoints}
                className="text-[10px] text-white/40 hover:text-white/70"
              >
                Reset
              </button>
            </div>
            <div className="rounded-lg bg-black/40 border border-white/10 px-2 py-2 text-[11px]">
              <div className="flex items-center justify-between">
                <div className="text-white/90 truncate">{stops[0]?.name ?? "Start stop"}</div>
                <div className="text-white/40">→</div>
                <div className="text-white/90 truncate text-right">
                  {stops[stops.length - 1]?.name ?? "End stop"}
                </div>
              </div>
            </div>

            {hasQuickEndpoints && (
              <div className="grid grid-cols-3 gap-2">
                {(Object.keys(QUICK_STYLE_CONFIG) as QuickStyle[]).map((key) => (
                  <button
                    key={key}
                    onClick={() => applyQuickStyle(key)}
                    disabled={quickGenerating}
                    className={`rounded-lg border px-2 py-2 text-[10px] text-left transition ${
                      quickStyle === key
                        ? "border-white/40 bg-white/15"
                        : "border-white/10 bg-black/40 hover:bg-white/5"
                    }`}
                  >
                    <div className="text-white/90">{QUICK_STYLE_CONFIG[key].label}</div>
                    <div className="text-white/40">
                      {key === "express"
                        ? "80% fewer stops"
                        : key === "medium"
                          ? "50% fewer stops"
                          : "All nearby stops"}
                    </div>
                  </button>
                ))}
              </div>
            )}

            {quickStyle === "express" && (
              <label className="flex items-center gap-2 text-[10px] text-white/60">
                <input
                  type="checkbox"
                  className="w-3.5 h-3.5 rounded accent-blue-400"
                  checked={includeUniversitiesExpress}
                  onChange={(e) => setIncludeUniversitiesExpress(e.target.checked)}
                />
                Include universities along the route
              </label>
            )}

            {(quickGenerating || quickError || quickNoStops) && (
              <div className="text-[10px] text-white/50">
                {quickGenerating
                  ? "Finding stops along route..."
                  : quickError
                    ? quickError
                    : "No transit stops found near this route."}
              </div>
            )}

            {route && (
              <div className="grid grid-cols-3 gap-2 text-[10px] text-white/70">
                <div className="rounded-lg border border-white/10 bg-black/40 px-2 py-2">
                  <div className="text-white/40">Distance</div>
                  <div className="text-white/90 font-medium">
                    {(route.distance / 1000).toFixed(1)} km
                  </div>
                </div>
                <div className="rounded-lg border border-white/10 bg-black/40 px-2 py-2">
                  <div className="text-white/40">Duration</div>
                  <div className="text-white/90 font-medium">
                    {Math.round(route.duration / 60)} min
                  </div>
                </div>
                <div className="rounded-lg border border-white/10 bg-black/40 px-2 py-2">
                  <div className="text-white/40">Stops</div>
                  <div className="text-white/90 font-medium">{stops.length}</div>
                </div>
              </div>
            )}

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <button
                  onClick={saveRoute}
                  disabled={stops.length < 2}
                  className="rounded-lg bg-emerald-500/20 border border-emerald-400/40 px-3 py-2 text-[11px] text-emerald-200 hover:bg-emerald-500/30 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Save route
                </button>
                <button
                  onClick={handleSaveReversed}
                  disabled={stops.length < 2}
                  className="rounded-lg bg-white/10 border border-white/15 px-3 py-2 text-[11px] text-white/80 hover:bg-white/20 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Save reverse
                </button>
              </div>
              <button
                onClick={() => setBuildMode("manual")}
                className="text-[11px] text-blue-300 hover:text-blue-200"
              >
                Edit stops
              </button>
            </div>
          </div>
        )}

        {/* Extend GO route */}
        {buildMode === "manual" && (
        <div>
          <label className="text-[10px] text-white/60 block mb-1">
            Extend GO route (optional)
          </label>
          {activeRoute.baseVariantLabel ? (
            <div className="flex items-center gap-2 rounded-lg bg-emerald-500/20 border border-emerald-500/30 px-2 py-1.5">
              <span className="text-[11px] text-emerald-200 truncate flex-1">
                {activeRoute.baseVariantLabel}
              </span>
              <button
                onClick={clearBaseVariant}
                className="text-[10px] text-red-300 hover:text-red-200"
              >
                Clear
              </button>
            </div>
          ) : (
            <div className="relative">
              <button
                onClick={() => setShowExtendDropdown((v) => !v)}
                className="w-full rounded-lg bg-black/50 border border-white/10 px-2 py-1.5 text-xs text-white/70 hover:bg-black/60 text-left"
              >
                {showExtendDropdown ? "Hide options" : "Select GO route to extend..."}
              </button>
              {showExtendDropdown && (
                <div className="absolute top-full left-0 right-0 mt-1 max-h-40 overflow-y-auto rounded-lg bg-black/90 border border-white/20 shadow-xl z-20">
                  {variantOptions.length === 0 ? (
                    <div className="px-2 py-3 text-[10px] text-white/50">
                      Loading...
                    </div>
                  ) : (
                    variantOptions.map((opt) => (
                      <button
                        key={opt.variantId}
                        onClick={() => {
                          loadFromGoVariant(opt.variantId, opt.label);
                          setShowExtendDropdown(false);
                        }}
                        className="w-full px-2 py-2 text-left text-[11px] hover:bg-white/10 border-b border-white/5 last:border-0"
                      >
                        {opt.label}
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          )}
        </div>
        )}

        {/* Profile */}
        {buildMode === "manual" && (
        <div>
          <label className="text-[10px] text-white/60 block mb-1">Profile</label>
          <select
            value={profile}
            onChange={(e) => setProfile(e.target.value as DirectionsProfile)}
            className="w-full rounded-lg bg-black/50 border border-white/10 px-2 py-1.5 text-xs text-white/90 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
          >
            <option value="mapbox/driving">Driving</option>
            <option value="mapbox/walking">Walking</option>
            <option value="mapbox/cycling">Cycling</option>
          </select>
        </div>
        )}

        {/* Route stats */}
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

        {/* Stops */}
        {buildMode === "manual" && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] text-white/60">Stops ({stops.length})</span>
            <div className="flex gap-2">
              <button
                onClick={saveRoute}
                disabled={stops.length < 2}
                className="text-[10px] text-emerald-400 hover:text-emerald-300 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Save
              </button>
              <button
                onClick={handleSaveReversed}
                disabled={stops.length < 2}
                className="text-[10px] text-white/60 hover:text-white/80 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Save reverse
              </button>
              <button
                onClick={clearRoute}
                className="text-[10px] text-red-300 hover:text-red-200"
              >
                Clear
              </button>
            </div>
          </div>

          <div className="max-h-40 overflow-y-auto space-y-1">
            {stops.length === 0 ? (
              <div className="text-[10px] text-white/40 py-4 text-center">
                Extend a GO route or add 2+ stops by clicking the map
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
        )}

        {buildMode === "manual" && selectedStop && (
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
            <div className="flex items-center gap-2">
              <button
                onClick={() =>
                  updateStop(selectedStop.id, { timepoint: !selectedStop.timepoint })
                }
                className="text-[10px] text-amber-300 hover:text-amber-200"
              >
                {selectedStop.timepoint ? "Unset timepoint" : "Mark as timepoint"}
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

        {buildMode === "quick" && selectedStop && (
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
            <div className="flex items-center gap-2">
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

        {buildMode === "manual" && (
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
        )}

        {/* Saved routes */}
        {routes.length > 0 && (
          <div>
            <button
              onClick={() => setShowSavedRoutes((v) => !v)}
              className="w-full flex items-center justify-between text-[10px] text-white/60 hover:text-white/80"
            >
              <span>Saved routes ({routes.length})</span>
              <span>{showSavedRoutes ? "Hide" : "Show"}</span>
            </button>
            {showSavedRoutes && (
              <div className="mt-2 space-y-1">
                {routes.map((r) => (
                  <div
                    key={r.id}
                    className="flex items-center gap-2 rounded-lg bg-black/30 border border-white/10 px-2 py-1.5"
                  >
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
                ))}
              </div>
            )}
          </div>
        )}
        </div>
      </div>
      )}

      {showSchedulePanel && (
      <div className="w-80 overflow-hidden rounded-xl bg-black/60 backdrop-blur-md border border-white/20 shadow-2xl text-white/90 flex flex-col max-h-[85vh]">
        <div className="px-3 py-2.5 border-b border-white/10 bg-black/40 shrink-0">
          <h3 className="text-xs font-semibold text-white">Schedule Builder</h3>
          <p className="text-[10px] text-white/50 mt-0.5">
            Click a preset, then tweak times + frequency
          </p>
        </div>
        <div className="p-3 space-y-3 overflow-y-auto flex-1 min-h-0">
          <div className="rounded-lg border border-white/10 bg-black/40 px-2 py-2 text-[10px] text-white/70 space-y-1">
            <div className="text-white/50">Schedule applies to</div>
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
              className="w-full rounded-lg bg-black/50 border border-white/10 px-2 py-1 text-xs text-white/90"
            >
              <option value={activeRoute.id}>Current route</option>
              {routes.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
            <div className="text-white/35">
              Hold Cmd/Ctrl to select multiple routes.
            </div>
            <div className="text-white/40">{scheduleTargetName}</div>
          </div>
          <ScheduleEditor
            schedule={schedule}
            onChange={(s) => {
              const targets =
                scheduleTargetIds.length > 0 ? scheduleTargetIds : [activeRoute.id];
              targets.forEach((targetId) => {
                const isSavedTarget = routes.some((r) => r.id === targetId);
                if (!targetId || !isSavedTarget || targetId === activeRoute.id) {
                  updateCurrent({ schedule: s });
                } else {
                  updateRouteById(targetId, { schedule: s });
                }
              });
            }}
            durationSeconds={scheduleTargetRoute.durationSeconds ?? route?.duration ?? activeRoute.durationSeconds}
          />
          {departures.length > 0 && (
            <div className="text-[10px] text-white/45">
              {departures.length} departures: {departures.slice(0, 5).join(", ")}
              {departures.length > 5 ? ` ...` : ""}
            </div>
          )}
        </div>
      </div>
      )}
    </div>
  );
}

function ScheduleEditor({
  schedule,
  onChange,
  durationSeconds,
}: {
  schedule: Schedule | undefined;
  onChange: (s: Schedule | undefined) => void;
  durationSeconds?: number;
}) {
  type DayKey =
    | "sunday"
    | "monday"
    | "tuesday"
    | "wednesday"
    | "thursday"
    | "friday"
    | "saturday";
  const dayOrder: Array<{ key: DayKey; label: string }> = [
    { key: "monday", label: "Mon" },
    { key: "tuesday", label: "Tue" },
    { key: "wednesday", label: "Wed" },
    { key: "thursday", label: "Thu" },
    { key: "friday", label: "Fri" },
    { key: "saturday", label: "Sat" },
    { key: "sunday", label: "Sun" },
  ];
  const defaultDayConfigs = (): Record<
    DayKey,
    { enabled: boolean; startTime: string; endTime: string; intervalMinutes: number }
  > => ({
    monday: { enabled: true, startTime: "06:00", endTime: "22:00", intervalMinutes: 30 },
    tuesday: { enabled: true, startTime: "06:00", endTime: "22:00", intervalMinutes: 30 },
    wednesday: { enabled: true, startTime: "06:00", endTime: "22:00", intervalMinutes: 30 },
    thursday: { enabled: true, startTime: "06:00", endTime: "22:00", intervalMinutes: 30 },
    friday: { enabled: true, startTime: "06:00", endTime: "22:00", intervalMinutes: 30 },
    saturday: { enabled: false, startTime: "06:00", endTime: "22:00", intervalMinutes: 30 },
    sunday: { enabled: false, startTime: "06:00", endTime: "22:00", intervalMinutes: 30 },
  });
  const hydrateDayConfigs = (
    input: Schedule | undefined,
  ): Record<
    DayKey,
    { enabled: boolean; startTime: string; endTime: string; intervalMinutes: number }
  > => {
    const base = defaultDayConfigs();
    if (!input || input.type !== "frequency") return base;
    if (input.dayConfigs && Object.keys(input.dayConfigs).length > 0) {
      dayOrder.forEach(({ key }) => {
        const value = input.dayConfigs?.[key];
        if (!value) return;
        base[key] = {
          enabled: Boolean(value.enabled),
          startTime: value.startTime || base[key].startTime,
          endTime: value.endTime || base[key].endTime,
          intervalMinutes: Number(value.intervalMinutes || base[key].intervalMinutes),
        };
      });
      return base;
    }
    const legacyStart = input.startTime || "06:00";
    const legacyEnd = input.endTime || "22:00";
    const legacyInterval = Number(input.intervalMinutes || 30);
    const legacyDays = input.days || "weekday";
    dayOrder.forEach(({ key }) => {
      const isWeekend = key === "saturday" || key === "sunday";
      const enabled =
        legacyDays === "all" ||
        (legacyDays === "weekend" && isWeekend) ||
        (legacyDays === "weekday" && !isWeekend);
      base[key] = {
        enabled,
        startTime: legacyStart,
        endTime: legacyEnd,
        intervalMinutes: legacyInterval,
      };
    });
    return base;
  };

  const [type, setType] = useState<"frequency" | "fixed" | "none">(
    schedule?.type ?? "none"
  );
  const [dayConfigs, setDayConfigs] = useState(() => hydrateDayConfigs(schedule));
  const [departuresText, setDeparturesText] = useState(
    schedule?.type === "fixed"
      ? schedule.departures.join(", ")
      : "06:00, 06:30, 07:00, 07:30, 08:00"
  );

  useEffect(() => {
    setType(schedule?.type ?? "none");
    setDayConfigs(hydrateDayConfigs(schedule));
    if (schedule?.type === "fixed") {
      setDeparturesText(schedule.departures.join(", "));
    }
  }, [schedule]);

  const presetConfigs = {
    weekdayPeak: {
      label: "Weekday peak",
      config: {
        monday: { enabled: true, startTime: "06:00", endTime: "09:00", intervalMinutes: 10 },
        tuesday: { enabled: true, startTime: "06:00", endTime: "09:00", intervalMinutes: 10 },
        wednesday: { enabled: true, startTime: "06:00", endTime: "09:00", intervalMinutes: 10 },
        thursday: { enabled: true, startTime: "06:00", endTime: "09:00", intervalMinutes: 10 },
        friday: { enabled: true, startTime: "06:00", endTime: "09:00", intervalMinutes: 10 },
      },
    },
    weekdayOffPeak: {
      label: "Weekday off-peak",
      config: {
        monday: { enabled: true, startTime: "09:00", endTime: "15:00", intervalMinutes: 20 },
        tuesday: { enabled: true, startTime: "09:00", endTime: "15:00", intervalMinutes: 20 },
        wednesday: { enabled: true, startTime: "09:00", endTime: "15:00", intervalMinutes: 20 },
        thursday: { enabled: true, startTime: "09:00", endTime: "15:00", intervalMinutes: 20 },
        friday: { enabled: true, startTime: "09:00", endTime: "15:00", intervalMinutes: 20 },
      },
    },
    saturday: {
      label: "Saturday",
      config: {
        saturday: { enabled: true, startTime: "08:00", endTime: "22:00", intervalMinutes: 30 },
      },
    },
    sundayHoliday: {
      label: "Sunday/holiday",
      config: {
        sunday: { enabled: true, startTime: "09:00", endTime: "21:00", intervalMinutes: 40 },
      },
    },
  };

  const applyPreset = (preset: keyof typeof presetConfigs) => {
    const merged = { ...defaultDayConfigs(), ...presetConfigs[preset].config };
    setType("frequency");
    setDayConfigs(merged);
  };

  const autoGenerateSchedule = () => {
    const tripMinutes = durationSeconds ? durationSeconds / 60 : 60;
    const baseInterval =
      tripMinutes <= 30 ? 10 : tripMinutes <= 60 ? 15 : tripMinutes <= 90 ? 20 : 30;
    const next = defaultDayConfigs();
    (["monday", "tuesday", "wednesday", "thursday", "friday"] as DayKey[]).forEach(
      (key) => {
        next[key] = {
          enabled: true,
          startTime: "06:00",
          endTime: "23:00",
          intervalMinutes: baseInterval,
        };
      }
    );
    next.saturday = {
      enabled: true,
      startTime: "08:00",
      endTime: "22:00",
      intervalMinutes: Math.min(40, baseInterval + 10),
    };
    next.sunday = {
      enabled: true,
      startTime: "09:00",
      endTime: "21:00",
      intervalMinutes: Math.min(45, baseInterval + 15),
    };
    setType("frequency");
    setDayConfigs(next);
  };

  const apply = () => {
    if (type === "none") {
      onChange(undefined);
      return;
    }
    if (type === "frequency") {
      onChange({
        type: "frequency",
        dayConfigs,
      });
    } else {
      const list = departuresText
        .split(/[\s,;]+/)
        .map((s) => s.trim())
        .filter((s) => /^\d{1,2}:\d{2}$/.test(s));
      onChange({ type: "fixed", departures: list });
    }
  };

  const summary = useMemo(() => {
    if (type !== "frequency") return null;
    const enabledDays = dayOrder
      .map(({ key }) => dayConfigs[key])
      .filter((d) => d?.enabled);
    if (enabledDays.length === 0) return null;
    const startTime = enabledDays[0]?.startTime ?? "06:00";
    const endTime = enabledDays[0]?.endTime ?? "22:00";
    const interval = enabledDays[0]?.intervalMinutes ?? 30;
    return { startTime, endTime, interval };
  }, [type, dayConfigs, dayOrder]);

  const busesNeeded = useMemo(() => {
    if (!summary || !durationSeconds || durationSeconds <= 0) return null;
    const intervalSeconds = summary.interval * 60;
    if (!intervalSeconds) return null;
    return Math.max(1, Math.ceil(durationSeconds / intervalSeconds));
  }, [summary, durationSeconds]);

  return (
    <div className="mt-2 space-y-3 rounded-lg bg-black/30 border border-white/10 p-2 text-[11px]">
      <div className="space-y-2">
        <div className="flex items-center justify-between text-[10px] text-white/50">
          <span>Presets</span>
          <button
            onClick={autoGenerateSchedule}
            className="text-white/60 hover:text-white/80"
          >
            Auto-generate
          </button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {Object.entries(presetConfigs).map(([key, preset]) => (
            <button
              key={key}
              onClick={() => applyPreset(key as keyof typeof presetConfigs)}
              className="rounded-lg bg-black/40 border border-white/10 px-2 py-2 text-[10px] text-white/80 hover:bg-white/10"
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>
      <div className="flex gap-2">
        <button
          onClick={() => setType("none")}
          className={`px-2 py-1 rounded-lg ${type === "none" ? "bg-white/20" : "bg-white/5"}`}
        >
          None
        </button>
        <button
          onClick={() => setType("frequency")}
          className={`px-2 py-1 rounded-lg ${type === "frequency" ? "bg-white/20" : "bg-white/5"}`}
        >
          Frequency
        </button>
        <button
          onClick={() => setType("fixed")}
          className={`px-2 py-1 rounded-lg ${type === "fixed" ? "bg-white/20" : "bg-white/5"}`}
        >
          Fixed times
        </button>
      </div>
      {type === "frequency" && (
        <>
          <div className="flex gap-1">
            <button
              onClick={() =>
                setDayConfigs((prev) => {
                  const next = { ...prev };
                  dayOrder.forEach(({ key }) => {
                    if (key === "saturday" || key === "sunday") return;
                    next[key] = { ...next[key], enabled: true };
                  });
                  return next;
                })
              }
              className="px-2 py-1 rounded bg-white/5 hover:bg-white/10 text-[10px]"
            >
              Weekdays
            </button>
            <button
              onClick={() =>
                setDayConfigs((prev) => {
                  const next = { ...prev };
                  dayOrder.forEach(({ key }) => {
                    next[key] = { ...next[key], enabled: true };
                  });
                  return next;
                })
              }
              className="px-2 py-1 rounded bg-white/5 hover:bg-white/10 text-[10px]"
            >
              All days
            </button>
            <button
              onClick={() =>
                setDayConfigs((prev) => {
                  const next = { ...prev };
                  dayOrder.forEach(({ key }) => {
                    next[key] = { ...next[key], enabled: false };
                  });
                  return next;
                })
              }
              className="px-2 py-1 rounded bg-white/5 hover:bg-white/10 text-[10px]"
            >
              Clear
            </button>
          </div>
          <div className="space-y-2">
            {dayOrder.map(({ key, label }) => {
              const row = dayConfigs[key];
              return (
                <div key={key} className="rounded-lg border border-white/10 p-2">
                  <div className="flex items-center justify-between">
                    <label className="flex items-center gap-2 text-[10px]">
                      <input
                        type="checkbox"
                        className="w-3.5 h-3.5 rounded accent-blue-400"
                        checked={row.enabled}
                        onChange={(e) =>
                          setDayConfigs((prev) => ({
                            ...prev,
                            [key]: { ...prev[key], enabled: e.target.checked },
                          }))
                        }
                      />
                      <span>{label}</span>
                    </label>
                    <span className="text-[10px] text-white/45">
                      Every {row.intervalMinutes} min
                    </span>
                  </div>
                  {row.enabled && (
                    <div className="grid grid-cols-3 gap-2 mt-2">
                      <input
                        type="time"
                        value={row.startTime}
                        onChange={(e) =>
                          setDayConfigs((prev) => ({
                            ...prev,
                            [key]: { ...prev[key], startTime: e.target.value },
                          }))
                        }
                        className="w-full rounded-lg bg-black/50 border border-white/10 px-2 py-1 text-xs"
                      />
                      <input
                        type="time"
                        value={row.endTime}
                        onChange={(e) =>
                          setDayConfigs((prev) => ({
                            ...prev,
                            [key]: { ...prev[key], endTime: e.target.value },
                          }))
                        }
                        className="w-full rounded-lg bg-black/50 border border-white/10 px-2 py-1 text-xs"
                      />
                      <select
                        value={row.intervalMinutes}
                        onChange={(e) =>
                          setDayConfigs((prev) => ({
                            ...prev,
                            [key]: {
                              ...prev[key],
                              intervalMinutes: Number(e.target.value),
                            },
                          }))
                        }
                        className="w-full rounded-lg bg-black/50 border border-white/10 px-2 py-1 text-xs"
                      >
                        {[10, 15, 20, 30, 45, 60, 90, 120].map((m) => (
                          <option key={m} value={m}>
                            {m}m
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
      {type === "fixed" && (
        <label>
          <span className="text-white/50">Times (e.g. 06:00, 06:30, 07:00)</span>
          <input
            type="text"
            value={departuresText}
            onChange={(e) => setDeparturesText(e.target.value)}
            placeholder="06:00, 06:30, 07:00"
            className="mt-1 w-full rounded-lg bg-black/50 border border-white/10 px-2 py-1 text-xs"
          />
        </label>
      )}
      {type !== "none" && (
        <button
          onClick={apply}
          className="w-full py-2 rounded-lg bg-blue-500/30 text-blue-200 text-[10px] hover:bg-blue-500/40"
        >
          Apply schedule
        </button>
      )}
      {summary && (
        <div className="text-[10px] text-white/50">
          {summary.startTime}–{summary.endTime} · every {summary.interval} min
          {busesNeeded ? ` · ~${busesNeeded} buses` : ""}
        </div>
      )}
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
