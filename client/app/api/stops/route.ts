import { NextRequest, NextResponse } from "next/server";
import { VariantStops } from "@/lib/gtfs";
import { resolveFeedSource, readDerivedFile } from "@/lib/feedLoader";

interface StopSearchResult {
  stop_id: string;
  stop_name: string;
  lat: number;
  lon: number;
}

// Per-feed cache
const stopsCache = new Map<string, StopSearchResult[]>();

async function loadStops(feedId: string): Promise<StopSearchResult[]> {
  const cached = stopsCache.get(feedId);
  if (cached) return cached;

  const source = await resolveFeedSource(feedId);
  const json = await readDerivedFile(source, "variant_stops.json");
  const variantStops: VariantStops = JSON.parse(json);

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

  stops.sort((a, b) => a.stop_name.localeCompare(b.stop_name));
  stopsCache.set(feedId, stops);
  return stops;
}

export async function GET(req: NextRequest) {
  const feedId = req.nextUrl.searchParams.get("feed") ?? "gotransit";
  const q = req.nextUrl.searchParams.get("q")?.toLowerCase().trim() ?? "";

  try {
    const all = await loadStops(feedId);

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
