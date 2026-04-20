import {
  defaultBandedSchedule,
  migrateLegacySchedule,
  secondsToDisplayTime,
  timeToSeconds,
  type CustomRoute,
  type CustomTimetableTrip,
  type DaySchedule,
  type ServiceBand,
} from "./gtfs";

export const CUSTOM_ROUTE_SELECTION_PREFIX = "custom:";

export function customRouteSelectionId(routeId: string): string {
  return `${CUSTOM_ROUTE_SELECTION_PREFIX}${routeId}`;
}

export function getCustomRouteIdFromSelection(selection: string): string | null {
  return selection.startsWith(CUSTOM_ROUTE_SELECTION_PREFIX)
    ? selection.slice(CUSTOM_ROUTE_SELECTION_PREFIX.length)
    : null;
}

export interface SimStop {
  t: number;          // seconds since midnight when vehicle is at this stop
  lat: number;
  lon: number;
  shapeFrac: number;  // 0-1 fraction along the shape polyline
  stop_name?: string;
}

export interface SimTrip {
  trip_id: string;
  route_short_name: string;
  route_long_name: string;
  route_type: number;
  color: string;
  source: "gotransit" | "custom";
  stops: SimStop[];
  shape: [number, number][]; // [lon, lat]
  start_stop_name: string;
  end_stop_name: string;
  /** Estimated departure time in HH:MM */
  start_time: string;
  /** Estimated arrival time in HH:MM */
  end_time: string;
  /** Departure in seconds since midnight */
  departSec: number;
  /** Arrival in seconds since midnight */
  arriveSec: number;
}

export interface SimulationData {
  startSeconds: number;
  endSeconds: number;
  trips: SimTrip[];
}

export interface SimulationState {
  trips: SimTrip[];
  currentTime: number;
  startTime: number;
  endTime: number;
  playing: boolean;
  speed: 1 | 10 | 60;
  loading: boolean;
  error: string | null;
}

// Pre-computed shape cache — built once per unique shape to avoid per-frame re-computation
export interface ShapeCache {
  cumDists: number[];
  total: number;
}

export function buildShapeCache(shape: [number, number][]): ShapeCache {
  const cumDists = [0];
  for (let i = 1; i < shape.length; i++) {
    const dx = shape[i][0] - shape[i - 1][0];
    const dy = shape[i][1] - shape[i - 1][1];
    cumDists.push(cumDists[i - 1] + Math.sqrt(dx * dx + dy * dy));
  }
  return { cumDists, total: cumDists[cumDists.length - 1] };
}

/** Get [lon, lat] position at fraction f (0–1) along a shape using pre-computed cache */
export function positionAtFrac(
  shape: [number, number][],
  cache: ShapeCache,
  f: number
): [number, number] {
  if (!shape.length) return [0, 0];
  if (f <= 0) return shape[0];
  if (f >= 1) return shape[shape.length - 1];

  const targetDist = f * cache.total;
  for (let i = 1; i < shape.length; i++) {
    if (cache.cumDists[i] >= targetDist) {
      const segLen = cache.cumDists[i] - cache.cumDists[i - 1];
      const segRatio = segLen > 0 ? (targetDist - cache.cumDists[i - 1]) / segLen : 0;
      return [
        shape[i - 1][0] + (shape[i][0] - shape[i - 1][0]) * segRatio,
        shape[i - 1][1] + (shape[i][1] - shape[i - 1][1]) * segRatio,
      ];
    }
  }
  return shape[shape.length - 1];
}

export const SPEED_OPTIONS: (1 | 10 | 60)[] = [1, 10, 60];

export function nextSpeed(current: 1 | 10 | 60): 1 | 10 | 60 {
  const idx = SPEED_OPTIONS.indexOf(current);
  return SPEED_OPTIONS[(idx + 1) % SPEED_OPTIONS.length];
}

