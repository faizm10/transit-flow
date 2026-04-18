import { secondsToDisplayTime, timeToSeconds } from "./gtfs";

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

// ── Vehicle position with shape-following ─────────────────────────────────

export interface ActiveVehicle {
  tripId: string;
  pos: [number, number];
  color: string;
  routeName: string;
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
