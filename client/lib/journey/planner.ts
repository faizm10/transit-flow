/**
 * Timetable-aware earliest-arrival journey search.
 *
 * A round-based Connection Scan: round k finds the earliest arrival at every
 * stop using at most k vehicles, boarding only from stops reachable with k−1.
 * Running rounds up to `maxTransfers + 1` gives the earliest arrival with the
 * fewest vehicles among equally early options, and makes the transfer cap a
 * hard search limit rather than a post-filter.
 *
 *   - A vehicle can only be boarded at or after its scheduled departure.
 *   - Changing vehicles at the same stop needs `minTransferSec`; a walking
 *     change needs the walk time plus `walkTransferBufferSec` (and never less
 *     than `minTransferSec`).
 *   - Staying on the same trip needs no transfer time.
 *   - Only vehicles departing within `horizonSec` of the request are scanned.
 *
 * The origin and destination are points, not stops: any stop within
 * `maxAccessWalkM` can be walked to/from. That lets a custom route's new stop
 * be compared against the existing network, where the nearest GO stop may be
 * a walk away — or out of reach entirely.
 */

import { haversineM, walkSeconds } from "./network";
import {
  DEFAULT_LIMITS,
  type Journey,
  type JourneyLeg,
  type JourneyQuery,
  type PlanResult,
  type PlannerNetwork,
  type RideLeg,
  type SearchLimits,
} from "./types";

const INF = Number.POSITIVE_INFINITY;

const SRC_CARRY = 0;    // same as the previous round
const SRC_ACCESS = 1;   // walked (or zero-walk) from the origin
const SRC_TRANSFER = 2; // alighted at srcStop this round, then changed here

interface Round {
  /** Earliest arrival at each stop using exactly this round's vehicle. */
  arr: Float64Array;
  arrBoardConn: Int32Array;
  arrAlightConn: Int32Array;
  /** Earliest time a passenger is ready to board at each stop. */
  ready: Float64Array;
  readySrc: Uint8Array;
  readySrcStop: Int32Array;
}

