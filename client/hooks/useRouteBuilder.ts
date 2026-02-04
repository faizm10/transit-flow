"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  fetchDirections,
  type DirectionsProfile,
  type DirectionsResult,
} from "@/lib/mapboxDirections";

export const ROUTE_BUILDER_STORAGE_KEY = "route_builder_routes";
const STORAGE_ROUTES = ROUTE_BUILDER_STORAGE_KEY;
const STORAGE_CURRENT = "route_builder_current";
const DEFAULT_PROFILE: DirectionsProfile = "mapbox/driving";
const DEFAULT_COLOR = "#3b82f6";
const DEBOUNCE_MS = 400;

export const ROUTE_COLORS = [
  "#3b82f6", "#22c55e", "#f59e0b", "#ef4444", "#8b5cf6",
  "#06b6d4", "#ec4899", "#84cc16",
];

export type Stop = {
  id: string;
  name?: string;
  lng: number;
  lat: number;
  timepoint?: boolean;
};

export type ScheduleFrequency = {
  type: "frequency";
  dayConfigs: Partial<
    Record<
      DayKey,
      {
        enabled: boolean;
        startTime: string;
        endTime: string;
        intervalMinutes: number;
      }
    >
  >;
  // Legacy fields (kept for backward compatibility with old saved routes)
  startTime?: string;
  endTime?: string;
  intervalMinutes?: number;
  days?: "weekday" | "weekend" | "all";
};

export type ScheduleFixed = {
  type: "fixed";
  departures: string[];
};

export type Schedule = ScheduleFrequency | ScheduleFixed;
export type DayKey =
  | "sunday"
  | "monday"
  | "tuesday"
  | "wednesday"
  | "thursday"
  | "friday"
  | "saturday";

const DAY_KEYS: DayKey[] = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];

export type CustomRoute = {
  id: string;
  name: string;
  color: string;
  profile: DirectionsProfile;
  baseVariantId?: string;
  baseVariantLabel?: string;
  stops: Stop[];
  schedule?: Schedule;
  /** Route geometry from Mapbox Directions (required for simulation) */
  geometry?: GeoJSON.LineString;
  /** Trip duration in seconds (required for simulation timing) */
  durationSeconds?: number;
  /** Per-leg durations in seconds (stop i to stop i+1). Enables accurate segment timing. */
  legDurations?: number[];
};

export type GoVariantOption = {
  variantId: string;
  routeShortName: string;
  label: string;
};

export type GoVariantStop = {
  stop_id: string;
  stop_name: string;
  stop_lat: number | null;
  stop_lon: number | null;
  stop_sequence: number;
};

function generateId(): string {
  return `route-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function stopId(): string {
  return `stop-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function cloneStops(stops: Stop[]): Stop[] {
  return stops.map((stop) => ({
    ...stop,
    id: stopId(),
  }));
}

function goStopsToStops(
  goStops: GoVariantStop[]
): Stop[] {
  return goStops
    .filter((s) => s.stop_lat != null && s.stop_lon != null)
    .sort((a, b) => a.stop_sequence - b.stop_sequence)
    .map((s) => ({
      id: stopId(),
      name: s.stop_name,
      lng: s.stop_lon!,
      lat: s.stop_lat!,
      timepoint: false,
    }));
}

function loadRoutesFromStorage(): CustomRoute[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_ROUTES);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Array<unknown>;
    return (parsed || []).map((r) => normalizeCustomRoute(r));
  } catch {
    return [];
  }
}

function loadCurrentFromStorage(): CustomRoute | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_CURRENT);
    if (!raw) return null;
    return normalizeCustomRoute(JSON.parse(raw));
  } catch {
    return null;
  }
}

