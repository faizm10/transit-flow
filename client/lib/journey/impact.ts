/**
 * Whole-network impact of one custom route.
 *
 * For every tested station as an origin, at every tested departure time, run
 * one one-to-all search on each network (existing, and existing + route) and
 * read off the arrival at every other station. That is O(stations ×
 * departures) searches rather than O(stations² × departures), which keeps a
 * ~75-station report to a second or two in the worker.
 *
 * The result counts *travel options* — station pairs and departure times — not
 * passengers. Nothing here is weighted by demand.
 */

import { haversineM } from "./network";
import { arrivalsFrom, planJourney, walksNear } from "./planner";
import {
  DEFAULT_LIMITS,
  type JourneyPlace,
  type PlannerNetwork,
  type RideLeg,
  type SearchLimits,
} from "./types";
import type { GoStopsLookup } from "./network";
import type { CustomRoute } from "@/lib/gtfs";

export interface ImpactStation extends JourneyPlace {
  id: string;
  source: "go" | "route";
}

/** Pairs closer than this are walkable; journeys between them aren't tested. */
export const MIN_PAIR_DISTANCE_M = 1500;
const LIST_SIZE = 10;

/**
 * Stations to test: every GO rail station (non-numeric stop ids in the derived
 * lookup) plus the custom route's own stops, skipping route stops that sit on
 * a GO station already.
 */
export function impactStations(goStops: GoStopsLookup, route: CustomRoute): ImpactStation[] {
  const out: ImpactStation[] = [];
  for (const [id, s] of Object.entries(goStops)) {
    if (/^\d+$/.test(id)) continue; // numeric ids are bus stops
    out.push({ id: `go:${id}`, name: s.name, lat: s.lat, lon: s.lon, source: "go" });
  }
  const go = [...out];
  for (const stop of [...route.stops].sort((a, b) => a.sequence - b.sequence)) {
    if (go.some((g) => haversineM(g, stop) < 150)) continue;
    out.push({ id: `route:${stop.id}`, name: stop.name, lat: stop.lat, lon: stop.lon, source: "route" });
  }
  return out;
}

export interface ImpactImprovement {
  from: string;
  to: string;
  departSec: number;
  baseTotalSec: number;
  withTotalSec: number;
  savedSec: number;
  baseTransfers: number;
  withTransfers: number;
  baseServices: string[];
  withServices: string[];
  /** Custom-route legs have estimated timings. */
  estimated: boolean;
}

export interface ImpactNewConnection {
  from: string;
  to: string;
  /** How many of the tested departures become possible. */
  departures: number;
  firstDepartSec: number;
  withTotalSec: number;
  withServices: string[];
}

export interface ImpactReport {
  stations: { go: number; route: number };
  departures: number[];
  /** Station pairs tested (ordered, origin ≠ destination, ≥ MIN_PAIR_DISTANCE_M apart). */
  pairs: number;
  /** pairs × departures. */
  journeysTested: number;
  /** Journeys possible on the existing network. */
  journeysPossibleBefore: number;
  faster: number;
  avgSavedSec: number | null;
  /** Journeys whose fastest option needs fewer transfers (faster or not). */
  fewerTransfers: number;
  /** Journeys impossible before, possible with the route. */
  newlyPossible: number;
  newlyPossiblePairs: number;
  biggest: ImpactImprovement[];
  newConnections: ImpactNewConnection[];
  limits: SearchLimits;
  minPairDistanceM: number;
}

interface Best {
  arr: number;
  /** Vehicles used, 0 = unreachable. */
  vehicles: number;
}

/** Earliest arrival at a place given per-round stop arrivals. */
function bestAt(rounds: Float64Array[], egress: Map<number, { sec: number }>): Best {
  let arr = Infinity;
  let vehicles = 0;
  for (let k = 1; k < rounds.length; k++) {
    const r = rounds[k];
    for (const [s, w] of egress) {
      const a = r[s] + w.sec;
      if (a < arr) { arr = a; vehicles = k; }
    }
  }
  return { arr, vehicles };
}

