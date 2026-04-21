import { NextRequest, NextResponse } from "next/server";
import { readFileSync } from "fs";
import { join } from "path";
import { colorForRoute } from "@/lib/routeColors";
import { SimTrip, SimStop, SimulationData } from "@/lib/simulation";

const DERIVED_DIR = join(process.cwd(), "public/gotransit/derived");
const MAX_OUTPUT_TRIPS = 2000;
const MAX_SHAPE_POINTS = 300;

// ── Derived-data types (matches build_gtfs_derived.py output) ────────────────
interface StopLookup  { lat: number; lon: number; name: string }
interface SimStopRaw  { stop_id: string; t: number; seq: number }
interface SimTripRaw  {
  trip_id: string;
  route_short_name: string;
  route_long_name:  string;
  route_type:       number;
  shape_id:         string | null;
  stops:            SimStopRaw[];
}

interface AppData {
  stopsLookup:    Map<string, StopLookup>;
  shapesByShapeId: Map<string, [number, number][]>;
  tripsByDow:     Map<number, SimTripRaw[]>;   // 0=Sun … 6=Sat
}

// ── Module-level cache ────────────────────────────────────────────────────────
let appData: AppData | null = null;

function loadData(): AppData {
  if (appData) return appData;

  // Stops
  const stopsLookup = new Map<string, StopLookup>(
    Object.entries(
      JSON.parse(readFileSync(join(DERIVED_DIR, "stops_lookup.json"), "utf-8")) as Record<string, StopLookup>,
    ),
  );

  // Shapes from variant_lines.geojson (already in derived/)
  const shapesByShapeId = new Map<string, [number, number][]>();
  const gj = JSON.parse(readFileSync(join(DERIVED_DIR, "variant_lines.geojson"), "utf-8")) as {
    features: { properties: { shape_id: string }; geometry: { coordinates: [number, number][] } }[];
  };
  for (const f of gj.features) {
    const sid = f.properties?.shape_id;
    if (sid && f.geometry?.coordinates && !shapesByShapeId.has(sid)) {
      shapesByShapeId.set(sid, f.geometry.coordinates);
    }
  }

  // Trips by day-of-week
  const tripsByDow = new Map<number, SimTripRaw[]>();
  const raw = JSON.parse(readFileSync(join(DERIVED_DIR, "sim_trips_by_dow.json"), "utf-8")) as Record<string, SimTripRaw[]>;
  for (const [dow, trips] of Object.entries(raw)) {
    tripsByDow.set(Number(dow), trips);
  }

  appData = { stopsLookup, shapesByShapeId, tripsByDow };
  return appData;
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
  shape: [number, number][], shapeDists: number[],
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

function gtfsTimeToSecs(t: string): number {
  const [h, m, s] = t.split(":").map(Number);
  return h * 3600 + m * 60 + (s || 0);
}

// ── Route handler ─────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const routesParam = p.get("routes") ?? "KI,LW,LE,BR,ST,RH,MI";
  const startParam  = p.get("start")  ?? "06:00";
  const dateParam   = p.get("date")   ?? new Date().toISOString().split("T")[0];

  const requestedRoutes = new Set(routesParam.split(",").map(s => s.trim()).filter(Boolean));
  const startSec = gtfsTimeToSecs(startParam + ":00");
  const endSec   = startSec + 43200;

  // Map date → JS day-of-week (0=Sun … 6=Sat)
  const dateObj = new Date(dateParam + "T12:00:00Z");
  const dow     = dateObj.getUTCDay();

  try {
    const { stopsLookup, shapesByShapeId, tripsByDow } = loadData();
    const rawTrips = tripsByDow.get(dow) ?? [];
    const trips: SimTrip[] = [];

    for (const raw of rawTrips) {
      if (trips.length >= MAX_OUTPUT_TRIPS) break;
      if (!requestedRoutes.has(raw.route_short_name)) continue;
      if (raw.stops.length < 2) continue;

      const departSec = raw.stops[0].t;
      const arriveSec = raw.stops[raw.stops.length - 1].t;

      if (departSec >= endSec || arriveSec <= startSec) continue;

      const rawShape = raw.shape_id ? shapesByShapeId.get(raw.shape_id) : undefined;
      const shape: [number, number][] = rawShape
        ? downsample(rawShape, MAX_SHAPE_POINTS)
        : downsample(
            raw.stops
              .map(st => { const s = stopsLookup.get(st.stop_id); return s ? [s.lon, s.lat] as [number, number] : null; })
              .filter((x): x is [number, number] => x !== null),
            MAX_SHAPE_POINTS,
          );

      if (shape.length < 2) continue;

      const shapeDists = cumDists(shape);

      const timedStops: SimStop[] = raw.stops.map(st => {
        const stop = stopsLookup.get(st.stop_id);
        return {
          t:         st.t,
          lat:       stop?.lat ?? 0,
          lon:       stop?.lon ?? 0,
          shapeFrac: stop ? projectStopFrac(stop.lon, stop.lat, shape, shapeDists) : 0,
          stop_name: stop?.name,
        };
      });

      // Enforce monotonic shape fractions
      for (let i = 1; i < timedStops.length; i++) {
        if (timedStops[i].shapeFrac < timedStops[i - 1].shapeFrac) {
          timedStops[i].shapeFrac = timedStops[i - 1].shapeFrac;
        }
      }

      trips.push({
        trip_id:          raw.trip_id,
        route_short_name: raw.route_short_name,
        route_long_name:  raw.route_long_name,
        route_type:       raw.route_type,
        color:            colorForRoute(raw.route_short_name, raw.route_type),
        source:           "gotransit",
        stops:            timedStops,
        shape,
        start_stop_name:  stopsLookup.get(raw.stops[0].stop_id)?.name ?? "",
        end_stop_name:    stopsLookup.get(raw.stops[raw.stops.length - 1].stop_id)?.name ?? "",
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
