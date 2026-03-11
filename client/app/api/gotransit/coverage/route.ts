import { NextResponse } from "next/server";
import path from "path";
import { promises as fs } from "fs";

type VariantStop = {
  stop_id: string;
  stop_name: string;
  stop_lat: number | null;
  stop_lon: number | null;
};

export async function GET() {
  try {
    const variantStopsRaw = await fs.readFile(
      path.join(
        process.cwd(),
        "public",
        "gotransit",
        "derived",
        "variant_stops.json"
      ),
      "utf8"
    );

    const variantStops = JSON.parse(variantStopsRaw) as Record<
      string,
      VariantStop[]
    >;

    // Deduplicate stops by stop_id
    const uniqueStops = new Map<
      string,
      { lat: number; lon: number; name: string }
    >();

    for (const stops of Object.values(variantStops)) {
      for (const stop of stops) {
        if (stop.stop_lat == null || stop.stop_lon == null) continue;
        if (!uniqueStops.has(stop.stop_id)) {
          uniqueStops.set(stop.stop_id, {
            lat: stop.stop_lat,
            lon: stop.stop_lon,
            name: stop.stop_name,
          });
        }
      }
    }

    const features = Array.from(uniqueStops.entries()).map(
      ([stopId, data]) => ({
        type: "Feature" as const,
        geometry: {
          type: "Point" as const,
          coordinates: [data.lon, data.lat],
        },
        properties: {
          stop_id: stopId,
          stop_name: data.name,
          coverage_radius_m: 500,
        },
      })
    );

    return NextResponse.json(
      { type: "FeatureCollection", features },
      {
        headers: {
          "Cache-Control": "public, max-age=3600",
        },
      }
    );
  } catch (error) {
    console.error("Coverage API error:", error);
    return NextResponse.json(
      { error: "Failed to generate coverage data" },
      { status: 500 }
    );
  }
}
