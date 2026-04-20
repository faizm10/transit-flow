import { NextRequest, NextResponse } from "next/server";
import { readFileSync } from "fs";
import { join } from "path";

// Raw GTFS files
const GTFS_DIR = join(process.cwd(), "../server/data/gotransit");
// Pre-computed derived files
const PUBLIC_DIR = join(process.cwd(), "public/gotransit/derived");

interface VariantInfo {
  variant_id: string;
  shape_id: string;
  representative_trip_id: string;
}
interface StopInfo { stop_name: string }

// ── Module-level caches ───────────────────────────────────────────────────────
let variantsIndex: Record<string, VariantInfo[]> | null = null;
let stopsCache: Map<string, StopInfo> | null = null;
// keyed by serviceId → shape_id → trips+times
const stopTimesCache = new Map<string, Map<string, TripSchedule[]>>();

interface TripSchedule {
  trip_id: string;
  departureSec: number;  // seconds at first stop
  stops: { stopId: string; stopName: string; departureSec: number }[];
}

function parseLines(raw: string): string[] {
  return raw.replace(/^\uFEFF/, "").split(/\r?\n/).filter(Boolean);
}

function gtfsTimeToSecs(t: string): number {
  const [h, m, s] = t.split(":").map(Number);
  return h * 3600 + m * 60 + (s || 0);
}

function loadVariantsIndex(): Record<string, VariantInfo[]> {
  if (variantsIndex) return variantsIndex;
  variantsIndex = JSON.parse(
    readFileSync(join(PUBLIC_DIR, "variants_index.json"), "utf-8")
  );
  return variantsIndex!;
}

function loadStops(): Map<string, StopInfo> {
  if (stopsCache) return stopsCache;
  stopsCache = new Map();
  const lines = parseLines(readFileSync(join(GTFS_DIR, "stops.txt"), "utf-8"));
  const h = lines[0].split(",");
  const iId = h.indexOf("stop_id"), iName = h.indexOf("stop_name");
  for (let i = 1; i < lines.length; i++) {
    const p = lines[i].split(",");
    if (p.length < 2) continue;
    stopsCache.set(p[iId], { stop_name: p[iName] });
  }
  return stopsCache;
}

function loadTripsForShape(serviceId: string, shapeId: string): TripSchedule[] {
  // Check cache
  const serviceMap = stopTimesCache.get(serviceId);
  if (serviceMap?.has(shapeId)) return serviceMap.get(shapeId)!;

  // 1. Find all trip_ids for this shape+service
  const tripsLines = parseLines(readFileSync(join(GTFS_DIR, "trips.txt"), "utf-8"));
  const th = tripsLines[0].split(",");
  const iRouteId = th.indexOf("route_id"), iServiceId = th.indexOf("service_id");
  const iTripId = th.indexOf("trip_id"), iShapeId = th.indexOf("shape_id");
  const tripIds = new Set<string>();
  for (let i = 1; i < tripsLines.length; i++) {
    const p = tripsLines[i].split(",");
    if (p[iServiceId] === serviceId && p[iShapeId] === shapeId) {
      tripIds.add(p[iTripId]);
    }
  }

  if (tripIds.size === 0) {
    if (!stopTimesCache.has(serviceId)) stopTimesCache.set(serviceId, new Map());
    stopTimesCache.get(serviceId)!.set(shapeId, []);
    return [];
  }

  // 2. Load stop times for those trip_ids
  const stopsMap = loadStops();
  const raw = parseLines(readFileSync(join(GTFS_DIR, "stop_times.txt"), "utf-8"));
  const sh = raw[0].split(",");
  const iTrip = sh.indexOf("trip_id"), iDepart = sh.indexOf("departure_time");
  const iStop = sh.indexOf("stop_id"), iSeq = sh.indexOf("stop_sequence");

  const byTrip = new Map<string, { stopId: string; departureSec: number; seq: number }[]>();
  for (let i = 1; i < raw.length; i++) {
    const p = raw[i].split(",");
    if (!tripIds.has(p[iTrip])) continue;
    const entry = {
      stopId: p[iStop],
      departureSec: gtfsTimeToSecs(p[iDepart]),
      seq: parseInt(p[iSeq]),
    };
    if (!byTrip.has(p[iTrip])) byTrip.set(p[iTrip], []);
    byTrip.get(p[iTrip])!.push(entry);
  }

  // 3. Build TripSchedule[]
  const schedules: TripSchedule[] = [];
  for (const [tripId, rawStops] of byTrip) {
    rawStops.sort((a, b) => a.seq - b.seq);
    const stops = rawStops.map((s) => ({
      stopId: s.stopId,
      stopName: stopsMap.get(s.stopId)?.stop_name ?? s.stopId,
      departureSec: s.departureSec,
    }));
    schedules.push({
      trip_id: tripId,
      departureSec: stops[0]?.departureSec ?? 0,
      stops,
    });
  }
  schedules.sort((a, b) => a.departureSec - b.departureSec);

  if (!stopTimesCache.has(serviceId)) stopTimesCache.set(serviceId, new Map());
  stopTimesCache.get(serviceId)!.set(shapeId, schedules);
  return schedules;
}

// GET /api/variant-schedule?variant_id=X&date=YYYY-MM-DD
export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const variantId = p.get("variant_id")?.trim();
  const date = p.get("date") ?? new Date().toISOString().split("T")[0];

  if (!variantId) {
    return NextResponse.json({ error: "Missing variant_id" }, { status: 400 });
  }

  try {
    const index = loadVariantsIndex();
    // variants_index is keyed by route_short_name → GTFSVariant[]
    let variant: VariantInfo | undefined;
    for (const variants of Object.values(index)) {
      variant = (variants as VariantInfo[]).find((v) => v.variant_id === variantId);
      if (variant) break;
    }

    if (!variant) {
      return NextResponse.json({ error: "Variant not found", trips: [] });
    }

    const serviceId = date.replace(/-/g, "");
    const trips = loadTripsForShape(serviceId, variant.shape_id);

    return NextResponse.json({ trips }, {
      headers: { "Cache-Control": "s-maxage=3600, stale-while-revalidate=300" },
    });
  } catch (err) {
    console.error("variant-schedule error:", err);
    return NextResponse.json({ error: "Failed to load variant schedule", trips: [] }, { status: 500 });
  }
}
