import { NextRequest, NextResponse } from "next/server";
import { readFileSync } from "fs";
import { join } from "path";
import { GTFSStop, VariantStops } from "@/lib/gtfs";

const PUBLIC_DIR = join(process.cwd(), "public", "gotransit", "derived");

interface StopSearchResult {
  stop_id: string;
  stop_name: string;
  lat: number;
  lon: number;
}

// Flatten and deduplicate stops across all variants
let cachedStops: StopSearchResult[] | null = null;

function loadStops(): StopSearchResult[] {
  if (cachedStops) return cachedStops;

  const variantStops: VariantStops = JSON.parse(
    readFileSync(join(PUBLIC_DIR, "variant_stops.json"), "utf-8")
  );

  const seen = new Set<string>();
  const stops: StopSearchResult[] = [];

  for (const variantList of Object.values(variantStops)) {
    for (const stop of variantList) {
      if (!seen.has(stop.stop_id)) {
        seen.add(stop.stop_id);
        stops.push({
          stop_id: stop.stop_id,
          stop_name: stop.stop_name,
          lat: stop.stop_lat,
          lon: stop.stop_lon,
        });
      }
    }
  }

  // Sort alphabetically for consistent results
  stops.sort((a, b) => a.stop_name.localeCompare(b.stop_name));
  cachedStops = stops;
  return stops;
}

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.toLowerCase().trim() ?? "";

  try {
    const all = loadStops();

    if (!q) {
      return NextResponse.json({ stops: all.slice(0, 20) });
    }

    const results = all
      .filter((s) => s.stop_name.toLowerCase().includes(q))
      .slice(0, 15);

    return NextResponse.json({ stops: results });
  } catch (err) {
    console.error("stops API error:", err);
    return NextResponse.json({ error: "Failed to load stops" }, { status: 500 });
  }
}