export function buildSimulationUrl(params: {
  routes: string[];
  start: string;
  end: string;
  date?: string;
}): string {
  const p = new URLSearchParams({
    routes: params.routes.join(","),
    start: params.start,
    end: params.end,
    date: params.date ?? new Date().toISOString().split("T")[0],
  });
  return `/api/simulation?${p.toString()}`;
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function toHHMM(sec: number): string {
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function simulationScheduleForRoute(route: CustomRoute) {
  const schedule = migrateLegacySchedule(route.schedule ?? defaultBandedSchedule());
  if (route.schedule || schedule.type === "fixed") return schedule;

  return {
    ...schedule,
    sunday: {
      active: true,
      bands: schedule.saturday?.bands ?? schedule.weekday?.bands ?? [],
    },
  };
}

function dayScheduleForDate(route: CustomRoute, date: string): DaySchedule | null {
  const schedule = simulationScheduleForRoute(route);
  if (schedule.type === "fixed" || schedule.type === "timetable") return null;

  const day = new Date(`${date}T12:00:00`).getDay();
  if (day === 0) return schedule.sunday ?? { active: false, bands: [] };
  if (day === 6) return schedule.saturday ?? { active: false, bands: [] };
  return schedule.weekday ?? { active: false, bands: [] };
}

function bandStartSeconds(band: ServiceBand): number {
  return (band.startHour * 60 + band.startMin) * 60;
}

function bandEndSeconds(band: ServiceBand): number {
  return (band.endHour * 60 + band.endMin) * 60;
}

function getDepartureSeconds(route: CustomRoute, date: string, startSec: number, endSec: number): number[] {
  const schedule = simulationScheduleForRoute(route);
  if (schedule.type === "fixed") {
    return (schedule.fixedDepartures ?? [])
      .map(timeToSeconds)
      .filter((departSec) => departSec < endSec && departSec >= startSec - 4 * 3600)
      .sort((a, b) => a - b);
  }
  if (schedule.type === "timetable") {
    const timetableTrips = schedule.timetableTrips
      ?? (schedule.stopTimes?.length
        ? [{
            id: "legacy-timetable",
            departureSec: schedule.firstDepartureSec ?? schedule.stopTimes[0]?.arrivalSec ?? 0,
            stopTimes: schedule.stopTimes,
          }]
        : []);
    return timetableTrips
      .map((trip) => trip.departureSec)
      .filter((departSec) => departSec < endSec && departSec >= startSec - 4 * 3600)
      .sort((a, b) => a - b);
  }

  const daySchedule = dayScheduleForDate(route, date);
  if (!daySchedule?.active) return [];

  const departures: number[] = [];
  for (const band of daySchedule.bands) {
    const headwaySecs = Math.max(60, band.headwayMins * 60);
    for (let t = bandStartSeconds(band); t < bandEndSeconds(band); t += headwaySecs) {
      if (t < endSec && t >= startSec - 4 * 3600) departures.push(t);
    }
  }
  return departures.sort((a, b) => a - b);
}

function distKm(a: [number, number], b: [number, number]): number {
  const r = 6371;
  const dLat = ((b[1] - a[1]) * Math.PI) / 180;
  const dLon = ((b[0] - a[0]) * Math.PI) / 180;
  const lat1 = (a[1] * Math.PI) / 180;
  const lat2 = (b[1] * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(h));
}

function polylineKm(coords: [number, number][]): number {
  let total = 0;
  for (let i = 1; i < coords.length; i++) total += distKm(coords[i - 1], coords[i]);
  return total;
}

function customRouteShape(route: CustomRoute): [number, number][] {
  if (route.geometry && route.geometry.length >= 2) return route.geometry;
  return route.stops.map((stop) => [stop.lon, stop.lat] as [number, number]);
}

function customRouteDurationSecs(route: CustomRoute, shape: [number, number][]): number {
  if (route.extension?.extensionTravelTimeMins) {
    return clamp(Math.round(route.extension.extensionTravelTimeMins * 60), 6 * 60, 4 * 3600);
  }
  const speedKmh = route.type === "train" ? 65 : 32;
  const estimated = (polylineKm(shape) / speedKmh) * 3600;
  return clamp(Math.round(estimated), route.type === "train" ? 10 * 60 : 6 * 60, 4 * 3600);
}

function projectStopFrac(
  lon: number,
  lat: number,
  shape: [number, number][],
  cache: ShapeCache
): number {
  if (cache.total === 0) return 0;
  let minD2 = Infinity;
  let bestFrac = 0;
  for (let i = 0; i < shape.length; i++) {
    const dx = shape[i][0] - lon;
    const dy = shape[i][1] - lat;
    const d2 = dx * dx + dy * dy;
    if (d2 < minD2) {
      minD2 = d2;
      bestFrac = cache.cumDists[i] / cache.total;
    }
  }
  return bestFrac;
}

function customRouteStops(route: CustomRoute, shape: [number, number][], reverse: boolean, durationSecs: number, departSec: number): SimStop[] {
  const rawStops = route.stops.length >= 2
    ? route.stops
    : [
        { id: `${route.id}-start`, name: "Start", lat: shape[0][1], lon: shape[0][0], sequence: 1 },
        { id: `${route.id}-end`, name: "End", lat: shape[shape.length - 1][1], lon: shape[shape.length - 1][0], sequence: 2 },
      ];
  const orderedStops = reverse ? [...rawStops].reverse() : rawStops;
  const cache = buildShapeCache(shape);
  const stops = orderedStops.map((stop, index) => ({
    t: departSec,
    lat: stop.lat,
    lon: stop.lon,
    shapeFrac: cache.total > 0
      ? projectStopFrac(stop.lon, stop.lat, shape, cache)
      : index / Math.max(1, orderedStops.length - 1),
    stop_name: stop.name,
  }));

  if (stops.length > 0) {
    stops[0].shapeFrac = 0;
    stops[stops.length - 1].shapeFrac = 1;
  }
  for (let i = 1; i < stops.length; i++) {
    if (stops[i].shapeFrac < stops[i - 1].shapeFrac) {
      stops[i].shapeFrac = stops[i - 1].shapeFrac;
    }
  }
  for (const stop of stops) {
    stop.t = Math.round(departSec + stop.shapeFrac * durationSecs);
  }
  return stops;
}

function timetableTripsForRoute(route: CustomRoute): CustomTimetableTrip[] {
  const schedule = simulationScheduleForRoute(route);
  if (schedule.type !== "timetable") return [];
  if (schedule.timetableTrips) return schedule.timetableTrips;
  if (!schedule.stopTimes?.length) return [];
  return [{
    id: "legacy-timetable",
    departureSec: schedule.firstDepartureSec ?? schedule.stopTimes[0]?.arrivalSec ?? 0,
    stopTimes: schedule.stopTimes,
  }];
}

function customRouteTimedStops(
  route: CustomRoute,
  shape: [number, number][],
  durationSecs: number,
  timetableTrip: CustomTimetableTrip,
): SimStop[] {
  const rawStops = route.stops.length >= 2
    ? route.stops
    : [
        { id: `${route.id}-start`, name: "Start", lat: shape[0][1], lon: shape[0][0], sequence: 1 },
        { id: `${route.id}-end`, name: "End", lat: shape[shape.length - 1][1], lon: shape[shape.length - 1][0], sequence: 2 },
      ];
  const departSec = timetableTrip.departureSec;
  const timeByStop = new Map(timetableTrip.stopTimes.map((stopTime) => [stopTime.stopId, stopTime.arrivalSec]));
  const cache = buildShapeCache(shape);
  const stops = rawStops.map((stop, index) => {
    const shapeFrac = cache.total > 0
      ? projectStopFrac(stop.lon, stop.lat, shape, cache)
      : index / Math.max(1, rawStops.length - 1);
    return {
      t: timeByStop.get(stop.id) ?? Math.round(departSec + shapeFrac * durationSecs),
      lat: stop.lat,
      lon: stop.lon,
      shapeFrac,
      stop_name: stop.name,
    };
  });

  if (stops.length > 0) {
    stops[0].shapeFrac = 0;
    stops[0].t = timeByStop.get(rawStops[0]?.id ?? "") ?? departSec;
    stops[stops.length - 1].shapeFrac = 1;
  }
  for (let i = 1; i < stops.length; i++) {
    if (stops[i].shapeFrac < stops[i - 1].shapeFrac) {
      stops[i].shapeFrac = stops[i - 1].shapeFrac;
    }
    if (stops[i].t < stops[i - 1].t) {
      stops[i].t = stops[i - 1].t;
    }
  }
  return stops;
}

export function buildCustomSimulationTrips(
  routes: CustomRoute[],
  selectedRouteIds: string[],
  options: { start: string; end: string; date: string }
): SimTrip[] {
  const selectedIds = new Set(selectedRouteIds);
  const startSec = timeToSeconds(options.start);
  const endSec = timeToSeconds(options.end);
  const trips: SimTrip[] = [];

  for (const route of routes) {
    if (!selectedIds.has(route.id)) continue;

    const baseShape = customRouteShape(route);
    if (baseShape.length < 2) continue;

    const durationSecs = customRouteDurationSecs(route, baseShape);
    const schedule = simulationScheduleForRoute(route);
    const timetableTrips = timetableTripsForRoute(route);

    if (schedule.type === "timetable") {
      for (const timetableTrip of timetableTrips) {
        if (trips.length >= 300) break;
        const departSec = timetableTrip.departureSec;
        const stops = customRouteTimedStops(route, baseShape, durationSecs, timetableTrip);
        const arriveSec = stops[stops.length - 1]?.t ?? departSec;
        if (departSec >= endSec || arriveSec <= startSec) continue;

        trips.push({
          trip_id: `${CUSTOM_ROUTE_SELECTION_PREFIX}${route.id}-${timetableTrip.id}`,
          route_short_name: route.name || "Custom",
          route_long_name: route.description || route.name || "Custom route",
          route_type: route.type === "train" ? 2 : 3,
          color: route.color,
          source: "custom",
          stops,
          shape: baseShape,
          start_stop_name: stops[0]?.stop_name ?? "",
          end_stop_name: stops[stops.length - 1]?.stop_name ?? "",
          start_time: toHHMM(departSec),
          end_time: toHHMM(arriveSec),
          departSec,
          arriveSec,
        });
      }
      continue;
    }

    const departures = getDepartureSeconds(route, options.date, startSec, endSec);
    const bothDirections = schedule.direction !== "one-way";

    for (const departSec of departures) {
      if (trips.length >= 300) break;

      for (const reverse of bothDirections ? [false, true] : [false]) {
        const shape = reverse ? [...baseShape].reverse() : baseShape;
        const stops = customRouteStops(route, shape, reverse, durationSecs, departSec);
        const arriveSec = departSec + durationSecs;
        if (departSec >= endSec || arriveSec <= startSec) continue;

        trips.push({
          trip_id: `${CUSTOM_ROUTE_SELECTION_PREFIX}${route.id}-${departSec}-${reverse ? "rev" : "fwd"}`,
          route_short_name: route.name || "Custom",
          route_long_name: route.description || route.name || "Custom route",
          route_type: route.type === "train" ? 2 : 3,
          color: route.color,
          source: "custom",
          stops,
          shape,
          start_stop_name: stops[0]?.stop_name ?? "",
          end_stop_name: stops[stops.length - 1]?.stop_name ?? "",
          start_time: toHHMM(departSec),
          end_time: toHHMM(arriveSec),
          departSec,
          arriveSec,
        });
      }
    }
  }

  return trips;
}

// ── Vehicle position with shape-following ─────────────────────────────────

export interface ActiveVehicle {
  tripId: string;
  pos: [number, number];
  color: string;
  routeName: string;
  /** Human-readable line name, e.g. "Kitchener Line" */
  lineName: string;
  /** Final destination stop name */
  destination: string;
  /** Scheduled departure time HH:MM */
  startTime: string;
  /** Scheduled arrival time HH:MM */
  endTime: string;
  /** fraction 0-1 of trip completed */
  progress: number;
  /** seconds until next stop */
  secsToNextStop: number;
  nextStopName?: string;
}

/** Get position for one trip at time t, following the shape */
export function getTripPosition(
  trip: SimTrip,
  shapeCache: ShapeCache,
  t: number
): { pos: [number, number]; progress: number; nextStopName?: string; secsToNextStop: number } | null {
  const stops = trip.stops;
  if (!stops.length) return null;
  if (t < stops[0].t || t > stops[stops.length - 1].t) return null;

  for (let i = 0; i < stops.length - 1; i++) {
    const a = stops[i];
    const b = stops[i + 1];
    if (t >= a.t && t <= b.t) {
      const ratio = b.t === a.t ? 0 : (t - a.t) / (b.t - a.t);
      const frac = a.shapeFrac + (b.shapeFrac - a.shapeFrac) * ratio;
      const pos = trip.shape.length > 1
        ? positionAtFrac(trip.shape, shapeCache, frac)
        : [a.lon + (b.lon - a.lon) * ratio, a.lat + (b.lat - a.lat) * ratio] as [number, number];

      // Overall progress in the trip
      const tripDur = stops[stops.length - 1].t - stops[0].t;
      const progress = tripDur > 0 ? (t - stops[0].t) / tripDur : 0;

      return {
        pos,
        progress: Math.min(1, Math.max(0, progress)),
        nextStopName: b.stop_name,
        secsToNextStop: Math.max(0, b.t - t),
      };
    }
  }
  return null;
}

/** Get all active vehicle positions at time t */
export function getActiveVehicles(
  trips: SimTrip[],
  shapeCaches: Map<string, ShapeCache>,
  currentTime: number
): ActiveVehicle[] {
  const out: ActiveVehicle[] = [];
  for (const trip of trips) {
    const cache = shapeCaches.get(trip.trip_id);
    if (!cache) continue;
    const result = getTripPosition(trip, cache, currentTime);
    if (result) {
      out.push({
        tripId: trip.trip_id,
        pos: result.pos,
        color: trip.color,
        routeName: trip.route_short_name,
        lineName: trip.route_long_name || trip.route_short_name,
        destination: trip.end_stop_name,
        startTime: trip.start_time,
        endTime: trip.end_time,
        progress: result.progress,
        secsToNextStop: result.secsToNextStop,
        nextStopName: result.nextStopName,
      });
    }
  }
  return out;
}

export function formatSimTime(seconds: number): string {
  return secondsToDisplayTime(seconds);
}

export function parseSimTime(hhmm: string): number {
  return timeToSeconds(hhmm);
}
