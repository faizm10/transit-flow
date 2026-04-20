import { NextRequest, NextResponse } from "next/server";
import { readFileSync } from "fs";
import { join } from "path";
import { colorForRoute } from "@/lib/routeColors";
import { SimTrip, SimStop, SimulationData } from "@/lib/simulation";

// ── Paths ─────────────────────────────────────────────────────────────────────
// GTFS raw files sit one level above the Next.js project root
const GTFS_DIR = join(process.cwd(), "../server/data/gotransit");
const PUBLIC_DIR = join(process.cwd(), "public/gotransit/derived");

const MAX_OUTPUT_TRIPS = 2000;   // raised to cover trains + buses
const MAX_SHAPE_POINTS = 300;

// ── Internal types ─────────────────────────────────────────────────────────────
interface StopInfo { lat: number; lon: number; name: string }
interface RouteInfo { shortName: string; longName: string; type: number }
interface RawTrip {
  route_short_name: string;
  route_long_name: string;
  route_type: number;
  trip_id: string;
  headsign: string;
  shape_id: string;
}
interface RawStopTime {
  stop_id: string;
  departure_secs: number;
  stop_sequence: number;
}
interface AppData {
  stops: Map<string, StopInfo>;
  shapesByShapeId: Map<string, [number, number][]>;
  tripsByServiceId: Map<string, RawTrip[]>;
}

// ── Module-level cache (populated once per server process) ────────────────────
let appData: AppData | null = null;
const stopTimesByServiceIdCache = new Map<string, Map<string, RawStopTime[]>>();

function gtfsTimeToSecs(t: string): number {
  const [h, m, s] = t.split(":").map(Number);
  return h * 3600 + m * 60 + (s || 0);
}

function parseLines(raw: string): string[] {
  return raw.replace(/^\uFEFF/, "").split(/\r?\n/).filter(Boolean);
}

function loadData(): AppData {
  if (appData) return appData;

  // 1 ── Stops
  const stops = new Map<string, StopInfo>();
  {
    const lines = parseLines(readFileSync(join(GTFS_DIR, "stops.txt"), "utf-8"));
    const h = lines[0].split(",");
    const iId = h.indexOf("stop_id"), iName = h.indexOf("stop_name");
    const iLat = h.indexOf("stop_lat"), iLon = h.indexOf("stop_lon");
    for (let i = 1; i < lines.length; i++) {
      const p = lines[i].split(",");
      if (p.length < 4) continue;
      stops.set(p[iId], { lat: parseFloat(p[iLat]), lon: parseFloat(p[iLon]), name: p[iName] });
    }
  }

  // 2 ── Route id → metadata  (e.g. "01260426-GT" → Kitchener rail)
  const routesById = new Map<string, RouteInfo>();
  {
    const lines = parseLines(readFileSync(join(GTFS_DIR, "routes.txt"), "utf-8"));
    const h = lines[0].split(",");
    const iId = h.indexOf("route_id"), iShort = h.indexOf("route_short_name");
    const iLong = h.indexOf("route_long_name"), iType = h.indexOf("route_type");
    for (let i = 1; i < lines.length; i++) {
      const p = lines[i].split(",");
      if (p.length < 2) continue;
      routesById.set(p[iId], {
        shortName: p[iShort],
        longName: p[iLong] ?? p[iShort],
        type: Number(p[iType] ?? 3),
      });
    }
  }

  // 3 ── Shapes from variant_lines.geojson indexed by shape_id
  const shapesByShapeId = new Map<string, [number, number][]>();
  {
    const gj = JSON.parse(readFileSync(join(PUBLIC_DIR, "variant_lines.geojson"), "utf-8")) as {
      features: { properties: { shape_id: string }; geometry: { coordinates: [number, number][] } }[];
    };
    for (const f of gj.features) {
      const sid = f.properties?.shape_id;
      if (sid && f.geometry?.coordinates && !shapesByShapeId.has(sid)) {
        shapesByShapeId.set(sid, f.geometry.coordinates);
      }
    }
  }

  // 4 ── Trips indexed by service_id
  const tripsByServiceId = new Map<string, RawTrip[]>();
  {
    const lines = parseLines(readFileSync(join(GTFS_DIR, "trips.txt"), "utf-8"));
    const h = lines[0].split(",");
    const iRouteId = h.indexOf("route_id"), iServiceId = h.indexOf("service_id");
    const iTripId = h.indexOf("trip_id"), iHeadsign = h.indexOf("trip_headsign");
    const iShapeId = h.indexOf("shape_id");
    for (let i = 1; i < lines.length; i++) {
      const p = lines[i].split(",");
      if (p.length < 5) continue;
      const serviceId = p[iServiceId];
      const routeInfo = routesById.get(p[iRouteId]);
      const shortName = routeInfo?.shortName ?? p[iRouteId].split("-").pop() ?? "";
      const trip: RawTrip = {
        route_short_name: shortName,
        route_long_name: routeInfo?.longName ?? shortName,
        route_type: routeInfo?.type ?? 3,
        trip_id: p[iTripId],
        headsign: p[iHeadsign],
        shape_id: p[iShapeId],
      };
      if (!tripsByServiceId.has(serviceId)) tripsByServiceId.set(serviceId, []);
      tripsByServiceId.get(serviceId)!.push(trip);
    }
  }

  appData = { stops, shapesByShapeId, tripsByServiceId };
  return appData;
}

