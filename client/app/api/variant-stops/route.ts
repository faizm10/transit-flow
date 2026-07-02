import { NextRequest, NextResponse } from "next/server";
import { GTFSStop, VariantStops } from "@/lib/gtfs";
import { resolveFeedSource, readDerivedFile } from "@/lib/feedLoader";
import { FeedCache } from "@/lib/feedCache";

// Per-feed cache (TTL + LRU for city feeds; GO Transit pinned)
const variantStopsCache = new FeedCache<VariantStops>();

async function loadVariantStops(feedId: string): Promise<VariantStops> {
  const cached = variantStopsCache.get(feedId);
  if (cached) return cached;

  const source = await resolveFeedSource(feedId);
  const json = await readDerivedFile(source, "variant_stops.json");
  const data = JSON.parse(json) as VariantStops;
  variantStopsCache.set(feedId, data);
  return data;
}

// GET /api/variant-stops?variant_id=XX&feed=gotransit
export async function GET(req: NextRequest) {
  const feedId = req.nextUrl.searchParams.get("feed") ?? "gotransit";
  const variantId = req.nextUrl.searchParams.get("variant_id")?.trim();

  if (!variantId) {
    return NextResponse.json(
      { error: "Missing required query param: variant_id" },
      { status: 400 }
    );
  }

  try {
    const all = await loadVariantStops(feedId);
    const stops: GTFSStop[] = all[variantId] ?? [];
    return NextResponse.json({ stops });
  } catch (err) {
    console.error("variant-stops API error:", err);
    return NextResponse.json({ error: "Failed to load variant stops" }, { status: 500 });
  }
}
