/**
 * Compile GO derived trips + custom routes into a query-ready network.
 *
 * GO service comes from `sim_trips_by_dow.json` (one representative service day
 * per weekday, see `scripts/build_gtfs_derived.py`). Custom routes are expanded
 * with `buildCustomRouteTrips`, the same schedule logic the simulation uses, so
 * a route's frequency bands / fixed departures / timetable mean the same thing
 * in both places.
 *
 * Three service days are stitched onto the query day's clock — the day before
 * (for after-midnight trips), the day itself, and the day after (when the
 * search horizon crosses midnight).
 */

import { colorForRoute } from "@/lib/routeColors";
import { buildCustomRouteTrips } from "@/lib/simulation";
import type { CustomRoute } from "@/lib/gtfs";
import type {
  Connection,
  Footpath,
  PlannerNetwork,
  PlannerStop,
  PlannerTrip,
} from "./types";

/** Shape of one trip in `sim_trips_by_dow.json`. */
export interface GoTripRaw {
  trip_id: string;
  route_short_name: string;
  route_long_name: string;
  route_type: number;
  stops: { stop_id: string; t: number; seq: number }[];
}

export type GoTripsByDow = Record<string, GoTripRaw[]>;
export type GoStopsLookup = Record<string, { lat: number; lon: number; name: string }>;

const DAY = 86400;

