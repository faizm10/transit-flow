import { NextRequest, NextResponse } from "next/server";
import { readFileSync } from "fs";
import { join } from "path";
import { GTFSVariant, GTFSStop, VariantsIndex, VariantStops, gtfsTimeToSeconds } from "@/lib/gtfs";
import { colorForRoute } from "@/lib/routeColors";
import { SimTrip, SimStop, SimulationData } from "@/lib/simulation";

const PUBLIC_DIR = join(process.cwd(), "public", "gotransit", "derived");
const MAX_OUTPUT_TRIPS = 250;
const MAX_SHAPE_POINTS = 300;

// ── Data loading (cached at module level) ────────────────────────────────────

interface AppData {
  variantsIndex: VariantsIndex;
  variantStops: VariantStops;
  shapesByVariant: Map<string, [number, number][]>;
}

let cachedData: AppData | null = null;

function loadData(): AppData {
  if (cachedData) return cachedData;

  const variantsIndex: VariantsIndex = JSON.parse(
    readFileSync(join(PUBLIC_DIR, "variants_index.json"), "utf-8")
  );
  const variantStops: VariantStops = JSON.parse(
    readFileSync(join(PUBLIC_DIR, "variant_stops.json"), "utf-8")
  );

  // Load GeoJSON shapes indexed by variant_id
  const geojson = JSON.parse(
    readFileSync(join(PUBLIC_DIR, "variant_lines.geojson"), "utf-8")
  ) as { features: Array<{ properties: { variant_id: string }; geometry: { coordinates: [number, number][] } }> };

  const shapesByVariant = new Map<string, [number, number][]>();
  for (const feature of geojson.features) {
    const variantId = feature.properties?.variant_id;
    if (variantId && feature.geometry?.coordinates) {
      shapesByVariant.set(variantId, feature.geometry.coordinates);
    }
  }

  cachedData = { variantsIndex, variantStops, shapesByVariant };
  return cachedData;
}

// ── Shape helpers ─────────────────────────────────────────────────────────────

/** Compute cumulative distances along a polyline */
function cumDists(shape: [number, number][]): number[] {
  const d = [0];
  for (let i = 1; i < shape.length; i++) {
    const dx = shape[i][0] - shape[i - 1][0];
    const dy = shape[i][1] - shape[i - 1][1];
    d.push(d[i - 1] + Math.sqrt(dx * dx + dy * dy));
  }
  return d;
}

/** Project a stop (lon, lat) onto the nearest vertex of a shape → fraction 0–1 */
function projectStopFrac(
  lon: number,
  lat: number,
  shape: [number, number][],
  shapeCumDists: number[]
): number {
  const total = shapeCumDists[shapeCumDists.length - 1];
  if (total === 0) return 0;

  let minDistSq = Infinity;
  let bestFrac = 0;

  for (let i = 0; i < shape.length; i++) {
    const dx = shape[i][0] - lon;
    const dy = shape[i][1] - lat;
    const d2 = dx * dx + dy * dy;
    if (d2 < minDistSq) {
      minDistSq = d2;
      bestFrac = shapeCumDists[i] / total;
    }
  }
  return bestFrac;
}

/** Downsample array to at most maxPoints, keeping first + last */
function downsample<T>(arr: T[], maxPoints: number): T[] {
  if (arr.length <= maxPoints) return arr;
  const step = (arr.length - 1) / (maxPoints - 1);
  const out: T[] = [];
  for (let i = 0; i < maxPoints; i++) out.push(arr[Math.round(i * step)]);
  return out;
}

// ── Departures ───────────────────────────────────────────────────────────────

