/**
 * Journey planner: timetable-aware routing on small synthetic networks.
 *
 * Every scenario builds its own network so a failure points at one rule —
 * departure times, minimum transfer time, walking transfers, service days,
 * custom-route schedules, search limits.
 *
 * Run: npm run test:node
 */

import { buildNetwork, dayOfWeek, haversineM as haversine, type GoTripsByDow } from "../../lib/journey/network";
import { compareJourneys, departureTimes, planJourney, sweepJourneys } from "../../lib/journey/planner";
import { journeyOverlay, overlayBounds } from "../../lib/journey/mapOverlay";
import { analyzeImpact, impactStations, MIN_PAIR_DISTANCE_M } from "../../lib/journey/impact";
import {
  DEFAULT_LIMITS,
  type JourneyPlace,
  type PlanResult,
  type PlannerStop,
  type PlannerTrip,
  type RideLeg,
} from "../../lib/journey/types";
import type { CustomRoute } from "../../lib/gtfs";

let failures = 0;
let checks = 0;

function check(label: string, ok: boolean, detail = ""): void {
  checks++;
  if (!ok) failures++;
  console.log(`${ok ? "  ok  " : " FAIL "} ${label}${detail ? ` — ${detail}` : ""}`);
}

const hm = (h: number, m = 0) => h * 3600 + m * 60;
const fmt = (s: number) =>
  `${String(Math.floor(s / 3600)).padStart(2, "0")}:${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}`;

// Stops on an east–west line ~1.6 km apart, plus B2 ~300 m north of B.
const LAT = 43.65;
const STOPS: PlannerStop[] = [
  { id: "A", name: "Alpha", lat: LAT, lon: -79.50 },
  { id: "B", name: "Bravo", lat: LAT, lon: -79.48 },
  { id: "B2", name: "Bravo North", lat: LAT + 0.0027, lon: -79.48 },
  { id: "C", name: "Charlie", lat: LAT, lon: -79.46 },
  { id: "D", name: "Delta", lat: LAT, lon: -79.44 },
];
const place = (id: string): JourneyPlace => {
  const s = STOPS.find((x) => x.id === id)!;
  return { name: s.name, lat: s.lat, lon: s.lon };
};

function trip(id: string, routeName: string, times: [string, number][]): PlannerTrip {
  return {
    id,
    routeName,
    routeLabel: routeName,
    color: "#000",
    mode: "train",
    source: "gotransit",
    estimated: false,
    stops: times.map(([stopId, t]) => ({ stopId, arr: t, dep: t })),
  };
}

const DATE = "2026-11-17"; // Tuesday

function plan(trips: PlannerTrip[], from: string, to: string, departSec: number, opts: {
  customRoutes?: CustomRoute[];
  date?: string;
  limits?: typeof DEFAULT_LIMITS;
  origin?: JourneyPlace;
} = {}): PlanResult {
  const limits = opts.limits ?? DEFAULT_LIMITS;
  const network = buildNetwork({
    date: opts.date ?? DATE,
    windowStartSec: departSec,
    windowEndSec: departSec + limits.horizonSec,
    extraStops: STOPS,
    extraTrips: trips,
    customRoutes: opts.customRoutes,
    maxTransferWalkM: limits.maxTransferWalkM,
    walkSpeedMps: limits.walkSpeedMps,
  });
  return planJourney(network, { origin: opts.origin ?? place(from), destination: place(to), departSec }, limits);
}

const rides = (r: PlanResult): RideLeg[] =>
  r.found ? r.journey.legs.filter((l): l is RideLeg => l.kind === "ride") : [];

