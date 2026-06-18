import { NextRequest, NextResponse } from "next/server";
import { GTFSRoute, GTFSVariant, GTFSStop, EnrichedRoute, VariantsIndex, VariantStops } from "@/lib/gtfs";
import { colorForRoute, isRailRoute } from "@/lib/routeColors";
import { colorForCityRoute } from "@/lib/feedColors";
import { resolveFeedSource, readDerivedFile } from "@/lib/feedLoader";

// Per-feed cache
const routesCache = new Map<string, EnrichedRoute[]>();

function orderCorridorEndpoints(firstStop: string, lastStop: string): { from: string; to: string } {
  const a = firstStop.trim();
  const b = lastStop.trim();
  const unionLike = (s: string) => /\bunion\b/i.test(s);
  if (unionLike(a) && !unionLike(b)) return { from: a, to: b };
  if (unionLike(b) && !unionLike(a)) return { from: b, to: a };
  return { from: a, to: b };
}

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

async function loadRoutes(feedId: string): Promise<EnrichedRoute[]> {
  const cached = routesCache.get(feedId);
  if (cached) return cached;

  const source = await resolveFeedSource(feedId);
  const [routesJson, variantsJson, stopsJson] = await Promise.all([
    readDerivedFile(source, "routes_index.json"),
    readDerivedFile(source, "variants_index.json"),
    readDerivedFile(source, "variant_stops.json"),
  ]);

  const routesRaw: (GTFSRoute & { route_color?: string })[] = JSON.parse(routesJson);
  const variantsIndex: VariantsIndex = JSON.parse(variantsJson);
  const variantStops: VariantStops = JSON.parse(stopsJson);

  const seenShort = new Set<string>();
  const isCity = feedId !== "gotransit";

  const enriched = routesRaw
    .map((r) => {
      const variants: GTFSVariant[] = variantsIndex[r.route_short_name] ?? [];
      const { from: fromStop, to: toStop } = corridorEndpointsFromVariants(variants, variantStops);
      const weeklyTrips = variants.reduce(
        (sum, v) => sum + (v.weekly_trip_count ?? v.trip_count ?? 0),
        0
      );

      const color = isCity
        ? colorForCityRoute(r.route_color, r.route_short_name, feedId)
        : colorForRoute(r.route_short_name, r.route_type);

      return {
        route_id: r.route_id,
        short_name: r.route_short_name,
        long_name: r.route_long_name,
        route_type: r.route_type,
        is_rail: isRailRoute(r.route_short_name, r.route_type),
        color,
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

  routesCache.set(feedId, enriched);
  return enriched;
}

export async function GET(req: NextRequest) {
  const feedId = req.nextUrl.searchParams.get("feed") ?? "gotransit";
  try {
    const routes = await loadRoutes(feedId);
    return NextResponse.json({ routes });
  } catch (err) {
    console.error("routes API error:", err);
    return NextResponse.json({ error: "Failed to load routes" }, { status: 500 });
  }
}