function normalizeCustomRoute(raw: unknown): CustomRoute {
  const r = raw as Record<string, unknown>;
  const stops = (Array.isArray(r?.stops) ? r.stops : []).map((s: unknown) => {
    const x = s as Record<string, unknown>;
    return {
      id: String(x?.id ?? stopId()),
      name: x?.name != null ? String(x.name) : undefined,
      lng: Number(x?.lng ?? 0),
      lat: Number(x?.lat ?? 0),
      timepoint: Boolean(x?.timepoint ?? false),
    } as Stop;
  });
  return {
    id: String(r?.id ?? generateId()),
    name: String(r?.name ?? "New Route"),
    color: String(r?.color ?? DEFAULT_COLOR),
    profile: (r?.profile === "mapbox/walking" || r?.profile === "mapbox/cycling")
      ? r.profile
      : DEFAULT_PROFILE,
    baseVariantId: r?.baseVariantId != null ? String(r.baseVariantId) : undefined,
    baseVariantLabel: r?.baseVariantLabel != null ? String(r.baseVariantLabel) : undefined,
    stops,
    schedule: r?.schedule as Schedule | undefined,
    geometry: (r?.geometry as GeoJSON.LineString | undefined) ?? undefined,
    durationSeconds: typeof r?.durationSeconds === "number" ? r.durationSeconds : undefined,
    legDurations: Array.isArray(r?.legDurations) ? r.legDurations.map(Number) : undefined,
  };
}

function saveRoutesToStorage(routes: CustomRoute[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_ROUTES, JSON.stringify(routes));
  } catch {
    // ignore
  }
}

function saveCurrentToStorage(current: CustomRoute | null): void {
  if (typeof window === "undefined") return;
  try {
    if (current) {
      localStorage.setItem(STORAGE_CURRENT, JSON.stringify(current));
    } else {
      localStorage.removeItem(STORAGE_CURRENT);
    }
  } catch {
    // ignore
  }
}

/** Load saved custom routes from localStorage (for use outside the hook, e.g. simulation) */
export function getSavedCustomRoutes(): CustomRoute[] {
  return loadRoutesFromStorage();
}

/** Build simulation trips from a custom route for the given time window */
export function buildSimulationTripsFromCustomRoute(
  customRoute: CustomRoute,
  startSeconds: number,
  endSeconds: number,
  serviceDateISO?: string,
): Array<{
  trip_id: string;
  route_short_name: string;
  route_long_name: string;
  route_type: string;
  direction_id: number;
  source: "custom";
  stops: Array<{ t: number; lat: number; lon: number; shapeIndex: number | null }>;
  shape: Array<{ lat: number; lon: number }>;
  start_stop_name: string;
  end_stop_name: string;
  start_time: number | null;
  end_time: number | null;
  color: string;
}> {
  const { name, color, stops: routeStops, geometry, durationSeconds, legDurations, schedule } =
    customRoute;
  if (!geometry?.coordinates?.length || !routeStops.length || !durationSeconds) return [];

  const shape = geometry.coordinates.map(([lon, lat]) => ({ lat, lon }));

  function findClosestShapeIndex(lat: number, lon: number): number {
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < shape.length; i++) {
      const p = shape[i];
      const d = (p.lat - lat) ** 2 + (p.lon - lon) ** 2;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return best;
  }

  const formatSecToTime = (sec: number) => {
    const h = Math.floor(sec / 3600) % 24;
    const m = Math.floor((sec % 3600) / 60);
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  };
  const departures: string[] = schedule
    ? expandSchedule(schedule, serviceDateISO)
    : [formatSecToTime(startSeconds)];

  function parseTimeToSec(s: string): number {
    const [h, m] = s.split(":").map(Number);
    return (h ?? 0) * 3600 + (m ?? 0) * 60;
  }

  const trips: ReturnType<typeof buildSimulationTripsFromCustomRoute> = [];

  for (const dep of departures) {
    const depSec = parseTimeToSec(dep);
    if (depSec < startSeconds || depSec > endSeconds) continue;

    const endSec = depSec + durationSeconds;
    const n = routeStops.length;
    const stopsWithTime = routeStops.map((stop, i) => {
      let t: number;
      if (n <= 1) {
        t = depSec;
      } else if (legDurations && legDurations.length >= 1) {
        t = depSec + legDurations.slice(0, i).reduce((a, b) => a + b, 0);
      } else {
        t = depSec + (durationSeconds * i) / (n - 1);
      }
      return {
        t,
        lat: stop.lat,
        lon: stop.lng,
        shapeIndex: findClosestShapeIndex(stop.lat, stop.lng),
      };
    });

    trips.push({
      trip_id: `custom-${customRoute.id}-${dep.replace(":", "")}`,
      route_short_name: name,
      route_long_name: name,
      route_type: "3",
      direction_id: 0,
      source: "custom",
      stops: stopsWithTime,
      shape,
      start_stop_name: routeStops[0]?.name ?? "Start",
      end_stop_name: routeStops[routeStops.length - 1]?.name ?? "End",
      start_time: depSec,
      end_time: endSec,
      color,
    });
  }

  return trips;
}

