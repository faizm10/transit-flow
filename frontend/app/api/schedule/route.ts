import { NextRequest, NextResponse } from "next/server";
import { readFileSync } from "fs";
import { join } from "path";
import { GTFSVariant, GTFSStop, VariantsIndex, VariantStops } from "@/lib/gtfs";

const PUBLIC_DIR = join(process.cwd(), "public", "gotransit", "derived");

export interface ScheduleEntry {
  stop_id: string;
  stop_name: string;
  lat: number;
  lon: number;
  sequence: number;
  /** Estimated arrival time in HH:MM */
  estimated_time: string;
}

export interface ScheduleResponse {
  variant_id: string;
  label: string;
  stops: ScheduleEntry[];
  trip_count: number;
  /** Estimated frequency description */
  frequency: string;
}

let variantsCache: VariantsIndex | null = null;
let stopsCache: VariantStops | null = null;

function loadCache() {
  if (!variantsCache) {
    variantsCache = JSON.parse(readFileSync(join(PUBLIC_DIR, "variants_index.json"), "utf-8"));
  }
  if (!stopsCache) {
    stopsCache = JSON.parse(readFileSync(join(PUBLIC_DIR, "variant_stops.json"), "utf-8"));
  }
  return { variants: variantsCache!, stops: stopsCache! };
}

function secondsToHHMM(s: number): string {
  const h = Math.floor(s / 3600) % 24;
  const m = Math.floor((s % 3600) / 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export async function GET(req: NextRequest) {
  const variantId = req.nextUrl.searchParams.get("variant_id");
  if (!variantId) {
    return NextResponse.json({ error: "variant_id is required" }, { status: 400 });
  }

  try {
    const { variants, stops } = loadCache();

    // Find the variant across all route keys
    let found: GTFSVariant | null = null;
    for (const variantList of Object.values(variants)) {
      const v = variantList.find((vv) => vv.variant_id === variantId);
      if (v) { found = v; break; }
    }

    if (!found) {
      return NextResponse.json({ error: "Variant not found" }, { status: 404 });
    }

    const rawStops: GTFSStop[] = stops[variantId] ?? [];

    // Estimate timing: 6:00 AM departure, ~2.5 min/stop rail, ~3 min/stop bus
    const isRail = ["BR","KI","LE","LW","MI","RH","ST","UP"].includes(
      found.route_variant ?? ""
    );
    const secsPerStop = isRail ? 150 : 180;
    const baseSec = 6 * 3600;

    const stopEntries: ScheduleEntry[] = rawStops.map((s, i) => ({
      stop_id: s.stop_id,
      stop_name: s.stop_name,
      lat: s.stop_lat,
      lon: s.stop_lon,
      sequence: s.stop_sequence,
      estimated_time: secondsToHHMM(baseSec + i * secsPerStop),
    }));

    // Estimate frequency
    const serviceHours = 16;
    const tripsPerDay = found.trip_count ?? 0;
    const intervalMins = tripsPerDay > 0
      ? Math.round((serviceHours * 60) / tripsPerDay)
      : null;
    const frequency = intervalMins
      ? intervalMins < 60
        ? `Every ~${intervalMins} min`
        : `Every ~${Math.round(intervalMins / 60)}h`
      : "Schedule varies";

    const response: ScheduleResponse = {
      variant_id: variantId,
      label: found.label,
      stops: stopEntries,
      trip_count: found.trip_count,
      frequency,
    };

    return NextResponse.json(response, {
      headers: { "Cache-Control": "s-maxage=3600" },
    });
  } catch (err) {
    console.error("schedule API error:", err);
    return NextResponse.json({ error: "Failed to load schedule" }, { status: 500 });
  }
}