// ── Direct journeys ────────────────────────────────────────────────────────
console.log("direct");
{
  const trips = [
    trip("t1", "LW", [["A", hm(8)], ["B", hm(8, 5)], ["C", hm(8, 10)]]),
    trip("t2", "LW", [["A", hm(8, 30)], ["B", hm(8, 35)], ["C", hm(8, 40)]]),
  ];
  const r = plan(trips, "A", "C", hm(7, 55));
  check("finds a direct journey", r.found);
  if (r.found) {
    const j = r.journey;
    check("boards the 08:00", j.firstDepartSec === hm(8), fmt(j.firstDepartSec));
    check("arrives 08:10", j.arriveSec === hm(8, 10), fmt(j.arriveSec));
    check("total = arrival − requested time", j.totalSec === 15 * 60, `${j.totalSec}s`);
    check("waits 5 min at the origin", j.waitSec === 5 * 60, `${j.waitSec}s`);
    check("in-vehicle 10 min", j.inVehicleSec === 10 * 60);
    check("no transfers", j.transfers === 0);
    check("services listed", j.services.join(",") === "LW");
    check("scheduled GO timings are not marked estimated", !j.hasEstimates);
    check("counts stops travelled", rides(r)[0]?.stopCount === 2, String(rides(r)[0]?.stopCount));
  }

  const late = plan(trips, "A", "C", hm(8, 1));
  check(
    "never boards a vehicle that has already left",
    late.found && late.journey.firstDepartSec === hm(8, 30),
    late.found ? fmt(late.journey.firstDepartSec) : "none",
  );

  const reverse = plan(trips, "C", "A", hm(7, 55));
  check("does not ride a trip backwards", !reverse.found && reverse.reason === "no-departures",
    reverse.found ? "found" : reverse.reason);
}

// ── Transfers ──────────────────────────────────────────────────────────────
console.log("transfers");
{
  const trips = [
    trip("t1", "LW", [["A", hm(8)], ["B", hm(8, 10)]]),
    trip("t2", "27", [["B", hm(8, 15)], ["D", hm(8, 30)]]),
  ];
  const r = plan(trips, "A", "D", hm(8));
  check("makes a 5-min same-stop transfer", r.found && r.journey.arriveSec === hm(8, 30));
  if (r.found) {
    check("one transfer", r.journey.transfers === 1);
    check("services in ride order", r.journey.services.join(",") === "LW,27", r.journey.services.join(","));
    check("transfer wait counted", r.journey.waitSec === 5 * 60, `${r.journey.waitSec}s`);
  }
}
{
  // Staying on the same vehicle needs no transfer time even with zero dwell.
  const trips = [trip("t1", "LW", [["A", hm(8)], ["B", hm(8, 10)], ["C", hm(8, 10)], ["D", hm(8, 20)]])];
  const r = plan(trips, "A", "D", hm(8));
  check("rides through a zero-dwell stop on one trip", r.found && r.journey.transfers === 0 && r.journey.arriveSec === hm(8, 20));
}
{
  // Same arrival either way: prefer the journey with fewer vehicles.
  const trips = [
    trip("t1", "LW", [["A", hm(8)], ["B", hm(8, 5)]]),
    trip("t2", "27", [["B", hm(8, 10)], ["D", hm(8, 30)]]),
    trip("t3", "KI", [["A", hm(8, 2)], ["D", hm(8, 30)]]),
  ];
  const r = plan(trips, "A", "D", hm(8));
  check("ties go to fewer transfers", r.found && r.journey.transfers === 0 && r.journey.services[0] === "KI",
    r.found ? r.journey.services.join(",") : "none");
}
{
  // Walking transfer between nearby stops: ~300 m → 312 s walk + 60 s buffer.
  const make = (depMin: number) => [
    trip("t1", "LW", [["A", hm(8)], ["B", hm(8, 10)]]),
    trip("t2", "27", [["B2", hm(8, depMin)], ["D", hm(8, 40)]]),
  ];
  const ok = plan(make(17), "A", "D", hm(8));
  check("walks between nearby stops to transfer", ok.found && ok.journey.transfers === 1);
  if (ok.found) {
    const walk = ok.journey.legs.find((l) => l.kind === "walk");
    check("walking transfer leg included", walk?.kind === "walk" && walk.distanceM > 250 && walk.distanceM < 350,
      walk?.kind === "walk" ? `${Math.round(walk.distanceM)} m` : "no walk");
    check("walking marks the journey as estimated", ok.journey.hasEstimates);
  }
  const tight = plan(make(15), "A", "D", hm(8));
  check("walking transfer shorter than walk + buffer is missed", !tight.found,
    tight.found ? fmt(tight.journey.arriveSec) : tight.reason);
}