/** Generate list of departures from a schedule (date-aware for frequency schedules) */
export function expandSchedule(schedule: Schedule, serviceDateISO?: string): string[] {
  if (schedule.type === "fixed") return [...schedule.departures];

  const normalized = normalizeFrequencySchedule(schedule);
  const activeDayKey = getActiveDayKey(serviceDateISO);
  const dayConfig =
    normalized[activeDayKey] ?? Object.values(normalized).find((cfg) => cfg.enabled);
  if (!dayConfig || !dayConfig.enabled) return [];

  const { startTime, endTime, intervalMinutes } = dayConfig;
  const [sh, sm] = startTime.split(":").map(Number);
  const [eh, em] = endTime.split(":").map(Number);
  const startMins = sh * 60 + sm;
  const endMins = eh * 60 + em;
  const out: string[] = [];
  if (!Number.isFinite(intervalMinutes) || intervalMinutes <= 0) return out;
  for (let m = startMins; m <= endMins; m += intervalMinutes) {
    const h = Math.floor(m / 60) % 24;
    const min = m % 60;
    out.push(`${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`);
  }
  return out;
}

function getActiveDayKey(serviceDateISO?: string): DayKey {
  if (!serviceDateISO) return "monday";
  const date = new Date(`${serviceDateISO}T12:00:00`);
  if (Number.isNaN(date.getTime())) return "monday";
  const day = date.getDay();
  const map: DayKey[] = [
    "sunday",
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
  ];
  return map[day] ?? "monday";
}

function normalizeFrequencySchedule(
  schedule: ScheduleFrequency,
): Record<
  DayKey,
  { enabled: boolean; startTime: string; endTime: string; intervalMinutes: number }
> {
  const defaults = DAY_KEYS.reduce(
    (acc, day) => {
      acc[day] = {
        enabled: false,
        startTime: "06:00",
        endTime: "22:00",
        intervalMinutes: 30,
      };
      return acc;
    },
    {} as Record<
      DayKey,
      { enabled: boolean; startTime: string; endTime: string; intervalMinutes: number }
    >,
  );

  if (schedule.dayConfigs && Object.keys(schedule.dayConfigs).length > 0) {
    DAY_KEYS.forEach((day) => {
      const existing = schedule.dayConfigs?.[day];
      if (!existing) return;
      defaults[day] = {
        enabled: Boolean(existing.enabled),
        startTime: existing.startTime || "06:00",
        endTime: existing.endTime || "22:00",
        intervalMinutes: Number(existing.intervalMinutes || 30),
      };
    });
    return defaults;
  }

  const legacyStart = schedule.startTime || "06:00";
  const legacyEnd = schedule.endTime || "22:00";
  const legacyInterval = Number(schedule.intervalMinutes || 30);
  const legacyDays = schedule.days || "weekday";

  const enableDays = (days: DayKey[]) => {
    days.forEach((day) => {
      defaults[day] = {
        enabled: true,
        startTime: legacyStart,
        endTime: legacyEnd,
        intervalMinutes: legacyInterval,
      };
    });
  };

  if (legacyDays === "all") {
    enableDays(DAY_KEYS);
  } else if (legacyDays === "weekend") {
    enableDays(["saturday", "sunday"]);
  } else {
    enableDays(["monday", "tuesday", "wednesday", "thursday", "friday"]);
  }

  return defaults;
}

