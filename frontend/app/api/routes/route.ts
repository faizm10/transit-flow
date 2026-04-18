import { NextResponse } from "next/server";
import { readFileSync } from "fs";
import { join } from "path";
import { GTFSRoute, GTFSVariant, GTFSStop, EnrichedRoute, VariantsIndex, VariantStops } from "@/lib/gtfs";
import { colorForRoute, isRailRoute } from "@/lib/routeColors";

const PUBLIC_DIR = join(process.cwd(), "public", "gotransit", "derived");

let cachedRoutes: EnrichedRoute[] | null = null;

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

  cachedRoutes = routesRaw.map((r) => {
    const variants: GTFSVariant[] = variantsIndex[r.route_short_name] ?? [];
    const firstVariantId = variants[0]?.variant_id;
    const stops: GTFSStop[] = firstVariantId ? variantStops[firstVariantId] ?? [] : [];
    const fromStop = stops[0]?.stop_name ?? "";
    const toStop = stops[stops.length - 1]?.stop_name ?? "";
    const totalTrips = variants.reduce((sum, v) => sum + (v.trip_count ?? 0), 0);

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
      total_trips: totalTrips,
    };
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
