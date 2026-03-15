"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  fetchDirections,
  type DirectionsProfile,
  type DirectionsResult,
} from "@/lib/mapboxDirections";
import {
  buildManualRailRoute,
  fetchRailRoute,
  type RailRouteResult,
  type RouteGeometrySource,
} from "@/lib/railNetwork";

export const ROUTE_BUILDER_STORAGE_KEY = "route_builder_routes";
const STORAGE_ROUTES = ROUTE_BUILDER_STORAGE_KEY;
export const ROUTE_BUILDER_CURRENT_KEY = "route_builder_current";
const STORAGE_CURRENT = ROUTE_BUILDER_CURRENT_KEY;
export const ROUTE_BUILDER_SCENARIOS_KEY = "route_builder_scenarios";
export const ROUTE_BUILDER_CURRENT_SCENARIO_KEY = "route_builder_current_scenario";
const DEFAULT_PROFILE: DirectionsProfile = "mapbox/driving";
const DEFAULT_COLOR = "#3b82f6";
const DEBOUNCE_MS = 400;
const DEFAULT_SCENARIO_ID = "scenario-default";

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

export type ScheduleDirection = ScheduleFrequency | ScheduleFixed;
export type ScheduleDirectionKey = "primary" | "opposite";
export type Schedule = {
  primary?: ScheduleDirection;
  opposite?: ScheduleDirection;
};
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

function isScheduleDirection(value: unknown): value is ScheduleDirection {
  if (!value || typeof value !== "object") return false;
  const schedule = value as Record<string, unknown>;
  if (schedule.type === "fixed") {
    return Array.isArray(schedule.departures);
  }
  if (schedule.type === "frequency") {
    return typeof schedule.dayConfigs === "object" || schedule.dayConfigs == null;
  }
  return false;
}

export function normalizeSchedule(schedule?: unknown): Schedule | undefined {
  if (!schedule || typeof schedule !== "object") return undefined;
  if (isScheduleDirection(schedule)) {
    return { primary: schedule };
  }

  const raw = schedule as Record<string, unknown>;
  const primary = isScheduleDirection(raw.primary) ? raw.primary : undefined;
  const opposite = isScheduleDirection(raw.opposite) ? raw.opposite : undefined;

  if (!primary && !opposite) return undefined;
  return { primary, opposite };
}

export function getScheduleDirection(
  schedule: Schedule | undefined,
  direction: ScheduleDirectionKey,
): ScheduleDirection | undefined {
  const normalized = normalizeSchedule(schedule);
  return direction === "primary" ? normalized?.primary : normalized?.opposite;
}

export function hasScheduleDirection(
  schedule: Schedule | undefined,
  direction: ScheduleDirectionKey,
): boolean {
  return Boolean(getScheduleDirection(schedule, direction));
}

export function scheduleDirections(
  schedule: Schedule | undefined,
): Partial<Record<ScheduleDirectionKey, ScheduleDirection>> {
  const normalized = normalizeSchedule(schedule);
  return normalized ?? {};
}

export type CustomRoute = {
  id: string;
  name: string;
  color: string;
  mode: "bus" | "train";
  profile: DirectionsProfile;
  baseVariantId?: string;
  baseVariantLabel?: string;
  stops: Stop[];
  schedule?: Schedule;
  /** Route geometry from Mapbox Directions (required for simulation) */
  geometry?: GeoJSON.LineString;
  geometrySource?: RouteGeometrySource;
  /** Trip duration in seconds (required for simulation timing) */
  durationSeconds?: number;
  /** Per-leg durations in seconds (stop i to stop i+1). Enables accurate segment timing. */
  legDurations?: number[];
};

export function supportsBidirectionalSchedule(route: CustomRoute | null | undefined): boolean {
  return !route?.baseVariantId;
}

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

export type RouteScenario = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
};

