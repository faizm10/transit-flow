import { NextResponse } from "next/server";
import path from "path";
import { promises as fs } from "fs";

type VariantEntry = {
  variant_id: string;
  trip_count: number;
};

type VariantStop = {
  stop_id: string;
  stop_name: string;
  stop_lat: number | null;
  stop_lon: number | null;
};

export async function GET() {
  try {
    const basePath = path.join(
      process.cwd(),
      "public",
      "gotransit",
      "derived"
    );

    const [variantsRaw, variantStopsRaw] = await Promise.all([
      fs.readFile(path.join(basePath, "variants_index.json"), "utf8"),
      fs.readFile(path.join(basePath, "variant_stops.json"), "utf8"),
    ]);

    const variantsIndex = JSON.parse(variantsRaw) as Record<
      string,
      VariantEntry[]
    >;
    const variantStops = JSON.parse(variantStopsRaw) as Record<
      string,
      VariantStop[]
    >;

    // Accumulate trip_count per stop_id across all variants
    const stopWeights = new Map<
      string,
      { weight: number; lat: number; lon: number; name: string }
    >();

    for (const variants of Object.values(variantsIndex)) {
      for (const variant of variants) {
        const stops = variantStops[variant.variant_id] ?? [];
        for (const stop of stops) {
          if (stop.stop_lat == null || stop.stop_lon == null) continue;
          const existing = stopWeights.get(stop.stop_id);
          if (existing) {
            existing.weight += variant.trip_count;
          } else {
            stopWeights.set(stop.stop_id, {
              weight: variant.trip_count,
              lat: stop.stop_lat,
              lon: stop.stop_lon,
              name: stop.stop_name,
            });
          }
        }
      }
    }

    const features = Array.from(stopWeights.entries()).map(
      ([stopId, data]) => ({
        type: "Feature" as const,
        geometry: {
          type: "Point" as const,
          coordinates: [data.lon, data.lat],
        },
        properties: {
          stop_id: stopId,
          stop_name: data.name,
          weight: data.weight,
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
    console.error("Heatmap API error:", error);
    return NextResponse.json(
      { error: "Failed to generate heatmap data" },
      { status: 500 }
    );
  }
}
