/**
 * Compares journeys on the existing GO network against the same network with
 * one custom route added: one departure, a sweep across a time range, or a
 * whole-network station-to-station impact report.
 *
 * Runs off the main thread: the GO timetable is ~9 MB of JSON, and parsing it
 * plus compiling connections would stall the map. The parsed timetable is kept
 * for the worker's lifetime, so only the first test pays for the download.
 */

import { buildNetwork, type GoStopsLookup, type GoTripsByDow } from "../journey/network";
import { analyzeImpact, impactStations } from "../journey/impact";
import { compareJourneys, departureTimes, planJourney, sweepJourneys } from "../journey/planner";
import type { FeedBasis, JourneyRequest, JourneyResult, JourneyWorkerMessage } from "../journey/protocol";
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

self.onmessage = (event: MessageEvent<JourneyRequest>) => {
  const req = event.data;
  void (async () => {
    post({ type: "progress", id: req.id, phase: "Loading GO timetable" });
    const go = await loadGoData();

    post({ type: "progress", id: req.id, phase: "Finding journeys" });
    const limits = DEFAULT_LIMITS;
    const firstSec = req.kind === "single" ? req.departSec : req.startSec;
    const lastSec = req.kind === "single" ? req.departSec : req.endSec;
    const common = {
      date: req.date,
      windowStartSec: firstSec,
      windowEndSec: lastSec + limits.horizonSec,
      goTrips: go.trips,
      goStops: go.stops,
      maxTransferWalkM: limits.maxTransferWalkM,
      walkSpeedMps: limits.walkSpeedMps,
    };
    const baseNetwork = buildNetwork(common);
    const withNetwork = buildNetwork({ ...common, customRoutes: [req.route] });
    let result: JourneyResult;
    if (req.kind === "impact") {
      const departures = departureTimes(req.startSec, req.endSec, req.stepSec);
      let lastPct = -1;
      const report = analyzeImpact(
        baseNetwork,
        withNetwork,
        impactStations(go.stops, req.route),
        departures,
        limits,
        (done, total) => {
          const pct = Math.floor((done / total) * 20) * 5;
          if (pct === lastPct) return;
          lastPct = pct;
          post({ type: "progress", id: req.id, phase: "Comparing station-to-station journeys", fraction: done / total });
        },
      );
      result = { kind: "impact", report, feed: go.feed };
    } else if (req.kind === "single") {
      const place = { origin: req.origin, destination: req.destination };
      const query = { ...place, departSec: req.departSec };
      const base = planJourney(baseNetwork, query, limits);
      const withRoute = planJourney(withNetwork, query, limits);
      result = { kind: "single", base, withRoute, comparison: compareJourneys(base, withRoute), feed: go.feed };
    } else {
      const place = { origin: req.origin, destination: req.destination };
      const departures = departureTimes(req.startSec, req.endSec, req.stepSec);
      const { rows, summary } = sweepJourneys(baseNetwork, withNetwork, place, departures, limits);
      result = { kind: "sweep", rows, summary, limits, feed: go.feed };
    }
    post({ type: "result", id: req.id, result });
  })().catch((err: unknown) =>
    post({
      type: "error",
      id: req.id,
      message: err instanceof Error ? err.message : "Journey search failed",
    }),
  );
};