export function useRouteBuilder(goVariantStops: Record<string, GoVariantStop[]> | null) {
  const [routes, setRoutes] = useState<CustomRoute[]>(() => loadRoutesFromStorage());
  const [currentRoute, setCurrentRoute] = useState<CustomRoute | null>(() =>
    loadCurrentFromStorage()
  );

  const activeRoute = currentRoute ?? createEmptyRoute();
  const stops = activeRoute.stops;

  const [route, setRoute] = useState<DirectionsResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function createEmptyRoute(): CustomRoute {
    return {
      id: generateId(),
      name: "New Route",
      color: ROUTE_COLORS[routes.length % ROUTE_COLORS.length],
      profile: DEFAULT_PROFILE,
      stops: [],
    };
  }

  const persistCurrent = useCallback(() => {
    if (currentRoute) {
      saveCurrentToStorage(currentRoute);
    } else {
      saveCurrentToStorage(null);
    }
  }, [currentRoute]);

  const persistRoutes = useCallback(() => {
    saveRoutesToStorage(routes);
  }, [routes]);

  useEffect(() => {
    persistCurrent();
  }, [currentRoute, persistCurrent]);

  useEffect(() => {
    persistRoutes();
  }, [routes, persistRoutes]);

  const recompute = useCallback(() => {
    const token = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;
    if (!token) {
      setError("Mapbox token not configured");
      setRoute(null);
      return;
    }
    if (stops.length < 2) {
      setRoute(null);
      setError(null);
      return;
    }

    if (abortRef.current) abortRef.current.abort();
    abortRef.current = new AbortController();
    setLoading(true);
    setError(null);

    fetchDirections(
      stops.map((s) => ({ lng: s.lng, lat: s.lat })),
      activeRoute.profile,
      token,
      abortRef.current.signal
    )
      .then((result) => {
        if (result.ok) {
          setRoute(result.data);
          setCurrentRoute((prev) => {
            const base = prev ?? createEmptyRoute();
            return {
              ...base,
              geometry: result.data.geometry,
              durationSeconds: result.data.duration,
              legDurations: result.data.legDurations,
            };
          });
        } else {
          setRoute(null);
          setError(
            result.error.code === "NoRoute"
              ? "No route found for these stops — try adjusting them."
              : result.error.message
          );
        }
      })
      .catch((err) => {
        if (err?.name === "AbortError") return;
        setRoute(null);
        setError(err?.message ?? "Failed to fetch route");
      })
      .finally(() => {
        setLoading(false);
        abortRef.current = null;
      });
  }, [stops, activeRoute.profile]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (stops.length < 2) {
      if (route !== null || error !== null || loading) {
        setRoute(null);
        setError(null);
        setLoading(false);
      }
      return;
    }
    debounceRef.current = setTimeout(() => {
      debounceRef.current = null;
      recompute();
    }, DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [stops, activeRoute.profile, recompute, route, error, loading]);

  const updateCurrent = useCallback((updates: Partial<CustomRoute>) => {
    setCurrentRoute((prev) => {
      const base = prev ?? createEmptyRoute();
      return { ...base, ...updates };
    });
  }, []);

  const updateRouteById = useCallback(
    (id: string, updates: Partial<CustomRoute>) => {
      setRoutes((prev) => {
        const next = prev.map((r) => (r.id === id ? { ...r, ...updates } : r));
        saveRoutesToStorage(next);
        if (typeof window !== "undefined") {
          setTimeout(() => {
            window.dispatchEvent(
              new CustomEvent("route-builder-saved", { detail: { routeId: id } })
            );
          }, 0);
        }
        return next;
      });
      setCurrentRoute((prev) => (prev && prev.id === id ? { ...prev, ...updates } : prev));
    },
    []
  );

  const setStops = useCallback((newStops: Stop[]) => {
    updateCurrent({ stops: newStops });
  }, [updateCurrent]);

  const addStop = useCallback((lng: number, lat: number, name?: string) => {
    setStops([
      ...stops,
      { id: stopId(), name: name ?? `Stop ${stops.length + 1}`, lng, lat, timepoint: false },
    ]);
  }, [stops, setStops]);

  const updateStop = useCallback(
    (id: string, updates: Partial<Pick<Stop, "lng" | "lat" | "name" | "timepoint">>) => {
      setStops(
        stops.map((s) => (s.id === id ? { ...s, ...updates } : s))
      );
    },
    [stops, setStops]
  );

  const removeStop = useCallback(
    (id: string) => {
      setStops(stops.filter((s) => s.id !== id));
    },
    [stops, setStops]
  );

  const moveStop = useCallback(
    (id: string, direction: "up" | "down") => {
      const idx = stops.findIndex((s) => s.id === id);
      if (idx < 0) return;
      const swap = direction === "up" ? idx - 1 : idx + 1;
      if (swap < 0 || swap >= stops.length) return;
      const next = [...stops];
      [next[idx], next[swap]] = [next[swap], next[idx]];
      setStops(next);
    },
    [stops, setStops]
  );

  const loadFromGoVariant = useCallback(
    (variantId: string, label: string) => {
      const goStops = goVariantStops?.[variantId];
      if (!goStops || goStops.length === 0) return;
      const newStops = goStopsToStops(goStops);
      updateCurrent({
        stops: newStops,
        baseVariantId: variantId,
        baseVariantLabel: label,
      });
    },
    [goVariantStops, updateCurrent]
  );

  const clearBaseVariant = useCallback(() => {
    updateCurrent({ baseVariantId: undefined, baseVariantLabel: undefined });
  }, [updateCurrent]);

  const saveRoute = useCallback(() => {
    const toSave = currentRoute ?? createEmptyRoute();
    if (toSave.stops.length < 2) return;
    const enriched: CustomRoute = {
      ...toSave,
      geometry: route?.geometry ?? toSave.geometry,
      durationSeconds: route?.duration ?? toSave.durationSeconds,
      legDurations: route?.legDurations ?? toSave.legDurations,
    };
    const existing = routes.find((r) => r.id === enriched.id);
    const next = existing
      ? routes.map((r) => (r.id === enriched.id ? enriched : r))
      : [...routes, enriched];
    setRoutes(next);
    setCurrentRoute(null);
    saveCurrentToStorage(null);
    // Persist to localStorage before dispatching so listeners read fresh data
    saveRoutesToStorage(next);
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("route-builder-saved", { detail: { routeId: enriched.id } })
      );
    }
  }, [currentRoute, routes, route]);

  const saveReversedRoute = useCallback((base: CustomRoute) => {
    if (base.stops.length < 2) return;
    const reversed: CustomRoute = {
      ...base,
      id: generateId(),
      name: `${base.name} (Reverse)`,
      stops: cloneStops([...base.stops].reverse()),
      geometry: undefined,
      durationSeconds: undefined,
      legDurations: undefined,
    };
    setRoutes((prev) => {
      const next = [...prev, reversed];
      saveRoutesToStorage(next);
      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("route-builder-saved", { detail: { routeId: reversed.id } })
        );
      }
      return next;
    });
  }, []);

  const loadRoute = useCallback((r: CustomRoute) => {
    setCurrentRoute({ ...r });
  }, []);

  const deleteRoute = useCallback((id: string) => {
    const next = routes.filter((r) => r.id !== id);
    setRoutes(next);
    saveRoutesToStorage(next);
    if (typeof window !== "undefined") {
      setTimeout(() => {
        window.dispatchEvent(
          new CustomEvent("route-builder-deleted", { detail: { routeId: id } })
        );
      }, 0);
    }
    if (currentRoute?.id === id) {
      setCurrentRoute(null);
      setRoute(null);
    }
  }, [currentRoute?.id, routes]);

  const clearRoute = useCallback(() => {
    setCurrentRoute(createEmptyRoute());
    setRoute(null);
    setError(null);
    saveCurrentToStorage(null);
  }, []);

  const startNewRoute = useCallback(() => {
    setCurrentRoute(createEmptyRoute());
    setRoute(null);
    setError(null);
  }, []);

  return {
    routes,
    currentRoute,
    activeRoute,
    stops,
    profile: activeRoute.profile,
    setProfile: (p: DirectionsProfile) => updateCurrent({ profile: p }),
    route,
    loading,
    error,
    addStop,
    updateStop,
    removeStop,
    moveStop,
    setStops,
    updateCurrent,
    updateRouteById,
    loadFromGoVariant,
    clearBaseVariant,
    saveRoute,
    saveReversedRoute,
    loadRoute,
    deleteRoute,
    clearRoute,
    startNewRoute,
    recompute,
  };
}