// ── Missed connections ─────────────────────────────────────────────────────
console.log("missed connections");
{
  const trips = [
    trip("t1", "LW", [["A", hm(8)], ["B", hm(8, 10)]]),
    trip("t2", "27", [["B", hm(8, 12)], ["D", hm(8, 25)]]), // 2 min < 3 min min transfer
    trip("t3", "27", [["B", hm(8, 45)], ["D", hm(8, 58)]]),
  ];
  const r = plan(trips, "A", "D", hm(8));
  check("misses a connection shorter than the minimum transfer time", r.found && r.journey.arriveSec === hm(8, 58),
    r.found ? fmt(r.journey.arriveSec) : r.reason);
  if (r.found) check("waits for the next connection", r.journey.waitSec === 35 * 60, `${r.journey.waitSec}s`);

  const exact = plan([trips[0], trip("t2", "27", [["B", hm(8, 13)], ["D", hm(8, 25)]])], "A", "D", hm(8));
  check("makes a connection of exactly the minimum transfer time", exact.found && exact.journey.arriveSec === hm(8, 25));

  const none = plan(trips.slice(0, 2), "A", "D", hm(8));
  check("reports not-found when the only connection is missed", !none.found && none.reason === "not-found",
    none.found ? "found" : none.reason);
}

// ── Search limits ──────────────────────────────────────────────────────────
console.log("limits");
{
  const trips = [trip("t1", "LW", [["A", hm(13)], ["C", hm(13, 20)]])];
  const r = plan(trips, "A", "C", hm(8));
  check("ignores departures beyond the search horizon", !r.found && r.reason === "no-departures",
    r.found ? "found" : r.reason);

  const chain = [
    trip("t1", "a", [["A", hm(8)], ["B", hm(8, 5)]]),
    trip("t2", "b", [["B", hm(8, 10)], ["C", hm(8, 15)]]),
    trip("t3", "c", [["C", hm(8, 20)], ["D", hm(8, 25)]]),
  ];
  const capped = plan(chain, "A", "D", hm(8), { limits: { ...DEFAULT_LIMITS, maxTransfers: 1 } });
  check("respects the transfer cap", !capped.found && capped.reason === "not-found");
  const uncapped = plan(chain, "A", "D", hm(8));
  check("finds the 2-transfer journey within the default cap", uncapped.found && uncapped.journey.transfers === 2);

  const far: JourneyPlace = { name: "Nowhere", lat: 44.5, lon: -80.5 };
  const nowhere = plan(chain, "A", "D", hm(8), { origin: far });
  check("explains when no stop is within walking distance", !nowhere.found && nowhere.reason === "no-stops-near-origin");
}

// ── Service days ───────────────────────────────────────────────────────────
console.log("service days");
{
  const goStops = Object.fromEntries(STOPS.map((s) => [s.id, { lat: s.lat, lon: s.lon, name: s.name }]));
  const goTrips: GoTripsByDow = {
    // Monday service with a trip running past midnight (25:00 = 01:00 Tue).
    "1": [{ trip_id: "late", route_short_name: "LW", route_long_name: "LW", route_type: 2,
      stops: [{ stop_id: "A", t: hm(25), seq: 1 }, { stop_id: "C", t: hm(25, 20), seq: 2 }] }],
    // Tuesday service.
    "2": [{ trip_id: "tue", route_short_name: "LW", route_long_name: "LW", route_type: 2,
      stops: [{ stop_id: "A", t: hm(9), seq: 1 }, { stop_id: "C", t: hm(9, 20), seq: 2 }] }],
  };
  check("test date is a Tuesday", dayOfWeek(DATE) === 2);
  const run = (date: string, departSec: number) => {
    const network = buildNetwork({
      date, windowStartSec: departSec, windowEndSec: departSec + DEFAULT_LIMITS.horizonSec,
      goTrips, goStops, maxTransferWalkM: 500, walkSpeedMps: 1.2,
    });
    return planJourney(network, { origin: place("A"), destination: place("C"), departSec });
  };
  const overnight = run(DATE, hm(0, 30));
  check("uses the previous service day's after-midnight trip", overnight.found && overnight.journey.firstDepartSec === hm(1),
    overnight.found ? fmt(overnight.journey.firstDepartSec) : overnight.reason);
  const tue = run(DATE, hm(8));
  check("uses the selected date's weekday service", tue.found && tue.journey.firstDepartSec === hm(9));
  const wed = run("2026-11-18", hm(8));
  check("does not use another weekday's service", !wed.found);
}

