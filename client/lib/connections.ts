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

/** Normalise a stop name for fuzzy matching ("Kitchener GO" ≈ "kitchener"). */
export function normalizeStopName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\bgo\b/g, "")
    .replace(/\b(station|bus|terminal|rail)\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Find the feeder stop that best matches `stopName`. Exact-normalised match
 * first, then a containment match. Returns the feeder stopId or null.
 */
export function matchFeederStop(
  trips: FeederTrip[],
  stopName: string,
): { stopId: string; stopName: string } | null {
  const target = normalizeStopName(stopName);
  if (!target) return null;

  const seen = new Map<string, string>(); // stopId -> stopName
  for (const trip of trips) {
    for (const s of trip.stops) {
      if (!seen.has(s.stopId)) seen.set(s.stopId, s.stopName);
    }
  }

  let contains: { stopId: string; stopName: string } | null = null;
  for (const [stopId, name] of seen) {
    const n = normalizeStopName(name);
    if (n === target) return { stopId, stopName: name };
    if (!contains && (n.includes(target) || target.includes(n))) {
      contains = { stopId, stopName: name };
    }
  }
  return contains;
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