/** "YYYY-MM-DD" ± n days, as a calendar date (no time-zone drift). */
export function shiftDate(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

/** JS day of week (0 = Sun) for a "YYYY-MM-DD" calendar date. */
export function dayOfWeek(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

const EARTH_M = 6371000;
export function haversineM(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const la1 = (a.lat * Math.PI) / 180;
  const la2 = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_M * Math.asin(Math.sqrt(h));
}

/** Straight-line distance inflated for street detours. */
const WALK_DETOUR = 1.25;
export function walkSeconds(distanceM: number, speedMps: number): number {
  return Math.round((distanceM * WALK_DETOUR) / speedMps);
}

export interface BuildNetworkInput {
  /** Service date, "YYYY-MM-DD". */
  date: string;
  /** Window on the query day's clock; trips not overlapping it are dropped. */
  windowStartSec: number;
  windowEndSec: number;
  goTrips?: GoTripsByDow;
  goStops?: GoStopsLookup;
  customRoutes?: CustomRoute[];
  /** Other trips already in planner form (tests, future feeds). */
  extraTrips?: PlannerTrip[];
  extraStops?: PlannerStop[];
  maxTransferWalkM: number;
  walkSpeedMps: number;
}

function overlaps(trip: PlannerTrip, start: number, end: number): boolean {
  const first = trip.stops[0]?.dep ?? Infinity;
  const last = trip.stops[trip.stops.length - 1]?.arr ?? -Infinity;
  return first < end && last >= start;
}

export function buildNetwork(input: BuildNetworkInput): PlannerNetwork {
  const stops: PlannerStop[] = [];
  const stopIndex = new Map<string, number>();
  const addStop = (s: PlannerStop) => {
    if (stopIndex.has(s.id)) return;
    stopIndex.set(s.id, stops.length);
    stops.push(s);
  };

  const trips: PlannerTrip[] = [];
  const keep = (trip: PlannerTrip) => {
    if (trip.stops.length >= 2 && overlaps(trip, input.windowStartSec, input.windowEndSec)) {
      trips.push(trip);
    }
  };

  const days = [-1, 0, 1].filter((offset) => {
    // Previous day only matters for after-midnight trips; next day only when
    // the window runs past midnight.
    if (offset === 1) return input.windowEndSec > DAY;
    return true;
  });

  // ── GO ───────────────────────────────────────────────────────────────────
  if (input.goTrips && input.goStops) {
    for (const offset of days) {
      const dow = dayOfWeek(shiftDate(input.date, offset));
      const shift = offset * DAY;
      for (const raw of input.goTrips[String(dow)] ?? []) {
        const tripStops = raw.stops
          .filter((s) => input.goStops![s.stop_id])
          .map((s) => ({ stopId: `go:${s.stop_id}`, arr: s.t + shift, dep: s.t + shift }));
        keep({
          id: `go:${raw.trip_id}@${offset}`,
          routeName: raw.route_short_name,
          routeLabel: raw.route_long_name,
          color: colorForRoute(raw.route_short_name, raw.route_type),
          mode: raw.route_type === 2 ? "train" : "bus",
          source: "gotransit",
          estimated: false,
          stops: tripStops,
        });
      }
    }
    for (const trip of trips) {
      for (const s of trip.stops) {
        const raw = input.goStops[s.stopId.slice(3)];
        addStop({ id: s.stopId, name: raw.name, lat: raw.lat, lon: raw.lon });
      }
    }
  }

  // ── Custom routes ────────────────────────────────────────────────────────
  for (const route of input.customRoutes ?? []) {
    const timetabled = route.schedule?.type === "timetable";
    // Register stops even when nothing runs today, so "no service" isn't
    // reported as "no stop nearby".
    for (const s of route.stops) {
      addStop({ id: `custom:${route.id}:${s.id}`, name: s.name, lat: s.lat, lon: s.lon });
    }
    for (const offset of days) {
      const shift = offset * DAY;
      const simTrips = buildCustomRouteTrips(route, shiftDate(input.date, offset), {
        startSec: input.windowStartSec - shift,
        endSec: input.windowEndSec - shift,
      });
      for (const sim of simTrips) {
        const tripStops = sim.stops.map((s, i) => {
          const id = `custom:${route.id}:${s.stop_id ?? i}`;
          addStop({ id, name: s.stop_name ?? route.name, lat: s.lat, lon: s.lon });
          return { stopId: id, arr: s.t + shift, dep: s.t + shift };
        });
        keep({
          id: `${sim.trip_id}@${offset}`,
          routeName: route.name || "Custom route",
          routeLabel: `${sim.start_stop_name} → ${sim.end_stop_name}`,
          color: route.color,
          mode: route.type,
          source: "custom",
          estimated: !timetabled,
          stops: tripStops,
        });
      }
    }
  }

  // ── Pre-built trips (tests) ──────────────────────────────────────────────
  for (const s of input.extraStops ?? []) addStop(s);
  for (const t of input.extraTrips ?? []) keep(t);

  // ── Connections ──────────────────────────────────────────────────────────
  const connections: Connection[] = [];
  trips.forEach((trip, ti) => {
    for (let i = 0; i < trip.stops.length - 1; i++) {
      const a = trip.stops[i];
      const b = trip.stops[i + 1];
      const from = stopIndex.get(a.stopId);
      const to = stopIndex.get(b.stopId);
      if (from === undefined || to === undefined || from === to) continue;
      if (b.arr < a.dep) continue; // malformed times
      connections.push({ trip: ti, from, to, dep: a.dep, arr: b.arr, seq: i });
    }
  });
  // Tie-break on arrival then sequence so a trip's zero-length hops stay in order.
  connections.sort((x, y) => x.dep - y.dep || x.arr - y.arr || x.seq - y.seq);

  return {
    stops,
    stopIndex,
    trips,
    connections,
    footpaths: buildFootpaths(stops, input.maxTransferWalkM, input.walkSpeedMps),
  };
}

/** One-hop walking links between every pair of stops within `maxM`. */
function buildFootpaths(stops: PlannerStop[], maxM: number, speedMps: number): Footpath[][] {
  const out: Footpath[][] = stops.map(() => []);
  // ~111 km per degree latitude; a cheap box test before haversine.
  const dLat = maxM / 111000;
  const order = stops.map((_, i) => i).sort((a, b) => stops[a].lat - stops[b].lat);
  for (let ai = 0; ai < order.length; ai++) {
    const a = stops[order[ai]];
    for (let bi = ai + 1; bi < order.length; bi++) {
      const b = stops[order[bi]];
      if (b.lat - a.lat > dLat) break;
      const d = haversineM(a, b);
      if (d > maxM) continue;
      const walkSec = walkSeconds(d, speedMps);
      out[order[ai]].push({ to: order[bi], walkSec, distanceM: d });
      out[order[bi]].push({ to: order[ai], walkSec, distanceM: d });
    }
  }
  return out;
}
