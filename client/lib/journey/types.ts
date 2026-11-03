/**
 * Journey planner types.
 *
 * The planner is independent of the vehicle animation: it consumes timetables
 * (GO derived trips + expanded custom-route trips) and never touches shapes or
 * map state. All times are seconds on the *query* service day's clock: the
 * previous day's after-midnight trips are shifted back by 24 h, and the next
 * day's trips start at 86 400+.
 */

export interface PlannerStop {
  id: string;
  name: string;
  lat: number;
  lon: number;
}

export interface PlannerTripStop {
  stopId: string;
  arr: number;
  dep: number;
}

export interface PlannerTrip {
  id: string;
  /** Short service name, e.g. "LW", "27", or the custom route name. */
  routeName: string;
  /** Longer label, e.g. headsign or route description. */
  routeLabel: string;
  color: string;
  mode: "train" | "bus";
  source: "gotransit" | "custom";
  /** True when stop times are derived (speed estimate) rather than scheduled. */
  estimated: boolean;
  stops: PlannerTripStop[];
}

export interface Footpath {
  to: number;
  walkSec: number;
  distanceM: number;
}

/** A compiled, query-ready network. Build with `buildNetwork`. */
export interface PlannerNetwork {
  stops: PlannerStop[];
  stopIndex: Map<string, number>;
  trips: PlannerTrip[];
  /** Elementary connections, sorted by departure. */
  connections: Connection[];
  /** Walking links between nearby stops (one hop, symmetric). */
  footpaths: Footpath[][];
}

export interface Connection {
  trip: number;
  from: number;
  to: number;
  dep: number;
  arr: number;
  /** Index of `from` within the trip's stop list. */
  seq: number;
}

/** A place a journey starts or ends — a stop or any point on the map. */
export interface JourneyPlace {
  name: string;
  lat: number;
  lon: number;
}

export interface JourneyQuery {
  origin: JourneyPlace;
  destination: JourneyPlace;
  /** Requested departure, seconds after midnight of the service date. */
  departSec: number;
}

export interface SearchLimits {
  /** Only vehicles departing within this long after the requested time. */
  horizonSec: number;
  maxTransfers: number;
  /** Max walk from the origin / to the destination. */
  maxAccessWalkM: number;
  /** Max walk between two stops when changing vehicles. */
  maxTransferWalkM: number;
  /** Minimum time to change vehicles at the same stop. */
  minTransferSec: number;
  /** Extra slack added on top of walking time for a walking transfer. */
  walkTransferBufferSec: number;
  walkSpeedMps: number;
}

export const DEFAULT_LIMITS: SearchLimits = {
  horizonSec: 4 * 3600,
  maxTransfers: 3,
  maxAccessWalkM: 1000,
  maxTransferWalkM: 500,
  minTransferSec: 3 * 60,
  walkTransferBufferSec: 60,
  walkSpeedMps: 1.2,
};

export interface WalkLeg {
  kind: "walk";
  fromName: string;
  toName: string;
  depSec: number;
  arrSec: number;
  distanceM: number;
}

export interface RideLeg {
  kind: "ride";
  tripId: string;
  routeName: string;
  routeLabel: string;
  color: string;
  mode: "train" | "bus";
  source: "gotransit" | "custom";
  estimated: boolean;
  fromName: string;
  toName: string;
  depSec: number;
  arrSec: number;
  /** Number of stops travelled (alight index − board index). */
  stopCount: number;
}

export type JourneyLeg = WalkLeg | RideLeg;

export interface Journey {
  legs: JourneyLeg[];
  /** The requested departure time. */
  requestedDepartSec: number;
  /** When the first vehicle leaves (or the walk starts, for walk-only). */
  firstDepartSec: number;
  arriveSec: number;
  /** Arrival minus requested departure. */
  totalSec: number;
  inVehicleSec: number;
  walkSec: number;
  /** Time spent standing still: initial wait + transfer waits. */
  waitSec: number;
  transfers: number;
  /** Distinct services in ride order, e.g. ["LW", "My route"]. */
  services: string[];
  usesCustomRoute: boolean;
  /** Any leg relies on estimated timings (custom speed estimate or walking). */
  hasEstimates: boolean;
}

export type NoJourneyReason =
  | "same-place"
  | "no-stops-near-origin"
  | "no-stops-near-destination"
  | "no-departures"
  | "not-found";

export type PlanResult =
  | { found: true; journey: Journey; limits: SearchLimits }
  | { found: false; reason: NoJourneyReason; limits: SearchLimits };
