/**
 * Connection scheduling: derive a custom route's departures from a feeder
 * route's times at a shared stop.
 *
 *   Outbound  — the feeder arrives, riders transfer, we hold `holdMins`, we go.
 *   Return    — we must be sitting at the interchange `bufferMins` before the
 *               feeder leaves, so riders coming off our route can catch it.
 *
 * See {@link RouteConnection} in `lib/gtfs.ts`. Resolution happens in the
 * wizard against `/api/variant-schedule`; the results are snapshotted into a
 * `fixed` schedule so the simulation stays synchronous and offline.
 */

/** One trip of a feeder variant, as returned by `/api/variant-schedule`. */
export interface FeederTrip {
  trip_id: string;
  departureSec: number;
  stops: { stopId: string; stopName: string; departureSec: number }[];
}

/**
 * Normalise a stop name for fuzzy matching. Strips the GO / rail / bus / loop /
 * platform decorations that differ between a station's train and bus stops
 * ("Kitchener GO" ≈ "Kitchener GO Bus" ≈ "Kitchener").
 */
export function normalizeStopName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\bgo\s*transit\b/g, "")
    .replace(/\bgo\b/g, "")
    .replace(/\b(station|stn|bus|terminal|rail|loop|platform|bay|stop)\b/g, "")
    .replace(/\bplatform\s*\d+\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const EARTH_M = 6371000;
function haversineM(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number },
): number {
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const la1 = (a.lat * Math.PI) / 180;
  const la2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_M * Math.asin(Math.sqrt(h));
}

/** How close a feeder stop must be to count as "the same interchange". */
export const INTERCHANGE_RADIUS_M = 450;

export interface FeederStop {
  stopId: string;
  stopName: string;
  lat?: number;
  lon?: number;
}

/**
 * Find the feeder stop that is the same interchange as `stop`.
 *   1. exact normalised-name match
 *   2. nearest feeder stop within {@link INTERCHANGE_RADIUS_M} (catches the
 *      train↔bus name split and on-street GO bus stops by the platform)
 *   3. loose name containment
 */
export function matchFeederStop(
  feederStops: FeederStop[],
  stop: { name: string; lat?: number; lon?: number },
): FeederStop | null {
  const target = normalizeStopName(stop.name);

  // dedupe by stopId
  const seen = new Map<string, FeederStop>();
  for (const s of feederStops) if (!seen.has(s.stopId)) seen.set(s.stopId, s);
  const list = [...seen.values()];

  if (target) {
    const exact = list.find((s) => normalizeStopName(s.stopName) === target);
    if (exact) return exact;
  }

  if (stop.lat != null && stop.lon != null) {
    let best: { s: FeederStop; dist: number } | null = null;
    for (const s of list) {
      if (s.lat == null || s.lon == null) continue;
      const dist = haversineM({ lat: stop.lat, lon: stop.lon }, { lat: s.lat, lon: s.lon });
      if (dist <= INTERCHANGE_RADIUS_M && (!best || dist < best.dist)) best = { s, dist };
    }
    if (best) return best.s;
  }

  if (target) {
    const loose = list.find((s) => {
      const n = normalizeStopName(s.stopName);
      return n && (n.includes(target) || target.includes(n));
    });
    if (loose) return loose;
  }
  return null;
}

/** Feeder stops as seen in a set of trips (no coords). */
export function feederStopsFromTrips(trips: FeederTrip[]): FeederStop[] {
  const seen = new Map<string, FeederStop>();
  for (const trip of trips) {
    for (const s of trip.stops) {
      if (!seen.has(s.stopId)) seen.set(s.stopId, { stopId: s.stopId, stopName: s.stopName });
    }
  }
  return [...seen.values()];
}

/** Feeder times at one stop (seconds since midnight), sorted and de-duplicated. */
export function feederTimesAtStop(trips: FeederTrip[], feederStopId: string): number[] {
  const times: number[] = [];
  for (const trip of trips) {
    const stop = trip.stops.find((s) => s.stopId === feederStopId);
    if (stop) times.push(stop.departureSec);
  }
  times.sort((a, b) => a - b);
  return times.filter((t, i) => i === 0 || t !== times[i - 1]);
}

function secToHHMM(sec: number): string {
  const wrapped = ((Math.round(sec / 60) % 1440) + 1440) % 1440;
  const h = Math.floor(wrapped / 60);
  const m = wrapped % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/**
 * Outbound departures: one per feeder arrival, `holdMins` later.
 * Feeder arrivals within `dedupeMins` of each other collapse to one trip.
 */
export function resolveOutboundDepartures(
  feederTimesSec: number[],
  holdMins: number,
  dedupeMins = 3,
): string[] {
  const hold = Math.max(0, holdMins) * 60;
  const dedupe = Math.max(0, dedupeMins) * 60;
  const out: number[] = [];
  for (const t of feederTimesSec) {
    const dep = t + hold;
    if (out.length === 0 || dep - out[out.length - 1] > dedupe) out.push(dep);
  }
  return out.map(secToHHMM);
}

/**
 * Return departures: leave our far terminal early enough to reach the
 * interchange `bufferMins` before the feeder departs.
 *   returnDeparture = feederDeparture - travelSec - buffer
 */
export function resolveReturnDepartures(
  feederTimesSec: number[],
  travelSec: number,
  bufferMins: number,
  dedupeMins = 3,
): string[] {
  const lead = Math.max(0, travelSec) + Math.max(0, bufferMins) * 60;
  const dedupe = Math.max(0, dedupeMins) * 60;
  const out: number[] = [];
  for (const t of feederTimesSec) {
    const dep = t - lead;
    if (dep < 0) continue;
    if (out.length === 0 || dep - out[out.length - 1] > dedupe) out.push(dep);
  }
  return out.map(secToHHMM);
}