export function analyzeImpact(
  baseNetwork: PlannerNetwork,
  withNetwork: PlannerNetwork,
  stations: ImpactStation[],
  departures: number[],
  limits: SearchLimits = DEFAULT_LIMITS,
  onProgress?: (done: number, total: number) => void,
): ImpactReport {
  const egressBase = stations.map((s) => walksNear(baseNetwork, s, limits));
  const egressWith = stations.map((s) => walksNear(withNetwork, s, limits));

  // Pair eligibility is geometric, so it doesn't depend on the departure.
  const eligible = stations.map((o) =>
    stations.map((d) => o !== d && haversineM(o, d) >= MIN_PAIR_DISTANCE_M),
  );
  const pairs = eligible.reduce((n, row) => n + row.filter(Boolean).length, 0);

  let journeysPossibleBefore = 0;
  let faster = 0;
  let savedTotal = 0;
  let fewerTransfers = 0;
  let newlyPossible = 0;
  // Best improvement per pair, so one pair can't fill the whole list.
  const bestPerPair = new Map<string, { o: number; d: number; dep: number; saved: number }>();
  const newPerPair = new Map<string, { o: number; d: number; count: number; firstDep: number; withTotal: number }>();

  const total = stations.length * departures.length;
  let done = 0;
  for (let o = 0; o < stations.length; o++) {
    for (const dep of departures) {
      const base = arrivalsFrom(baseNetwork, stations[o], dep, limits);
      const withR = arrivalsFrom(withNetwork, stations[o], dep, limits);
      for (let d = 0; d < stations.length; d++) {
        if (!eligible[o][d]) continue;
        const b = base.length ? bestAt(base, egressBase[d]) : { arr: Infinity, vehicles: 0 };
        const w = withR.length ? bestAt(withR, egressWith[d]) : { arr: Infinity, vehicles: 0 };
        const key = `${o}>${d}`;
        if (b.vehicles > 0) journeysPossibleBefore++;
        if (b.vehicles === 0 && w.vehicles > 0) {
          newlyPossible++;
          const cur = newPerPair.get(key);
          if (cur) cur.count++;
          else newPerPair.set(key, { o, d, count: 1, firstDep: dep, withTotal: w.arr - dep });
          continue;
        }
        if (b.vehicles === 0 || w.vehicles === 0) continue;
        const saved = b.arr - w.arr;
        if (saved > 0) {
          faster++;
          savedTotal += saved;
          const cur = bestPerPair.get(key);
          if (!cur || saved > cur.saved) bestPerPair.set(key, { o, d, dep, saved });
        }
        if (w.vehicles < b.vehicles) fewerTransfers++;
      }
      onProgress?.(++done, total);
    }
  }

  // Full journeys (for service names) only for the short lists.
  const journeyAt = (net: PlannerNetwork, o: number, d: number, dep: number) => {
    const r = planJourney(net, { origin: stations[o], destination: stations[d], departSec: dep }, limits);
    return r.found ? r.journey : null;
  };
  const services = (j: ReturnType<typeof journeyAt>) => j?.services ?? [];

  const biggest = [...bestPerPair.values()]
    .sort((x, y) => y.saved - x.saved)
    .slice(0, LIST_SIZE)
    .map(({ o, d, dep }): ImpactImprovement | null => {
      const bj = journeyAt(baseNetwork, o, d, dep);
      const wj = journeyAt(withNetwork, o, d, dep);
      if (!bj || !wj) return null;
      return {
        from: stations[o].name,
        to: stations[d].name,
        departSec: dep,
        baseTotalSec: bj.totalSec,
        withTotalSec: wj.totalSec,
        savedSec: bj.arriveSec - wj.arriveSec,
        baseTransfers: bj.transfers,
        withTransfers: wj.transfers,
        baseServices: services(bj),
        withServices: services(wj),
        estimated: wj.legs.some((l): l is RideLeg => l.kind === "ride" && l.estimated),
      };
    })
    .filter((x): x is ImpactImprovement => x !== null);

  const newConnections = [...newPerPair.values()]
    .sort((x, y) => y.count - x.count || x.withTotal - y.withTotal)
    .slice(0, LIST_SIZE)
    .map(({ o, d, count, firstDep, withTotal }): ImpactNewConnection => ({
      from: stations[o].name,
      to: stations[d].name,
      departures: count,
      firstDepartSec: firstDep,
      withTotalSec: withTotal,
      withServices: services(journeyAt(withNetwork, o, d, firstDep)),
    }));

  return {
    stations: {
      go: stations.filter((s) => s.source === "go").length,
      route: stations.filter((s) => s.source === "route").length,
    },
    departures,
    pairs,
    journeysTested: pairs * departures.length,
    journeysPossibleBefore,
    faster,
    avgSavedSec: faster > 0 ? savedTotal / faster : null,
    fewerTransfers,
    newlyPossible,
    newlyPossiblePairs: newPerPair.size,
    biggest,
    newConnections,
    limits,
    minPairDistanceM: MIN_PAIR_DISTANCE_M,
  };
}