function generateId(): string {
  return `route-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function stopId(): string {
  return `stop-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function scenarioRoutesKey(id: string): string {
  return `${STORAGE_ROUTES}:${id}`;
}

function scenarioCurrentKey(id: string): string {
  return `${STORAGE_CURRENT}:${id}`;
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

function defaultScenario(): RouteScenario {
  const now = new Date().toISOString();
  return {
    id: DEFAULT_SCENARIO_ID,
    name: "Base Scenario",
    createdAt: now,
    updatedAt: now,
  };
}

function loadScenariosFromStorage(): RouteScenario[] {
  if (typeof window === "undefined") return [defaultScenario()];
  try {
    const raw = localStorage.getItem(ROUTE_BUILDER_SCENARIOS_KEY);
    if (!raw) return [defaultScenario()];
    const parsed = JSON.parse(raw) as RouteScenario[];
    if (!Array.isArray(parsed) || parsed.length === 0) return [defaultScenario()];
    return parsed;
  } catch {
    return [defaultScenario()];
  }
}

function saveScenariosToStorage(scenarios: RouteScenario[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(ROUTE_BUILDER_SCENARIOS_KEY, JSON.stringify(scenarios));
  } catch {
    // ignore
  }
}

function ensureScenarioStorage(): RouteScenario[] {
  if (typeof window === "undefined") return [defaultScenario()];

  const scenarios = loadScenariosFromStorage();
  const currentScenarioId =
    localStorage.getItem(ROUTE_BUILDER_CURRENT_SCENARIO_KEY) ?? scenarios[0]?.id ?? DEFAULT_SCENARIO_ID;
  const currentScenario =
    scenarios.find((scenario) => scenario.id === currentScenarioId) ?? scenarios[0] ?? defaultScenario();
  const scenarioRoutesStorageKey = scenarioRoutesKey(currentScenario.id);
  const scenarioCurrentStorageKey = scenarioCurrentKey(currentScenario.id);

  if (!localStorage.getItem(scenarioRoutesStorageKey)) {
    const legacyRoutes = localStorage.getItem(STORAGE_ROUTES);
    if (legacyRoutes) {
      localStorage.setItem(scenarioRoutesStorageKey, legacyRoutes);
    } else {
      localStorage.setItem(scenarioRoutesStorageKey, "[]");
    }
  }

  if (!localStorage.getItem(scenarioCurrentStorageKey)) {
    const legacyCurrent = localStorage.getItem(STORAGE_CURRENT);
    if (legacyCurrent) {
      localStorage.setItem(scenarioCurrentStorageKey, legacyCurrent);
    }
  }

  saveScenariosToStorage(scenarios);
  localStorage.setItem(ROUTE_BUILDER_CURRENT_SCENARIO_KEY, currentScenario.id);
  return scenarios;
}

export function getSavedScenarios(): RouteScenario[] {
  return ensureScenarioStorage();
}

export function getCurrentScenarioId(): string {
  if (typeof window === "undefined") return DEFAULT_SCENARIO_ID;
  ensureScenarioStorage();
  return localStorage.getItem(ROUTE_BUILDER_CURRENT_SCENARIO_KEY) ?? DEFAULT_SCENARIO_ID;
}

export function setCurrentScenarioId(id: string): void {
  if (typeof window === "undefined") return;
  const scenarios = ensureScenarioStorage();
  const exists = scenarios.some((scenario) => scenario.id === id);
  if (!exists) return;
  localStorage.setItem(ROUTE_BUILDER_CURRENT_SCENARIO_KEY, id);
  window.dispatchEvent(new CustomEvent("route-builder-scenario-changed", { detail: { scenarioId: id } }));
}

export function createScenario(name: string, sourceScenarioId?: string): RouteScenario {
  const scenarios = ensureScenarioStorage();
  const id = `scenario-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const now = new Date().toISOString();
  const scenario: RouteScenario = {
    id,
    name: name.trim() || `Scenario ${scenarios.length + 1}`,
    createdAt: now,
    updatedAt: now,
  };
  const sourceId = sourceScenarioId ?? getCurrentScenarioId();
  const sourceRoutes = loadRoutesFromStorage(sourceId);
  const sourceCurrent = loadCurrentFromStorage(sourceId);

  if (typeof window !== "undefined") {
    localStorage.setItem(scenarioRoutesKey(id), JSON.stringify(sourceRoutes));
    if (sourceCurrent) {
      localStorage.setItem(scenarioCurrentKey(id), JSON.stringify(sourceCurrent));
    } else {
      localStorage.removeItem(scenarioCurrentKey(id));
    }
  }

  const next = [...scenarios, scenario];
  saveScenariosToStorage(next);
  setCurrentScenarioId(id);
  return scenario;
}

export function renameScenario(id: string, name: string): void {
  const scenarios = ensureScenarioStorage();
  const next = scenarios.map((scenario) =>
    scenario.id === id
      ? { ...scenario, name: name.trim() || scenario.name, updatedAt: new Date().toISOString() }
      : scenario,
  );
  saveScenariosToStorage(next);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("route-builder-scenario-updated", { detail: { scenarioId: id } }));
  }
}

export function deleteScenario(id: string): void {
  if (typeof window === "undefined") return;
  const scenarios = ensureScenarioStorage();
  if (scenarios.length <= 1) return;
  const next = scenarios.filter((scenario) => scenario.id !== id);
  saveScenariosToStorage(next);
  localStorage.removeItem(scenarioRoutesKey(id));
  localStorage.removeItem(scenarioCurrentKey(id));
  if (getCurrentScenarioId() === id) {
    setCurrentScenarioId(next[0]?.id ?? DEFAULT_SCENARIO_ID);
  } else {
    window.dispatchEvent(new CustomEvent("route-builder-scenario-updated", { detail: { scenarioId: id } }));
  }
}

export function getScenarioRoutes(scenarioId: string): CustomRoute[] {
  return loadRoutesFromStorage(scenarioId);
}

function loadRoutesFromStorage(scenarioId = getCurrentScenarioId()): CustomRoute[] {
  if (typeof window === "undefined") return [];
  try {
    ensureScenarioStorage();
    const raw = localStorage.getItem(scenarioRoutesKey(scenarioId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Array<unknown>;
    return (parsed || []).map((r) => normalizeCustomRoute(r));
  } catch {
    return [];
  }
}

function loadCurrentFromStorage(scenarioId = getCurrentScenarioId()): CustomRoute | null {
  if (typeof window === "undefined") return null;
  try {
    ensureScenarioStorage();
    const raw = localStorage.getItem(scenarioCurrentKey(scenarioId));
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
    mode: r?.mode === "train" ? "train" : "bus",
    profile: (r?.profile === "mapbox/walking" || r?.profile === "mapbox/cycling")
      ? r.profile
      : DEFAULT_PROFILE,
    baseVariantId: r?.baseVariantId != null ? String(r.baseVariantId) : undefined,
    baseVariantLabel: r?.baseVariantLabel != null ? String(r.baseVariantLabel) : undefined,
    stops,
    schedule: normalizeSchedule(r?.schedule),
    geometry: (r?.geometry as GeoJSON.LineString | undefined) ?? undefined,
    geometrySource:
      r?.geometrySource === "rail-network" || r?.geometrySource === "manual-rail"
        ? r.geometrySource
        : (r?.mode === "train" ? "rail-network" : "road"),
    durationSeconds: typeof r?.durationSeconds === "number" ? r.durationSeconds : undefined,
    legDurations: Array.isArray(r?.legDurations) ? r.legDurations.map(Number) : undefined,
  };
}

function geometryDistanceMeters(geometry: GeoJSON.LineString | undefined): number {
  const coords = geometry?.coordinates;
  if (!coords || coords.length < 2) return 0;
  let distance = 0;
  for (let index = 0; index < coords.length - 1; index += 1) {
    const [lngA, latA] = coords[index];
    const [lngB, latB] = coords[index + 1];
    const dLat = ((latB - latA) * Math.PI) / 180;
    const dLng = ((lngB - lngA) * Math.PI) / 180;
    const startLat = (latA * Math.PI) / 180;
    const endLat = (latB * Math.PI) / 180;
    const h =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(startLat) * Math.cos(endLat) * Math.sin(dLng / 2) ** 2;
    distance += 6371000 * 2 * Math.asin(Math.sqrt(h));
  }
  return distance;
}

function getComputedGeometrySource(
  value: DirectionsResult | RailRouteResult | null,
): RouteGeometrySource | undefined {
  if (value && "geometrySource" in value) {
    return value.geometrySource;
  }
  return undefined;
}

function saveRoutesToStorage(routes: CustomRoute[], scenarioId = getCurrentScenarioId()): void {
  if (typeof window === "undefined") return;
  try {
    ensureScenarioStorage();
    localStorage.setItem(scenarioRoutesKey(scenarioId), JSON.stringify(routes));
  } catch {
    // ignore
  }
}

function saveCurrentToStorage(current: CustomRoute | null, scenarioId = getCurrentScenarioId()): void {
  if (typeof window === "undefined") return;
  try {
    ensureScenarioStorage();
    if (current) {
      localStorage.setItem(scenarioCurrentKey(scenarioId), JSON.stringify(current));
    } else {
      localStorage.removeItem(scenarioCurrentKey(scenarioId));
    }
  } catch {
    // ignore
  }
}

/** Load saved custom routes from localStorage (for use outside the hook, e.g. simulation) */
export function getSavedCustomRoutes(): CustomRoute[] {
  return loadRoutesFromStorage();
}

export function saveCustomRoutes(routes: CustomRoute[], scenarioId?: string): void {
  saveRoutesToStorage(routes, scenarioId);
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

  const formatSecToTime = (sec: number) => {
    const h = Math.floor(sec / 3600) % 24;
    const m = Math.floor((sec % 3600) / 60);
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  };
  function parseTimeToSec(s: string): number {
    const [h, m] = s.split(":").map(Number);
    return (h ?? 0) * 3600 + (m ?? 0) * 60;
  }

  const trips: ReturnType<typeof buildSimulationTripsFromCustomRoute> = [];
  const canUseOppositeDirection = supportsBidirectionalSchedule(customRoute);

  const directions: Array<{
    key: ScheduleDirectionKey;
    directionId: number;
    shapePoints: typeof shape;
    stopsSource: typeof routeStops;
    fallbackDeparture: string[] | null;
  }> = ([
    {
      key: "primary" as const,
      directionId: 0,
      shapePoints: shape,
      stopsSource: routeStops,
      fallbackDeparture: schedule ? null : [formatSecToTime(startSeconds)],
    },
    {
      key: "opposite" as const,
      directionId: 1,
      shapePoints: [...shape].reverse(),
      stopsSource: [...routeStops].reverse(),
      fallbackDeparture: null,
    },
  ] satisfies Array<{
    key: ScheduleDirectionKey;
    directionId: number;
    shapePoints: typeof shape;
    stopsSource: typeof routeStops;
    fallbackDeparture: string[] | null;
  }>).filter((direction) => canUseOppositeDirection || direction.key === "primary");

  directions.forEach(({ key, directionId, shapePoints, stopsSource, fallbackDeparture }) => {
    const departures =
      fallbackDeparture ?? (schedule ? expandSchedule(schedule, key, serviceDateISO) : []);
    if (stopsSource.length === 0) return;

    for (const dep of departures) {
      const depSec = parseTimeToSec(dep);
      if (depSec < startSeconds || depSec > endSeconds) continue;

      const endSec = depSec + durationSeconds;
      const n = stopsSource.length;
      const stopsWithTime = stopsSource.map((stop, i) => {
        let t: number;
        if (n <= 1) {
          t = depSec;
        } else if (legDurations && legDurations.length >= 1) {
          const orderedLegs = directionId === 1 ? [...legDurations].reverse() : legDurations;
          t = depSec + orderedLegs.slice(0, i).reduce((a, b) => a + b, 0);
        } else {
          t = depSec + (durationSeconds * i) / (n - 1);
        }
        return {
          t,
          lat: stop.lat,
          lon: stop.lng,
          shapeIndex: (() => {
            let best = 0;
            let bestD = Infinity;
            for (let index = 0; index < shapePoints.length; index += 1) {
              const point = shapePoints[index];
              const d = (point.lat - stop.lat) ** 2 + (point.lon - stop.lng) ** 2;
              if (d < bestD) {
                bestD = d;
                best = index;
              }
            }
            return best;
          })(),
        };
      });

      trips.push({
        trip_id: `custom-${customRoute.id}-${directionId}-${dep.replace(":", "")}`,
        route_short_name: name,
        route_long_name: name,
        route_type: customRoute.mode === "train" ? "2" : "3",
        direction_id: directionId,
        source: "custom",
        stops: stopsWithTime,
        shape: shapePoints,
        start_stop_name: stopsSource[0]?.name ?? "Start",
        end_stop_name: stopsSource[stopsSource.length - 1]?.name ?? "End",
        start_time: depSec,
        end_time: endSec,
        color,
      });
    }
  });

  return trips;
}

/** Generate list of departures from a schedule (date-aware for frequency schedules) */
export function expandSchedule(
  schedule: Schedule,
  direction: ScheduleDirectionKey = "primary",
  serviceDateISO?: string,
): string[] {
  const directionSchedule = getScheduleDirection(schedule, direction);
  if (!directionSchedule) return [];
  if (directionSchedule.type === "fixed") return [...directionSchedule.departures];

  const normalized = normalizeFrequencySchedule(directionSchedule);
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
  const [scenarioId, setScenarioIdState] = useState<string>(() => getCurrentScenarioId());
  const [routes, setRoutes] = useState<CustomRoute[]>(() => loadRoutesFromStorage());
  const [currentRoute, setCurrentRoute] = useState<CustomRoute | null>(() => {
    const storedCurrent = loadCurrentFromStorage();
    if (storedCurrent) return storedCurrent;

    // If no current route is stored, try to load the first saved route
    const savedRoutes = loadRoutesFromStorage();
    if (savedRoutes.length > 0) {
      return savedRoutes[0];
    }

    return null; // Otherwise, start with no current route (will use emptyRoute)
  });

  const emptyRoute = useMemo<CustomRoute>(() => ({
    id: generateId(),
    name: "New Route",
    color: ROUTE_COLORS[routes.length % ROUTE_COLORS.length],
    mode: "bus",
    profile: DEFAULT_PROFILE,
    stops: [],
  }), [routes.length]);

  const activeRoute = currentRoute ?? emptyRoute;
  const stops = activeRoute.stops;

  const [route, setRoute] = useState<(DirectionsResult | RailRouteResult) | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastAutoNameRef = useRef<string | null>(null);

  const createEmptyRoute = useCallback((): CustomRoute => {
    return {
      id: generateId(),
      name: "New Route",
      color: ROUTE_COLORS[routes.length % ROUTE_COLORS.length],
      mode: "bus",
      profile: DEFAULT_PROFILE,
      stops: [],
    };
  }, [routes.length]);

  const clearDerivedGeometry = useCallback((draft: CustomRoute): CustomRoute => ({
    ...draft,
    geometry: undefined,
    geometrySource: undefined,
    durationSeconds: undefined,
    legDurations: undefined,
  }), []);

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
  }, [currentRoute, persistCurrent, scenarioId]);

  useEffect(() => {
    persistRoutes();
  }, [routes, persistRoutes, scenarioId]);

  useEffect(() => {
    const handleScenarioChange = (event: Event) => {
      const detail = (event as CustomEvent<{ scenarioId?: string }>).detail;
      const nextScenarioId = detail?.scenarioId ?? getCurrentScenarioId();
      setScenarioIdState(nextScenarioId);
      setRoutes(loadRoutesFromStorage(nextScenarioId));
      setCurrentRoute(loadCurrentFromStorage(nextScenarioId));
      setRoute(null);
      setError(null);
      setLoading(false);
    };
    const handleScenarioUpdated = () => {
      setScenarioIdState(getCurrentScenarioId());
    };
    window.addEventListener("route-builder-scenario-changed", handleScenarioChange);
    window.addEventListener("route-builder-scenario-updated", handleScenarioUpdated);
    return () => {
      window.removeEventListener("route-builder-scenario-changed", handleScenarioChange);
      window.removeEventListener("route-builder-scenario-updated", handleScenarioUpdated);
    };
  }, []);

  const recompute = useCallback(() => {
    if (stops.length < 2) {
      setRoute(null);
      setError(null);
      return;
    }

    if (
      activeRoute.mode === "train" &&
      activeRoute.geometrySource === "manual-rail" &&
      activeRoute.geometry?.coordinates?.length &&
      activeRoute.durationSeconds
    ) {
      setRoute({
        geometry: activeRoute.geometry,
        distance: geometryDistanceMeters(activeRoute.geometry),
        duration: activeRoute.durationSeconds,
        legDurations: activeRoute.legDurations ?? [activeRoute.durationSeconds],
        geometrySource: "manual-rail",
      });
      setError(null);
      setLoading(false);
      return;
    }

    if (abortRef.current) abortRef.current.abort();
    abortRef.current = new AbortController();
    setLoading(true);
    setError(null);

    const request =
      activeRoute.mode === "train"
        ? fetchRailRoute(stops, abortRef.current.signal)
        : (() => {
            const token = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;
            if (!token) {
              return Promise.resolve({
                ok: false as const,
                error: { code: "TokenError", message: "Mapbox token not configured" },
              });
            }
            return fetchDirections(
              stops.map((s) => ({ lng: s.lng, lat: s.lat })),
              activeRoute.profile,
              token,
              abortRef.current.signal
            );
          })();

    request
      .then((result) => {
        if (result.ok) {
          setRoute(result.data);
          setCurrentRoute((prev) => {
            const base = prev ?? createEmptyRoute();
            return {
              ...base,
              geometry: result.data.geometry,
              geometrySource:
                "geometrySource" in result.data ? result.data.geometrySource : "road",
              durationSeconds: result.data.duration,
              legDurations: result.data.legDurations,
            };
          });
        } else {
          setRoute(null);
          setError(
            "code" in result.error && result.error.code === "NoRoute"
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
  }, [
    stops,
    activeRoute.mode,
    activeRoute.profile,
    activeRoute.geometry,
    activeRoute.geometrySource,
    activeRoute.durationSeconds,
    activeRoute.legDurations,
    createEmptyRoute,
  ]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (stops.length < 2) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setRoute(null);
      setError(null);
      setLoading(false);
      return;
    }
    debounceRef.current = setTimeout(() => {
      debounceRef.current = null;
      recompute();
    }, DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [stops, activeRoute.profile, activeRoute.mode, activeRoute.geometrySource, recompute]);

  const updateCurrent = useCallback((updates: Partial<CustomRoute>) => {
    setCurrentRoute((prev) => {
      const base = prev ?? createEmptyRoute();
      return { ...base, ...updates };
    });
  }, [createEmptyRoute]);

  useEffect(() => {
    if (stops.length < 2) return;
    const startName = stops[0]?.name ?? "Start";
    const endName = stops[stops.length - 1]?.name ?? "End";
    const autoName = `${startName} → ${endName}`;
    const currentName = activeRoute.name || "New Route";
    const shouldUpdate =
      currentName === "New Route" || currentName === lastAutoNameRef.current;
    if (!shouldUpdate || currentName === autoName) return;
    lastAutoNameRef.current = autoName;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    updateCurrent({ name: autoName });
  }, [stops, activeRoute.name, updateCurrent]);

  const updateRouteById = useCallback(
    (id: string, updates: Partial<CustomRoute>) => {
      setRoutes((prev) => {
        const next = prev.map((r) => (r.id === id ? { ...r, ...updates } : r));
        saveRoutesToStorage(next, scenarioId);
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
    [scenarioId]
  );

  const setStops = useCallback((newStops: Stop[]) => {
    setCurrentRoute((prev) => {
      const base = prev ?? createEmptyRoute();
      return clearDerivedGeometry({ ...base, stops: newStops });
    });
  }, [clearDerivedGeometry, createEmptyRoute]);

  const addStop = useCallback((lng: number, lat: number, name?: string) => {
    setCurrentRoute((prev) => {
      const base = prev ?? createEmptyRoute();
      const prevStops = base.stops;
      return clearDerivedGeometry({
        ...base,
        stops: [
          ...prevStops,
          { id: stopId(), name: name ?? `Stop ${prevStops.length + 1}`, lng, lat, timepoint: false },
        ],
      });
    });
  }, [clearDerivedGeometry, createEmptyRoute]);

  const updateStop = useCallback(
    (id: string, updates: Partial<Pick<Stop, "lng" | "lat" | "name" | "timepoint">>) => {
      setCurrentRoute((prev) => {
        const base = prev ?? createEmptyRoute();
        return clearDerivedGeometry({
          ...base,
          stops: base.stops.map((s) => (s.id === id ? { ...s, ...updates } : s)),
        });
      });
    },
    [clearDerivedGeometry, createEmptyRoute]
  );

  const removeStop = useCallback(
    (id: string) => {
      setCurrentRoute((prev) => {
        const base = prev ?? createEmptyRoute();
        return clearDerivedGeometry({
          ...base,
          stops: base.stops.filter((s) => s.id !== id),
        });
      });
    },
    [clearDerivedGeometry, createEmptyRoute]
  );

  const moveStop = useCallback(
    (id: string, direction: "up" | "down") => {
      setCurrentRoute((prev) => {
        const base = prev ?? createEmptyRoute();
        const prevStops = base.stops;
        const idx = prevStops.findIndex((s) => s.id === id);
        if (idx < 0) return base;
        const swap = direction === "up" ? idx - 1 : idx + 1;
        if (swap < 0 || swap >= prevStops.length) return base;
        const next = [...prevStops];
        [next[idx], next[swap]] = [next[swap], next[idx]];
        return clearDerivedGeometry({ ...base, stops: next });
      });
    },
    [clearDerivedGeometry, createEmptyRoute]
  );

  const loadFromGoVariant = useCallback(
    (variantId: string, label: string, mode?: "bus" | "train") => {
      const goStops = goVariantStops?.[variantId];
      if (!goStops || goStops.length === 0) return;
      const newStops = goStopsToStops(goStops);
      setCurrentRoute((prev) => {
        const base = prev ?? createEmptyRoute();
        return clearDerivedGeometry({
          ...base,
          name: label,
          stops: newStops,
          mode: mode ?? base.mode,
          baseVariantId: variantId,
          baseVariantLabel: label,
          schedule: undefined,
        });
      });
    },
    [clearDerivedGeometry, createEmptyRoute, goVariantStops]
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
      geometrySource: getComputedGeometrySource(route) ?? toSave.geometrySource,
      durationSeconds: route?.duration ?? toSave.durationSeconds,
      legDurations: route?.legDurations ?? toSave.legDurations,
    };
    const existing = routes.find((r) => r.id === enriched.id);
    const next = existing
      ? routes.map((r) => (r.id === enriched.id ? enriched : r))
      : [...routes, enriched];
    setRoutes(next);
    setCurrentRoute(null);
    saveCurrentToStorage(null, scenarioId);
    // Persist to localStorage before dispatching so listeners read fresh data
    saveRoutesToStorage(next, scenarioId);
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("route-builder-saved", { detail: { routeId: enriched.id } })
      );
    }
  }, [currentRoute, routes, route, createEmptyRoute, scenarioId]);

  const saveReversedRoute = useCallback((base: CustomRoute) => {
    if (base.stops.length < 2) return;
    const reversed: CustomRoute = {
      ...base,
      id: generateId(),
      name: `${base.name} (Reverse)`,
      stops: cloneStops([...base.stops].reverse()),
      geometry: undefined,
      geometrySource: undefined,
      durationSeconds: undefined,
      legDurations: undefined,
    };
    setRoutes((prev) => {
      const next = [...prev, reversed];
      saveRoutesToStorage(next, scenarioId);
      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("route-builder-saved", { detail: { routeId: reversed.id } })
        );
      }
      return next;
    });
  }, [scenarioId]);

  const loadRoute = useCallback((r: CustomRoute) => {
    setCurrentRoute({ ...r });
    if (r.geometry?.coordinates?.length && r.durationSeconds) {
      const baseResult = {
        geometry: r.geometry,
        distance: geometryDistanceMeters(r.geometry),
        duration: r.durationSeconds,
        legDurations: r.legDurations ?? [r.durationSeconds],
      };
      setRoute(
        r.mode === "train"
          ? {
              ...baseResult,
              geometrySource:
                r.geometrySource === "manual-rail" ? "manual-rail" : "rail-network",
            }
          : baseResult
      );
      setError(null);
    } else {
      setRoute(null);
    }
  }, []);

  const deleteRoute = useCallback((id: string) => {
    const next = routes.filter((r) => r.id !== id);
    setRoutes(next);
    saveRoutesToStorage(next, scenarioId);
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
  }, [currentRoute?.id, routes, scenarioId]);

  const clearRoute = useCallback(() => {
    setCurrentRoute(createEmptyRoute());
    setRoute(null);
    setError(null);
    saveCurrentToStorage(null, scenarioId);
  }, [createEmptyRoute, scenarioId]);

  const startNewRoute = useCallback(() => {
    setCurrentRoute(createEmptyRoute());
    setRoute(null);
    setError(null);
  }, [createEmptyRoute]);

  return {
    routes,
    scenarioId,
    currentRoute,
    activeRoute,
    stops,
    profile: activeRoute.profile,
    mode: activeRoute.mode,
    geometrySource: activeRoute.geometrySource,
    setMode: (mode: "bus" | "train") =>
      setCurrentRoute((prev) => {
        const base = prev ?? createEmptyRoute();
        return clearDerivedGeometry({ ...base, mode });
      }),
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
    applyManualGeometry: (geometry: GeoJSON.LineString) => {
      const result = buildManualRailRoute(stops, geometry);
      setRoute(result);
      setCurrentRoute((prev) => {
        const base = prev ?? createEmptyRoute();
        return {
          ...base,
          mode: "train",
          geometry: result.geometry,
          geometrySource: result.geometrySource,
          durationSeconds: result.duration,
          legDurations: result.legDurations,
        };
      });
      setError(null);
      setLoading(false);
    },
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