function generateDepartures(startSec: number, endSec: number, intervalSec: number): number[] {
  const deps: number[] = [];
  for (let t = startSec; t < endSec; t += intervalSec) deps.push(t);
  return deps;
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const routesParam = params.get("routes") ?? "KI,LW,LE,BR,ST,RH,MI";
  const startParam = params.get("start") ?? "06:00";
  const endParam = params.get("end") ?? "22:00";

  const requestedRoutes = routesParam
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const startSec = gtfsTimeToSeconds(startParam + ":00");
  const endSec = gtfsTimeToSeconds(endParam + ":00");

  try {
    const { variantsIndex, variantStops, shapesByVariant } = loadData();
    const trips: SimTrip[] = [];

    for (const shortName of requestedRoutes) {
      const variants: GTFSVariant[] = variantsIndex[shortName] ?? [];
      if (!variants.length) continue;

      const color = colorForRoute(shortName);
      const isRail = ["BR", "KI", "LE", "LW", "MI", "RH", "ST", "UP"].includes(shortName);
      const secsPerStop = isRail ? 150 : 180;

      for (const variant of variants.slice(0, 2)) {
        const stops: GTFSStop[] = variantStops[variant.variant_id] ?? [];
        if (stops.length < 2) continue;

        // Get actual shape from GeoJSON — fall back to connecting stops if missing
        const rawShape = shapesByVariant.get(variant.variant_id);
        const shape = rawShape
          ? downsample(rawShape, MAX_SHAPE_POINTS)
          : downsample(
              stops.map((s) => [s.stop_lon, s.stop_lat] as [number, number]),
              MAX_SHAPE_POINTS
            );

        // Pre-compute cumulative distances for this shape
        const shapeDists = cumDists(shape);

        // Project each stop onto shape → fraction 0–1
        const shapeFracs = stops.map((s) =>
          projectStopFrac(s.stop_lon, s.stop_lat, shape, shapeDists)
        );

        // Ensure fracs are monotonically non-decreasing (handle projection noise)
        for (let i = 1; i < shapeFracs.length; i++) {
          if (shapeFracs[i] < shapeFracs[i - 1]) {
            shapeFracs[i] = shapeFracs[i - 1];
          }
        }

        // Frequency: estimate from trip_count over 16 service hours
        const serviceHours = 16;
        const tripsPerDay = variant.trip_count ?? 10;
        const intervalSec = Math.max(
          600,
          Math.round((serviceHours * 3600) / Math.max(tripsPerDay, 1))
        );

        const departures = generateDepartures(startSec, endSec, intervalSec);

        for (const depTime of departures) {
          if (trips.length >= MAX_OUTPUT_TRIPS) break;

          const tripDurationSec = stops.length * secsPerStop;

          const timedStops: SimStop[] = stops.map((s, i) => ({
            t: depTime + i * secsPerStop,
            lat: s.stop_lat,
            lon: s.stop_lon,
            shapeFrac: shapeFracs[i],
            stop_name: s.stop_name,
          }));

          // HH:MM from seconds
          const toHHMM = (sec: number) => {
            const h = Math.floor((sec % 86400) / 3600);
            const m = Math.floor((sec % 3600) / 60);
            return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
          };

          const arriveSec = depTime + tripDurationSec;

          trips.push({
            trip_id: `${variant.variant_id}-${depTime}`,
            route_short_name: shortName,
            route_long_name: variant.label,
            route_type: isRail ? 2 : 3,
            color,
            source: "gotransit",
            stops: timedStops,
            shape,
            start_stop_name: stops[0]?.stop_name ?? "",
            end_stop_name: stops[stops.length - 1]?.stop_name ?? "",
            start_time: toHHMM(depTime),
            end_time: toHHMM(arriveSec),
            departSec: depTime,
            arriveSec,
          });
        }

        if (trips.length >= MAX_OUTPUT_TRIPS) break;
      }

      if (trips.length >= MAX_OUTPUT_TRIPS) break;
    }

    const result: SimulationData = {
      startSeconds: startSec,
      endSeconds: endSec,
      trips,
    };

    return NextResponse.json(result, {
      headers: { "Cache-Control": "s-maxage=300, stale-while-revalidate=60" },
    });
  } catch (err) {
    console.error("simulation API error:", err);
    return NextResponse.json({ error: "Failed to generate simulation" }, { status: 500 });
  }
}
