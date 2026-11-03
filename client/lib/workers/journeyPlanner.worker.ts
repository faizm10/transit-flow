/**
 * Compares a journey on the existing GO network against the same network with
 * one custom route added.
 *
 * Runs off the main thread: the GO timetable is ~9 MB of JSON, and parsing it
 * plus compiling connections would stall the map. The parsed timetable is kept
 * for the worker's lifetime, so only the first test pays for the download.
 */

import { buildNetwork, type GoStopsLookup, type GoTripsByDow } from "../journey/network";
import { compareJourneys, planJourney } from "../journey/planner";
import type { FeedBasis, JourneyTestRequest, JourneyWorkerMessage } from "../journey/protocol";
import { DEFAULT_LIMITS } from "../journey/types";

const post = (msg: JourneyWorkerMessage) =>
  (self as unknown as { postMessage(m: unknown): void }).postMessage(msg);

const DERIVED = "/gotransit/derived";

interface GoData {
  trips: GoTripsByDow;
  stops: GoStopsLookup;
  feed: FeedBasis | null;
}

let goData: Promise<GoData> | null = null;

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(`${DERIVED}/${path}`);
  if (!res.ok) throw new Error(`Could not load ${path} (${res.status})`);
  return res.json() as Promise<T>;
}

function loadGoData(): Promise<GoData> {
  goData ??= Promise.all([
    fetchJson<GoTripsByDow>("sim_trips_by_dow.json"),
    fetchJson<GoStopsLookup>("stops_lookup.json"),
    fetchJson<{ start_date: string; end_date: string; service_dates: string[] }>("trip_count_basis.json")
      .then((b) => ({ startDate: b.start_date, endDate: b.end_date, serviceDates: b.service_dates }))
      .catch(() => null),
  ]).then(([trips, stops, feed]) => ({ trips, stops, feed }));
  // Let a failed download be retried by the next request.
  goData.catch(() => { goData = null; });
  return goData;
}

self.onmessage = (event: MessageEvent<JourneyTestRequest>) => {
  const req = event.data;
  void (async () => {
    post({ type: "progress", id: req.id, phase: "Loading GO timetable" });
    const go = await loadGoData();

    post({ type: "progress", id: req.id, phase: "Finding journeys" });
    const limits = DEFAULT_LIMITS;
    const common = {
      date: req.date,
      windowStartSec: req.departSec,
      windowEndSec: req.departSec + limits.horizonSec,
      goTrips: go.trips,
      goStops: go.stops,
      maxTransferWalkM: limits.maxTransferWalkM,
      walkSpeedMps: limits.walkSpeedMps,
    };
    const query = { origin: req.origin, destination: req.destination, departSec: req.departSec };

    const base = planJourney(buildNetwork(common), query, limits);
    const withRoute = planJourney(buildNetwork({ ...common, customRoutes: [req.route] }), query, limits);

    post({
      type: "result",
      id: req.id,
      base,
      withRoute,
      comparison: compareJourneys(base, withRoute),
      feed: go.feed,
    });
  })().catch((err: unknown) =>
    post({
      type: "error",
      id: req.id,
      message: err instanceof Error ? err.message : "Journey search failed",
    }),
  );
};