// ── Custom routes ──────────────────────────────────────────────────────────
console.log("custom routes");
{
  const X = { id: "x", name: "New Town", lat: LAT + 0.05, lon: -79.48, sequence: 1 };
  const atB = { id: "xb", name: "Bravo (custom)", lat: LAT, lon: -79.48, sequence: 2 };
  const band = (sh: number, eh: number, headwayMins: number) =>
    ({ id: "b", label: "Peak", startHour: sh, startMin: 0, endHour: eh, endMin: 0, headwayMins });
  const banded: CustomRoute = {
    id: "r1", name: "Spur", color: "#f0f", type: "bus", createdAt: "", stops: [X, atB],
    schedule: {
      type: "banded", direction: "one-way",
      weekday: { active: true, bands: [band(6, 10, 15)] },
      saturday: { active: false, bands: [] },
      sunday: { active: false, bands: [] },
    },
  };
  const goOn = [trip("t1", "LW", [["B", hm(8, 40)], ["D", hm(8, 55)]])];
  const origin: JourneyPlace = { name: X.name, lat: X.lat, lon: X.lon };

  const base = plan(goOn, "B", "D", hm(8, 5), { origin });
  check("existing network can't reach a new stop 5.5 km away", !base.found && base.reason === "no-stops-near-origin",
    base.found ? "found" : base.reason);

  const withRoute = plan(goOn, "B", "D", hm(8, 5), { origin, customRoutes: [banded] });
  check("custom route makes the journey possible", withRoute.found);
  if (withRoute.found) {
    const [first, second] = rides(withRoute);
    check("boards at the next frequency slot (08:15)", first?.depSec === hm(8, 15), first ? fmt(first.depSec) : "none");
    check("custom ride is labelled estimated", first?.source === "custom" && first.estimated);
    check("connects onto GO", second?.routeName === "LW" && withRoute.journey.transfers === 1);
    check("journey flagged as using the custom route", withRoute.journey.usesCustomRoute);
  }
  const cmp = compareJourneys(base, withRoute);
  check("comparison reports a new connection", cmp.verdict === "new-connection", cmp.verdict);

  const sunday = plan(goOn, "B", "D", hm(8, 5), { origin, customRoutes: [banded], date: "2026-11-22" });
  check("inactive service day has no custom trips", !sunday.found && sunday.reason === "no-departures",
    sunday.found ? "found" : sunday.reason);

  const fixed: CustomRoute = {
    ...banded, id: "r2",
    schedule: { type: "fixed", direction: "one-way", fixedDepartures: ["07:00", "08:20"] },
  };
  const f = plan(goOn, "B", "D", hm(8, 5), { origin, customRoutes: [fixed] });
  check("fixed departures are respected", f.found && rides(f)[0]?.depSec === hm(8, 20),
    f.found ? fmt(rides(f)[0]?.depSec ?? 0) : f.reason);

  const twoWay: CustomRoute = {
    ...banded, id: "r3",
    schedule: { type: "fixed", direction: "two-way", fixedDepartures: ["08:00"], returnDepartures: ["09:00"] },
  };
  // Bravo → New Town rides the return direction, which leaves Bravo at 09:00.
  const network = buildNetwork({
    date: DATE, windowStartSec: hm(8, 30), windowEndSec: hm(12, 30),
    extraStops: STOPS, customRoutes: [twoWay], maxTransferWalkM: 500, walkSpeedMps: 1.2,
  });
  const back = planJourney(network, { origin: place("B"), destination: origin, departSec: hm(8, 30) });
  check("return direction runs on its own departures", back.found && rides(back)[0]?.depSec === hm(9),
    back.found ? fmt(rides(back)[0]?.depSec ?? 0) : back.reason);
}
{
  // A custom shortcut that beats GO, and one that doesn't help.
  const shortcut: CustomRoute = {
    id: "fast", name: "Express", color: "#0f0", type: "train", createdAt: "",
    stops: [
      { id: "s1", name: "Alpha", lat: LAT, lon: -79.50, sequence: 1 },
      { id: "s2", name: "Delta", lat: LAT, lon: -79.44, sequence: 2 },
    ],
    schedule: { type: "fixed", direction: "one-way", fixedDepartures: ["08:05"] },
  };
  const go = [trip("slow", "LW", [["A", hm(8)], ["B", hm(8, 20)], ["C", hm(8, 40)], ["D", hm(9)]])];
  const base = plan(go, "A", "D", hm(8));
  const withRoute = plan(go, "A", "D", hm(8), { customRoutes: [shortcut] });
  const cmp = compareJourneys(base, withRoute);
  check("faster custom route is chosen and reported", cmp.verdict === "faster" && (cmp.timeSavedSec ?? 0) > 0,
    `${cmp.verdict} ${cmp.timeSavedSec}s`);

  const late: CustomRoute = { ...shortcut, schedule: { type: "fixed", direction: "one-way", fixedDepartures: ["10:00"] } };
  const cmp2 = compareJourneys(base, plan(go, "A", "D", hm(8), { customRoutes: [late] }));
  check("custom route that doesn't help is reported as unused", cmp2.verdict === "unused" && cmp2.timeSavedSec === 0,
    cmp2.verdict);
}

