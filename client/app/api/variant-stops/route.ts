import { NextRequest, NextResponse } from "next/server";
import { readFileSync } from "fs";
import { join } from "path";
import { GTFSStop, VariantStops } from "@/lib/gtfs";

const PUBLIC_DIR = join(process.cwd(), "public", "gotransit", "derived");

let cachedVariantStops: VariantStops | null = null;

function loadVariantStops(): VariantStops {
  if (cachedVariantStops) return cachedVariantStops;
  cachedVariantStops = JSON.parse(
    readFileSync(join(PUBLIC_DIR, "variant_stops.json"), "utf-8")
  ) as VariantStops;
  return cachedVariantStops;
}

// GET /api/variant-stops?variant_id=XX
// Returns: { stops: GTFSStop[] }
export async function GET(req: NextRequest) {
  const variantId = req.nextUrl.searchParams.get("variant_id")?.trim();

  if (!variantId) {
    return NextResponse.json(
      { error: "Missing required query param: variant_id" },
      { status: 400 }
    );
  }

  try {
    const all = loadVariantStops();
    const stops: GTFSStop[] = all[variantId] ?? [];
    return NextResponse.json({ stops });
  } catch (err) {
    console.error("variant-stops API error:", err);
    return NextResponse.json({ error: "Failed to load variant stops" }, { status: 500 });
  }
}
