import { NextResponse } from "next/server";
import { readFileSync } from "fs";
import { join } from "path";
import { GTFSRoute, GTFSVariant, GTFSStop, EnrichedRoute, VariantsIndex, VariantStops } from "@/lib/gtfs";
import { colorForRoute, isRailRoute } from "@/lib/routeColors";

const PUBLIC_DIR = join(process.cwd(), "public", "gotransit", "derived");

let cachedRoutes: EnrichedRoute[] | null = null;

/** Prefer Union as the corridor "city" end when it appears on one terminal only (typical GO rail). */
function orderCorridorEndpoints(firstStop: string, lastStop: string): { from: string; to: string } {
  const a = firstStop.trim();
  const b = lastStop.trim();
  const unionLike = (s: string) => /\bunion\b/i.test(s);
  if (unionLike(a) && !unionLike(b)) return { from: a, to: b };
  if (unionLike(b) && !unionLike(a)) return { from: b, to: a };
  return { from: a, to: b };
}

/** Use the longest variant so corridor endpoints reflect full line (e.g. Kitchener), not a short-turn first variant. */
function corridorEndpointsFromVariants(
  variants: GTFSVariant[],
  variantStops: VariantStops,
): { from: string; to: string } {
  let best: GTFSStop[] = [];
  for (const v of variants) {
    const s = variantStops[v.variant_id] ?? [];
    if (s.length > best.length) best = s;
  }
  if (best.length === 0) return { from: "", to: "" };
  const first = best[0]?.stop_name ?? "";
  const last = best[best.length - 1]?.stop_name ?? "";
  return orderCorridorEndpoints(first, last);
}

function loadRoutes(): EnrichedRoute[] {
  if (cachedRoutes) return cachedRoutes;

  const routesRaw: GTFSRoute[] = JSON.parse(
    readFileSync(join(PUBLIC_DIR, "routes_index.json"), "utf-8")
  );
  const variantsIndex: VariantsIndex = JSON.parse(
    readFileSync(join(PUBLIC_DIR, "variants_index.json"), "utf-8")
  );
  const variantStops: VariantStops = JSON.parse(
    readFileSync(join(PUBLIC_DIR, "variant_stops.json"), "utf-8")
  );

  const seenShort = new Set<string>();
  cachedRoutes = routesRaw
    .map((r) => {
      const variants: GTFSVariant[] = variantsIndex[r.route_short_name] ?? [];
      const { from: fromStop, to: toStop } = corridorEndpointsFromVariants(variants, variantStops);
      const weeklyTrips = variants.reduce(
        (sum, v) => sum + (v.weekly_trip_count ?? v.trip_count ?? 0),
        0
      );

      return {
        route_id: r.route_id,
        short_name: r.route_short_name,
        long_name: r.route_long_name,
        route_type: r.route_type,
        is_rail: isRailRoute(r.route_short_name, r.route_type),
        color: colorForRoute(r.route_short_name, r.route_type),
        variants,
        from_stop: fromStop,
        to_stop: toStop,
        total_trips: weeklyTrips,
        weekly_trips: weeklyTrips,
      };
    })
    .filter((r) => {
      if (seenShort.has(r.short_name)) return false;
      seenShort.add(r.short_name);
      return true;
    });

  return cachedRoutes;
}

export async function GET() {
  try {
    const routes = loadRoutes();
    return NextResponse.json({ routes });
  } catch (err) {
    console.error("routes API error:", err);
    return NextResponse.json({ error: "Failed to load routes" }, { status: 500 });
  }
}