export function planJourney(
  network: PlannerNetwork,
  query: JourneyQuery,
  limits: SearchLimits = DEFAULT_LIMITS,
): PlanResult {
  const { stops, connections, footpaths, trips } = network;
  const n = stops.length;
  const departSec = query.departSec;
  const horizonEnd = departSec + limits.horizonSec;

  if (haversineM(query.origin, query.destination) < 1) {
    return { found: false, reason: "same-place", limits };
  }

  // ── Access & egress ──────────────────────────────────────────────────────
  const accessWalk = new Map<number, { sec: number; m: number }>();
  const egressWalk = new Map<number, { sec: number; m: number }>();
  for (let i = 0; i < n; i++) {
    const dO = haversineM(query.origin, stops[i]);
    if (dO <= limits.maxAccessWalkM) {
      accessWalk.set(i, { sec: walkSeconds(dO, limits.walkSpeedMps), m: dO });
    }
    const dD = haversineM(stops[i], query.destination);
    if (dD <= limits.maxAccessWalkM) {
      egressWalk.set(i, { sec: walkSeconds(dD, limits.walkSpeedMps), m: dD });
    }
  }
  if (accessWalk.size === 0) return { found: false, reason: "no-stops-near-origin", limits };
  if (egressWalk.size === 0) return { found: false, reason: "no-stops-near-destination", limits };

  // ── Round 0: walk to nearby stops ────────────────────────────────────────
  const round0: Round = newRound(n);
  for (const [stop, w] of accessWalk) {
    round0.ready[stop] = departSec + w.sec;
    round0.readySrc[stop] = SRC_ACCESS;
  }

  // First connection we could possibly use.
  const firstConn = lowerBound(connections, departSec);
  let anyDeparture = false;
  for (let c = firstConn; c < connections.length && connections[c].dep <= horizonEnd; c++) {
    if (accessWalk.has(connections[c].from)) { anyDeparture = true; break; }
  }
  if (!anyDeparture) return { found: false, reason: "no-departures", limits };

  const rounds: Round[] = [round0];
  let bestArr = INF;
  let bestRound = -1;
  let bestEgressFrom = -1;

  const tripBoard = new Int32Array(trips.length);
  for (let k = 1; k <= limits.maxTransfers + 1; k++) {
    const prev = rounds[k - 1];
    const cur = newRound(n);
    cur.ready.set(prev.ready);
    tripBoard.fill(-1);
    let improved = false;

    for (let ci = firstConn; ci < connections.length; ci++) {
      const c = connections[ci];
      if (c.dep > horizonEnd) break;
      // Target pruning: nothing departing after the best arrival can help.
      if (c.dep >= bestArr) break;
      if (tripBoard[c.trip] === -1 && prev.ready[c.from] <= c.dep) tripBoard[c.trip] = ci;
      if (tripBoard[c.trip] !== -1 && c.arr < cur.arr[c.to]) {
        cur.arr[c.to] = c.arr;
        cur.arrBoardConn[c.to] = tripBoard[c.trip];
        cur.arrAlightConn[c.to] = ci;
        improved = true;
      }
    }
    if (!improved) break;

    // Transfers out of this round's arrivals become next round's boardings.
    for (let s = 0; s < n; s++) {
      const a = cur.arr[s];
      if (a === INF) continue;
      const same = a + limits.minTransferSec;
      if (same < cur.ready[s]) {
        cur.ready[s] = same;
        cur.readySrc[s] = SRC_TRANSFER;
        cur.readySrcStop[s] = s;
      }
      for (const fp of footpaths[s]) {
        const t = a + Math.max(limits.minTransferSec, fp.walkSec + limits.walkTransferBufferSec);
        if (t < cur.ready[fp.to]) {
          cur.ready[fp.to] = t;
          cur.readySrc[fp.to] = SRC_TRANSFER;
          cur.readySrcStop[fp.to] = s;
        }
      }
    }
    rounds.push(cur);

    for (const [s, w] of egressWalk) {
      const a = cur.arr[s];
      if (a === INF) continue;
      if (a + w.sec < bestArr) {
        bestArr = a + w.sec;
        bestRound = k;
        bestEgressFrom = s;
      }
    }
  }

  if (bestRound < 0) return { found: false, reason: "not-found", limits };

  const journey = reconstruct(network, query, rounds, bestRound, bestEgressFrom, accessWalk, egressWalk);
  return { found: true, journey, limits };
}

function newRound(n: number): Round {
  return {
    arr: new Float64Array(n).fill(INF),
    arrBoardConn: new Int32Array(n).fill(-1),
    arrAlightConn: new Int32Array(n).fill(-1),
    ready: new Float64Array(n).fill(INF),
    readySrc: new Uint8Array(n),
    readySrcStop: new Int32Array(n).fill(-1),
  };
}