function loadStopTimesForService(serviceId: string, tripsForDate: RawTrip[]): Map<string, RawStopTime[]> {
  const cached = stopTimesByServiceIdCache.get(serviceId);
  if (cached) return cached;

  const tripIdsForDate = new Set(tripsForDate.map((trip) => trip.trip_id));
  const stopTimesByTripId = new Map<string, RawStopTime[]>();
  const lines = parseLines(readFileSync(join(GTFS_DIR, "stop_times.txt"), "utf-8"));
  const h = lines[0].split(",");
  const iTripId = h.indexOf("trip_id"), iDepart = h.indexOf("departure_time");
  const iStopId = h.indexOf("stop_id"), iSeq = h.indexOf("stop_sequence");

  for (let i = 1; i < lines.length; i++) {
    const p = lines[i].split(",");
    if (p.length < 5) continue;
    const tripId = p[iTripId];
    if (!tripIdsForDate.has(tripId)) continue;

    const st: RawStopTime = {
      stop_id: p[iStopId],
      departure_secs: gtfsTimeToSecs(p[iDepart]),
      stop_sequence: parseInt(p[iSeq]),
    };
    if (!stopTimesByTripId.has(tripId)) stopTimesByTripId.set(tripId, []);
    stopTimesByTripId.get(tripId)!.push(st);
  }

  for (const times of stopTimesByTripId.values()) {
    times.sort((a, b) => a.stop_sequence - b.stop_sequence);
  }

  stopTimesByServiceIdCache.set(serviceId, stopTimesByTripId);
  return stopTimesByTripId;
}

// ── Shape helpers ─────────────────────────────────────────────────────────────
function cumDists(shape: [number, number][]): number[] {
  const d = [0];
  for (let i = 1; i < shape.length; i++) {
    const dx = shape[i][0] - shape[i - 1][0];
    const dy = shape[i][1] - shape[i - 1][1];
    d.push(d[i - 1] + Math.sqrt(dx * dx + dy * dy));
  }
  return d;
}

function projectStopFrac(
  lon: number, lat: number,
  shape: [number, number][], shapeDists: number[]
): number {
  const total = shapeDists[shapeDists.length - 1];
  if (total === 0) return 0;
  let minD2 = Infinity, bestFrac = 0;
  for (let i = 0; i < shape.length; i++) {
    const dx = shape[i][0] - lon, dy = shape[i][1] - lat;
    const d2 = dx * dx + dy * dy;
    if (d2 < minD2) { minD2 = d2; bestFrac = shapeDists[i] / total; }
  }
  return bestFrac;
}

function downsample<T>(arr: T[], max: number): T[] {
  if (arr.length <= max) return arr;
  const step = (arr.length - 1) / (max - 1);
  return Array.from({ length: max }, (_, i) => arr[Math.round(i * step)]);
}