// ── Map geometry ───────────────────────────────────────────────────────────
console.log("map geometry");
{
  const trips = [
    trip("t1", "LW", [["A", hm(8)], ["B", hm(8, 5)], ["C", hm(8, 10)], ["D", hm(8, 15)]]),
  ];
  const r = plan(trips, "B", "D", hm(8));
  const ride = rides(r)[0];
  check("ride path covers boarding to alighting stops only",
    ride?.path.length === 3 && ride.path[0][0] === -79.48 && ride.path[2][0] === -79.44,
    JSON.stringify(ride?.path));
  if (r.found) {
    const fc = journeyOverlay([{ scenario: "with", journey: r.journey }, { scenario: "base", journey: null }]);
    const lines = fc.features.filter((f) => f.geometry.type === "LineString");
    const points = fc.features.filter((f) => f.geometry.type === "Point");
    check("overlay has one line per leg and start/end points", lines.length === 1 && points.length === 2,
      `${lines.length} lines, ${points.length} points`);
    const b = overlayBounds(fc);
    check("overlay bounds span the journey", b !== null && b[0][0] === -79.48 && b[1][0] === -79.44);
  }
  check("empty overlay has no bounds", overlayBounds(journeyOverlay([])) === null);
}

// ── Departure sweep ────────────────────────────────────────────────────────
console.log("sweep");
{
  check("departure times are inclusive and stepped", departureTimes(hm(8), hm(9), 15 * 60).length === 5);
  check("departure times are capped", departureTimes(0, hm(24), 60).length === 200);

  const go = [
    trip("s1", "LW", [["A", hm(8)], ["D", hm(9)]]),
    trip("s2", "LW", [["A", hm(9)], ["D", hm(10)]]),
  ];
  const express: CustomRoute = {
    id: "ex", name: "Express", color: "#0f0", type: "train", createdAt: "",
    stops: [
      { id: "e1", name: "Alpha", lat: LAT, lon: -79.50, sequence: 1 },
      { id: "e2", name: "Delta", lat: LAT, lon: -79.44, sequence: 2 },
    ],
    schedule: { type: "fixed", direction: "one-way", fixedDepartures: ["08:00"] },
  };
  const window = { date: DATE, windowStartSec: hm(7, 30), windowEndSec: hm(8, 30) + DEFAULT_LIMITS.horizonSec,
    extraStops: STOPS, extraTrips: go, maxTransferWalkM: 500, walkSpeedMps: 1.2 };
  const baseNet = buildNetwork(window);
  const withNet = buildNetwork({ ...window, customRoutes: [express] });
  const { rows, summary } = sweepJourneys(baseNet, withNet,
    { origin: place("A"), destination: place("D") }, departureTimes(hm(7, 30), hm(8, 30), 30 * 60));
  check("sweep returns one row per departure", rows.length === 3);
  check("only the 07:30 and 08:00 departures can use the 08:00 express",
    rows[0].verdict === "faster" && rows[1].verdict === "faster" && rows[2].verdict === "unused",
    rows.map((r) => r.verdict).join(","));
  check("summary counts improved departures", summary.improved === 2 && summary.newConnections === 0);
  check("summary max saving is the biggest single saving",
    summary.maxSavedSec === Math.max(...rows.map((r) => r.timeSavedSec ?? 0)));
  const sweepMatchesSingle = rows.every((row) => {
    const single = plan(go, "A", "D", row.departSec, { customRoutes: [express] });
    return single.found && single.journey.totalSec === row.withTotalSec;
  });
  check("sweep results match individual searches", sweepMatchesSingle);
}

