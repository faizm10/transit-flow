/**
 * Journey planner: timetable-aware routing on small synthetic networks.
 *
 * Every scenario builds its own network so a failure points at one rule —
 * departure times, minimum transfer time, walking transfers, service days,
 * custom-route schedules, search limits.
 *
 * Run: npm run test:node
 */

import { buildNetwork, dayOfWeek, type GoTripsByDow } from "../../lib/journey/network";
import { compareJourneys, planJourney } from "../../lib/journey/planner";
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

console.log(`\n${checks - failures}/${checks} checks passed`);
if (failures > 0) process.exit(1);
