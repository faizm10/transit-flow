"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import {
  SimTrip,
  SimulationData,
  SimulationState,
  ShapeCache,
  ActiveVehicle,
  buildSimulationUrl,
  buildCustomSimulationTrips,
  buildShapeCache,
  getCustomRouteIdFromSelection,
  getActiveVehicles,
  nextSpeed,
} from "@/lib/simulation";
import { timeToSeconds, type CustomRoute } from "@/lib/gtfs";

const DEFAULT_ROUTES = ["KI", "LW", "LE", "BR", "ST", "RH", "MI"];
const DEFAULT_START_HOUR = 6; // 6 AM

function startHourToHHMM(hour: number): string {
  const h = Math.floor(hour) % 24;
  const m = Math.round((hour % 1) * 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function useSimulation(customRoutes: CustomRoute[] = []) {
  const [startHour, setStartHour] = useState<number>(DEFAULT_START_HOUR);

  const startSec = startHour * 3600;
  const endSec   = startSec + 43200; // always 12-hour window

  const [state, setState] = useState<SimulationState>({
    trips: [],
    currentTime: startSec,
    startTime: startSec,
    endTime: endSec,
    playing: false,
    speed: 10,
    loading: false,
    error: null,
  });

  const [selectedRoutes, setSelectedRoutes] = useState<string[]>(DEFAULT_ROUTES);
  const [date, setDate] = useState<string>(new Date().toISOString().split("T")[0]);

  // Pre-computed shape caches keyed by trip_id — built once when trips load
  const shapeCachesRef = useRef<Map<string, ShapeCache>>(new Map());

  // Tracks whether the user has ever clicked "Start simulation" this session
  const hasEverLoadedRef = useRef<boolean>(false);

  const rafRef = useRef<number | null>(null);
  const lastTimestampRef = useRef<number | null>(null);

  // ── Animation loop ─────────────────────────────────────────────────────────
  const tick = useCallback((timestamp: number) => {
    if (lastTimestampRef.current !== null) {
      const elapsed = (timestamp - lastTimestampRef.current) / 1000;
      setState((prev) => {
        const advance = elapsed * prev.speed;
        const next = prev.currentTime + advance;
        if (next >= prev.endTime) {
          return { ...prev, currentTime: prev.startTime, playing: false };
        }
        return { ...prev, currentTime: next };
      });
    }
    lastTimestampRef.current = timestamp;
    rafRef.current = requestAnimationFrame(tick);
  }, []);

  useEffect(() => {
    if (state.playing) {
      lastTimestampRef.current = null;
      rafRef.current = requestAnimationFrame(tick);
    } else {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      lastTimestampRef.current = null;
    }
  }, [state.playing, tick]);

  useEffect(() => {
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, []);

  // ── Controls ───────────────────────────────────────────────────────────────
  const togglePlay = useCallback(() => {
    setState((prev) => ({ ...prev, playing: !prev.playing, error: null }));
  }, []);

  const clearSimulation = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    shapeCachesRef.current.clear();
    hasEverLoadedRef.current = false;
    setState((prev) => ({
      ...prev,
      trips: [],
      playing: false,
      loading: false,
      error: null,
      currentTime: prev.startTime,
    }));
  }, []);

  const setCurrentTime = useCallback((t: number) => {
    setState((prev) => ({ ...prev, currentTime: t }));
  }, []);

  const cycleSpeed = useCallback(() => {
    setState((prev) => ({ ...prev, speed: nextSpeed(prev.speed) }));
  }, []);

  // ── Load simulation ────────────────────────────────────────────────────────
  const loadSimulation = useCallback(
    async (params?: { routes?: string[]; startHour?: number; date?: string }) => {
      const routes = params?.routes ?? selectedRoutes;
      const hour  = params?.startHour ?? startHour;
      const start = startHourToHHMM(hour);
      const d = params?.date ?? date;
      const customRouteIds = routes
        .map(getCustomRouteIdFromSelection)
        .filter((id): id is string => id !== null);
      const goRoutes = routes.filter((route) => getCustomRouteIdFromSelection(route) === null);

      hasEverLoadedRef.current = true;
      setState((prev) => ({ ...prev, loading: true, error: null, playing: false, trips: [] }));
      shapeCachesRef.current.clear();

      try {
        const customTrips = buildCustomSimulationTrips(customRoutes, customRouteIds, { start, date: d });
        const windowStart = hour * 3600;
        let data: SimulationData = {
          startSeconds: windowStart,
          endSeconds: windowStart + 43200,
          trips: [],
        };

        if (goRoutes.length > 0) {
          const url = buildSimulationUrl({ routes: goRoutes, start, date: d });
          const res = await fetch(url);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          data = await res.json();
        }
        const trips = [...data.trips, ...customTrips];

        // Pre-compute shape caches for all trips (done once, not per frame)
        const caches = new Map<string, ShapeCache>();
        for (const trip of trips) {
          if (trip.shape.length > 1) {
            caches.set(trip.trip_id, buildShapeCache(trip.shape));
          }
        }
        shapeCachesRef.current = caches;

        setState((prev) => ({
          ...prev,
          trips,
          startTime: data.startSeconds,
          endTime: data.endSeconds,
          currentTime: data.startSeconds,
          loading: false,
        }));
      } catch (err) {
        setState((prev) => ({
          ...prev,
          loading: false,
          error: err instanceof Error ? err.message : "Failed to load simulation",
        }));
      }
    },
    [selectedRoutes, startHour, date, customRoutes]
  );

  // ── Computed (called every render during animation) ────────────────────────
  const activeVehicles: ActiveVehicle[] = getActiveVehicles(
    state.trips,
    shapeCachesRef.current,
    state.currentTime
  );

  // ── Lookup a trip by id (for vehicle popup) ────────────────────────────────
  const getTripById = useCallback(
    (tripId: string): SimTrip | undefined => {
      return state.trips.find((t) => t.trip_id === tripId);
    },
    [state.trips]
  );

  return {
    ...state,
    selectedRoutes,
    date,
    startHour,
    hasEverLoaded: hasEverLoadedRef.current,
    activeVehicles,
    setSelectedRoutes,
    setDate,
    setStartHour,
    setCurrentTime,
    togglePlay,
    cycleSpeed,
    loadSimulation,
    clearSimulation,
    getTripById,
  };
}