// ── Network impact ─────────────────────────────────────────────────────────
console.log("network impact");
{
  const st = (lon: number, name: string, dLat = 0) => ({ lat: LAT + dLat, lon, name });
  const goStops = {
    AA: st(-79.50, "Alpha GO"),
    BB: st(-79.48, "Bravo GO"),
    CC: st(-79.46, "Charlie GO"),
    DD: st(-79.44, "Delta GO"),
    DE: st(-79.434, "Delta East GO"), // ~480 m from Delta: walkable, so DD↔DE isn't tested
    "00001": st(-79.481, "Bravo GO Bus"), // numeric id = bus stop, not a station
  };
  const t = (id: string, stops: [string, number][]) => ({
    trip_id: id, route_short_name: "LW", route_long_name: "LW", route_type: 2,
    stops: stops.map(([stop_id, time], i) => ({ stop_id, t: time, seq: i + 1 })),
  });
  // Alpha → Delta needs a change at Bravo on the existing network.
  const goTrips: GoTripsByDow = {
    "2": [
      t("a1", [["AA", hm(8)], ["BB", hm(8, 20)]]),
      t("b1", [["BB", hm(8, 25)], ["CC", hm(8, 40)], ["DD", hm(9)]]),
      t("a2", [["AA", hm(8, 30)], ["BB", hm(8, 50)]]),
      t("b2", [["BB", hm(8, 55)], ["CC", hm(9, 10)], ["DD", hm(9, 30)]]),
    ],
  };
  // Express Alpha → Delta → New Town (a new place no GO stop reaches).
  const express: CustomRoute = {
    id: "imp", name: "Express", color: "#0f0", type: "train", createdAt: "",
    stops: [
      { id: "x1", name: "Alpha GO", lat: LAT, lon: -79.50, sequence: 1 },
      { id: "x2", name: "Delta GO", lat: LAT, lon: -79.44, sequence: 2 },
      { id: "x3", name: "New Town", lat: LAT + 0.05, lon: -79.44, sequence: 3 },
    ],
    schedule: { type: "fixed", direction: "one-way", fixedDepartures: ["08:05", "08:35"] },
  };
  const departures = [hm(7, 50), hm(8, 10)];
  const common = {
    date: DATE, windowStartSec: departures[0], windowEndSec: departures[1] + DEFAULT_LIMITS.horizonSec,
    goTrips, goStops, maxTransferWalkM: 500, walkSpeedMps: 1.2,
  };
  const baseNet = buildNetwork(common);
  const withNet = buildNetwork({ ...common, customRoutes: [express] });
  const stations = impactStations(goStops, express);

  check("stations are GO rail stations plus new route stops",
    stations.filter((x) => x.source === "go").length === 5 && stations.filter((x) => x.source === "route").map((x) => x.name).join() === "New Town",
    stations.map((x) => x.name).join(", "));

  let progressCalls = 0;
  const report = analyzeImpact(baseNet, withNet, stations, departures, DEFAULT_LIMITS, () => progressCalls++);
  check("reports progress once per origin and departure", progressCalls === stations.length * departures.length);
  check("skips walkable pairs", report.pairs === 6 * 5 - 2, `${report.pairs} pairs`);
  check("tests every pair at every departure", report.journeysTested === report.pairs * departures.length);

  // Brute force: plan every pair at every departure and count the same things.
  let faster = 0, fewer = 0, newly = 0, before = 0, saved = 0;
  for (const o of stations) for (const d of stations) {
    if (o === d || haversine(o, d) < MIN_PAIR_DISTANCE_M) continue;
    for (const dep of departures) {
      const q = { origin: o, destination: d, departSec: dep };
      const b = planJourney(baseNet, q);
      const w = planJourney(withNet, q);
      if (b.found) before++;
      if (!b.found && w.found) newly++;
      if (b.found && w.found) {
        const s2 = b.journey.arriveSec - w.journey.arriveSec;
        if (s2 > 0) { faster++; saved += s2; }
        if (w.journey.transfers < b.journey.transfers) fewer++;
      }
    }
  }
  check("faster count matches individual searches", report.faster === faster && faster > 0, `${report.faster} vs ${faster}`);
  check("average saving matches individual searches",
    report.avgSavedSec !== null && Math.abs(report.avgSavedSec - saved / faster) < 1e-6);
  check("fewer-transfer count matches individual searches", report.fewerTransfers === fewer && fewer > 0,
    `${report.fewerTransfers} vs ${fewer}`);
  check("newly-possible count matches individual searches", report.newlyPossible === newly && newly > 0,
    `${report.newlyPossible} vs ${newly}`);
  check("existing-network count matches individual searches", report.journeysPossibleBefore === before);

  const top = report.biggest[0];
  check("biggest improvement is Alpha → Delta", top?.from === "Alpha GO" && top.to === "Delta GO", `${top?.from} → ${top?.to}`);
  check("biggest improvement lists services before and after",
    top?.baseServices.join(">") === "LW" && top.withServices.join(">") === "Express" && top.baseTransfers === 1 && top.withTransfers === 0,
    `${top?.baseServices.join(">")} → ${top?.withServices.join(">")}`);
  check("improvements are marked estimated when they use the custom route", top?.estimated === true);
  check("improvements are sorted by time saved",
    report.biggest.every((b, i, a) => i === 0 || a[i - 1].savedSec >= b.savedSec));
  check("one row per station pair in the improvement list",
    new Set(report.biggest.map((b) => `${b.from}>${b.to}`)).size === report.biggest.length);
  const toNewTown = report.newConnections.filter((c) => c.to === "New Town").map((c) => c.from).sort();
  check("journeys to the new stop become possible", toNewTown.includes("Alpha GO") && toNewTown.includes("Delta GO"),
    toNewTown.join(", "));
  check("newly-possible rows count departures within the window",
    report.newConnections.every((c) => c.departures >= 1 && c.departures <= departures.length));
  check("no journeys from New Town on a one-way route",
    report.newConnections.every((c) => c.from !== "New Town"));

  const noop = analyzeImpact(baseNet, baseNet, stations, departures);
  check("a network compared with itself changes nothing",
    noop.faster === 0 && noop.fewerTransfers === 0 && noop.newlyPossible === 0 && noop.biggest.length === 0);
}

console.log(`\n${checks - failures}/${checks} checks passed`);
if (failures > 0) process.exit(1);