function toHHMM(sec: number): string {
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

// ── Route handler ─────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const routesParam = p.get("routes") ?? "KI,LW,LE,BR,ST,RH,MI";
  const startParam  = p.get("start")  ?? "06:00";
  const endParam    = p.get("end")    ?? "22:00";
  const dateParam   = p.get("date")   ?? new Date().toISOString().split("T")[0];

  const requestedRoutes = new Set(routesParam.split(",").map(s => s.trim()).filter(Boolean));
  const startSec = gtfsTimeToSecs(startParam + ":00");
  const endSec   = gtfsTimeToSecs(endParam   + ":00");

  // service_id = date without dashes: "2026-04-18" → "20260418"
  const serviceId = dateParam.replace(/-/g, "");

  try {
    const { stops, shapesByShapeId, tripsByServiceId } = loadData();
    const tripsForDate = tripsByServiceId.get(serviceId) ?? [];
    const stopTimesByTripId = loadStopTimesForService(serviceId, tripsForDate);
    const trips: SimTrip[] = [];

    for (const raw of tripsForDate) {
      if (trips.length >= MAX_OUTPUT_TRIPS) break;
      if (!requestedRoutes.has(raw.route_short_name)) continue;

      const rawStopTimes = stopTimesByTripId.get(raw.trip_id);
      if (!rawStopTimes || rawStopTimes.length < 2) continue;

      const departSec = rawStopTimes[0].departure_secs;
      const arriveSec = rawStopTimes[rawStopTimes.length - 1].departure_secs;

      // Skip trips fully outside the requested time window
      if (departSec >= endSec || arriveSec <= startSec) continue;

      // Shape: from geojson by shape_id, else connect stop coordinates
      const rawShape = shapesByShapeId.get(raw.shape_id);
      const shape: [number, number][] = rawShape
        ? downsample(rawShape, MAX_SHAPE_POINTS)
        : downsample(
            rawStopTimes
              .map(st => { const s = stops.get(st.stop_id); return s ? [s.lon, s.lat] as [number, number] : null; })
              .filter((x): x is [number, number] => x !== null),
            MAX_SHAPE_POINTS
          );

      if (shape.length < 2) continue;

      const shapeDists = cumDists(shape);

      const timedStops: SimStop[] = rawStopTimes.map(st => {
        const stop = stops.get(st.stop_id);
        return {
          t: st.departure_secs,
          lat: stop?.lat ?? 0,
          lon: stop?.lon ?? 0,
          shapeFrac: stop ? projectStopFrac(stop.lon, stop.lat, shape, shapeDists) : 0,
          stop_name: stop?.name,
        };
      });

      // Enforce monotonic shape fractions (projection noise fix)
      for (let i = 1; i < timedStops.length; i++) {
        if (timedStops[i].shapeFrac < timedStops[i - 1].shapeFrac) {
          timedStops[i].shapeFrac = timedStops[i - 1].shapeFrac;
        }
      }

      trips.push({
        trip_id:          raw.trip_id,
        route_short_name: raw.route_short_name,
        route_long_name:  raw.headsign || raw.route_long_name,
        route_type:       raw.route_type,
        color:            colorForRoute(raw.route_short_name, raw.route_type),
        source:           "gotransit",
        stops:            timedStops,
        shape,
        start_stop_name:  stops.get(rawStopTimes[0].stop_id)?.name ?? "",
        end_stop_name:    stops.get(rawStopTimes[rawStopTimes.length - 1].stop_id)?.name ?? "",
        start_time:       toHHMM(departSec),
        end_time:         toHHMM(arriveSec),
        departSec,
        arriveSec,
      });
    }

    const result: SimulationData = { startSeconds: startSec, endSeconds: endSec, trips };

    return NextResponse.json(result, {
      headers: { "Cache-Control": "s-maxage=3600, stale-while-revalidate=300" },
    });
  } catch (err) {
    console.error("simulation API error:", err);
    return NextResponse.json({ error: "Failed to load simulation data" }, { status: 500 });
  }
}