function lowerBound(conns: { dep: number }[], t: number): number {
  let lo = 0;
  let hi = conns.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (conns[mid].dep < t) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function reconstruct(
  network: PlannerNetwork,
  query: JourneyQuery,
  rounds: Round[],
  bestRound: number,
  egressFrom: number,
  accessWalk: Map<number, { sec: number; m: number }>,
  egressWalk: Map<number, { sec: number; m: number }>,
): Journey {
  const { stops, connections, trips } = network;
  const legs: JourneyLeg[] = [];

  // Final walk to the destination.
  const egress = egressWalk.get(egressFrom)!;
  const finalArr = rounds[bestRound].arr[egressFrom];
  if (egress.m >= 1) {
    legs.push({
      kind: "walk",
      fromName: stops[egressFrom].name,
      toName: query.destination.name,
      depSec: finalArr,
      arrSec: finalArr + egress.sec,
      distanceM: egress.m,
    });
  }

  let k = bestRound;
  let stop = egressFrom;
  while (k > 0) {
    const r = rounds[k];
    const board = connections[r.arrBoardConn[stop]];
    const alight = connections[r.arrAlightConn[stop]];
    const trip = trips[board.trip];
    const ride: RideLeg = {
      kind: "ride",
      tripId: trip.id,
      routeName: trip.routeName,
      routeLabel: trip.routeLabel,
      color: trip.color,
      mode: trip.mode,
      source: trip.source,
      estimated: trip.estimated,
      fromName: stops[board.from].name,
      toName: stops[alight.to].name,
      depSec: board.dep,
      arrSec: alight.arr,
      stopCount: alight.seq + 1 - board.seq,
    };
    legs.push(ride);

    // Where did readiness at the boarding stop come from?
    let j = k - 1;
    const boardStop = board.from;
    while (j > 0 && rounds[j].readySrc[boardStop] === SRC_CARRY) j--;
    const src = rounds[j];
    if (j === 0) {
      const access = accessWalk.get(boardStop)!;
      if (access.m >= 1) {
        legs.push({
          kind: "walk",
          fromName: query.origin.name,
          toName: stops[boardStop].name,
          depSec: query.departSec,
          arrSec: query.departSec + access.sec,
          distanceM: access.m,
        });
      }
      k = 0;
    } else {
      const from = src.readySrcStop[boardStop];
      if (from !== boardStop) {
        const fp = network.footpaths[from].find((f) => f.to === boardStop)!;
        const t = src.arr[from];
        legs.push({
          kind: "walk",
          fromName: stops[from].name,
          toName: stops[boardStop].name,
          depSec: t,
          arrSec: t + fp.walkSec,
          distanceM: fp.distanceM,
        });
      }
      k = j;
      stop = from;
    }
  }

  legs.reverse();
  return summarize(legs, query.departSec);
}

function summarize(legs: JourneyLeg[], requestedDepartSec: number): Journey {
  const rides = legs.filter((l): l is RideLeg => l.kind === "ride");
  const last = legs[legs.length - 1];
  const arriveSec = last.arrSec;
  const inVehicleSec = rides.reduce((s, l) => s + (l.arrSec - l.depSec), 0);
  const walkSec = legs.reduce((s, l) => s + (l.kind === "walk" ? l.arrSec - l.depSec : 0), 0);
  const totalSec = arriveSec - requestedDepartSec;
  const services: string[] = [];
  for (const r of rides) if (services[services.length - 1] !== r.routeName) services.push(r.routeName);

  return {
    legs,
    requestedDepartSec,
    firstDepartSec: (rides[0] ?? legs[0]).depSec,
    arriveSec,
    totalSec,
    inVehicleSec,
    walkSec,
    waitSec: Math.max(0, totalSec - inVehicleSec - walkSec),
    transfers: Math.max(0, rides.length - 1),
    services,
    usesCustomRoute: rides.some((r) => r.source === "custom"),
    hasEstimates: legs.some((l) => l.kind === "walk" || l.estimated),
  };
}

// ── Comparison ───────────────────────────────────────────────────────────────

export type ComparisonVerdict =
  | "faster"        // custom network arrives earlier
  | "fewer-transfers"
  | "same"          // no difference in arrival or transfers
  | "unused"        // best journey doesn't use the custom route
  | "new-connection" // only the custom network finds a journey
  | "no-journey";   // neither finds one

export interface JourneyComparison {
  verdict: ComparisonVerdict;
  /** Positive = custom network saves this much (seconds). */
  timeSavedSec: number | null;
  transfersSaved: number | null;
}

export function compareJourneys(base: PlanResult, withRoute: PlanResult): JourneyComparison {
  if (!withRoute.found) {
    return { verdict: "no-journey", timeSavedSec: null, transfersSaved: null };
  }
  if (!base.found) {
    return { verdict: "new-connection", timeSavedSec: null, transfersSaved: null };
  }
  const b = base.journey;
  const w = withRoute.journey;
  const timeSavedSec = b.arriveSec - w.arriveSec;
  const transfersSaved = b.transfers - w.transfers;
  let verdict: ComparisonVerdict;
  if (!w.usesCustomRoute) verdict = "unused";
  else if (timeSavedSec > 0) verdict = "faster";
  else if (transfersSaved > 0) verdict = "fewer-transfers";
  else verdict = "same";
  return { verdict, timeSavedSec, transfersSaved };
}
