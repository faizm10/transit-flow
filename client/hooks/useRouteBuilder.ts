"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  fetchDirections,
  type DirectionsProfile,
  type DirectionsResult,
} from "@/lib/mapboxDirections";

const STORAGE_ROUTES = "route_builder_routes";
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
};

export type ScheduleFrequency = {
  type: "frequency";
  startTime: string;
  endTime: string;
  intervalMinutes: number;
  days: "weekday" | "weekend" | "all";
};

export type ScheduleFixed = {
  type: "fixed";
  departures: string[];
};

export type Schedule = ScheduleFrequency | ScheduleFixed;

export type CustomRoute = {
  id: string;
  name: string;
  color: string;
  profile: DirectionsProfile;
  baseVariantId?: string;
  baseVariantLabel?: string;
  stops: Stop[];
  schedule?: Schedule;
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

/** Generate list of departures from a frequency schedule */
export function expandSchedule(schedule: Schedule): string[] {
  if (schedule.type === "fixed") return [...schedule.departures];
  const { startTime, endTime, intervalMinutes } = schedule;
  const [sh, sm] = startTime.split(":").map(Number);
  const [eh, em] = endTime.split(":").map(Number);
  const startMins = sh * 60 + sm;
  const endMins = eh * 60 + em;
  const out: string[] = [];
  for (let m = startMins; m <= endMins; m += intervalMinutes) {
    const h = Math.floor(m / 60) % 24;
    const min = m % 60;
    out.push(`${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`);
  }
  return out;
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
      setRoute(null);
      setError(null);
      return;
    }
    debounceRef.current = setTimeout(() => {
      debounceRef.current = null;
      recompute();
    }, DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [stops, activeRoute.profile, recompute]);

  const updateCurrent = useCallback((updates: Partial<CustomRoute>) => {
    setCurrentRoute((prev) => {
      const base = prev ?? createEmptyRoute();
      return { ...base, ...updates };
    });
  }, []);

  const setStops = useCallback((newStops: Stop[]) => {
    updateCurrent({ stops: newStops });
  }, [updateCurrent]);

  const addStop = useCallback((lng: number, lat: number, name?: string) => {
    setStops([
      ...stops,
      { id: stopId(), name: name ?? `Stop ${stops.length + 1}`, lng, lat },
    ]);
  }, [stops, setStops]);

  const updateStop = useCallback(
    (id: string, updates: Partial<Pick<Stop, "lng" | "lat" | "name">>) => {
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
    const existing = routes.find((r) => r.id === toSave.id);
    const next = existing
      ? routes.map((r) => (r.id === toSave.id ? toSave : r))
      : [...routes, toSave];
    setRoutes(next);
    setCurrentRoute(null);
    saveCurrentToStorage(null);
  }, [currentRoute, routes]);

  const loadRoute = useCallback((r: CustomRoute) => {
    setCurrentRoute({ ...r });
  }, []);

  const deleteRoute = useCallback((id: string) => {
    setRoutes((prev) => prev.filter((r) => r.id !== id));
    if (currentRoute?.id === id) {
      setCurrentRoute(null);
      setRoute(null);
    }
  }, [currentRoute?.id]);

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
    loadFromGoVariant,
    clearBaseVariant,
    saveRoute,
    loadRoute,
    deleteRoute,
    clearRoute,
    startNewRoute,
    recompute,
  };
}
