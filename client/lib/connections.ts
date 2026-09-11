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

/** One resolved connection trip, in seconds since midnight. */
export interface ResolvedTrip {
  feederSec: number;       // the feeder time this trip meets
  firstStopSec: number;    // departure at this direction's first stop
  interchangeSec: number;  // exact time our vehicle is at the interchange
}

export interface ResolvedConn {
  trips: ResolvedTrip[];
  /** Feeder times we couldn't serve (departure would be before midnight). */
  missed: number;
}

function dedupeByFirstStop(rows: ResolvedTrip[], dedupeMins: number): ResolvedTrip[] {
  const dedupe = Math.max(0, dedupeMins) * 60;
  const out: ResolvedTrip[] = [];
  for (const r of rows.sort((a, b) => a.firstStopSec - b.firstStopSec)) {
    if (out.length === 0 || r.firstStopSec - out[out.length - 1].firstStopSec > dedupe) {
      out.push(r);
    }
  }
  return out;
}

/**
 * Outbound: reach the interchange `holdMins` after the feeder arrives.
 *   interchangeTime = feederArrival + hold
 *   firstStopDeparture = interchangeTime − (travel from first stop to interchange)
 */
export function resolveOutbound(
  feederTimesSec: number[],
  holdMins: number,
  interchangeOffsetSec: number,
  dedupeMins = 3,
): ResolvedConn {
  const hold = Math.max(0, holdMins) * 60;
  const off = Math.max(0, interchangeOffsetSec);
  let missed = 0;
  const rows: ResolvedTrip[] = [];
  for (const t of feederTimesSec) {
    const interchangeSec = t + hold;
    const firstStopSec = interchangeSec - off;
    if (firstStopSec < 0) { missed++; continue; }
    rows.push({ feederSec: t, firstStopSec, interchangeSec });
  }
  return { trips: dedupeByFirstStop(rows, dedupeMins), missed };
}

/**
 * Return: reach the interchange `bufferMins` before the feeder departs, so
 * riders can catch it. The interchange sits `routeDurationSec − interchangeOffsetSec`
 * from the return direction's first stop (the far terminal).
 */
export function resolveReturn(
  feederTimesSec: number[],
  routeDurationSec: number,
  bufferMins: number,
  interchangeOffsetSec: number,
  dedupeMins = 3,
): ResolvedConn {
  const buffer = Math.max(0, bufferMins) * 60;
  const leadFromFarTerminal = Math.max(0, routeDurationSec) - Math.max(0, interchangeOffsetSec);
  let missed = 0;
  const rows: ResolvedTrip[] = [];
  for (const t of feederTimesSec) {
    const interchangeSec = t - buffer;
    const firstStopSec = interchangeSec - Math.max(0, leadFromFarTerminal);
    if (firstStopSec < 0) { missed++; continue; }
    rows.push({ feederSec: t, firstStopSec, interchangeSec });
  }
  return { trips: dedupeByFirstStop(rows, dedupeMins), missed };
}

export function secToHHMM(sec: number): string {
  const wrapped = ((Math.round(sec / 60) % 1440) + 1440) % 1440;
  const h = Math.floor(wrapped / 60);
  const m = wrapped % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
