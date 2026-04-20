import { NextRequest, NextResponse } from "next/server";
import { readFileSync } from "fs";
import { join } from "path";
import { GTFSVariant, GTFSStop, VariantsIndex, VariantStops } from "@/lib/gtfs";
import { getFullIndex } from "@/lib/gtfsRawIndex";

const PUBLIC_DIR = join(process.cwd(), "public", "gotransit", "derived");

export interface ScheduleEntry {
  stop_id: string;
  stop_name: string;
  lat: number;
  lon: number;
  sequence: number;
  /** Scheduled departure time in HH:MM (real GTFS data, or estimated if unavailable) */
  estimated_time: string;
}

export interface ScheduleResponse {
  variant_id: string;
  label: string;
  stops: ScheduleEntry[];
  /** Weekly trips in the current derived count basis */
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

    // ── Try to get real stop times from the GTFS index ────────────────────────
    let stopEntries: ScheduleEntry[];

    const repTripId = found.representative_trip_id;
    if (repTripId) {
      // Fire index build in background (cached after first call) and try to use real times
      const { tripStopTimes } = await getFullIndex();
      const realStopTimes = tripStopTimes.get(repTripId);

      if (realStopTimes && realStopTimes.length > 0) {
        // Use real GTFS stop times — join with rawStops for any missing metadata
        const stopMetaById = new Map<string, GTFSStop>(rawStops.map((s) => [s.stop_id, s]));

        stopEntries = realStopTimes.map((st) => {
          const meta = stopMetaById.get(st.stopId);
          return {
            stop_id:        st.stopId,
            stop_name:      st.stopName || meta?.stop_name || st.stopId,
            lat:            st.lat  || meta?.stop_lat  || 0,
            lon:            st.lon  || meta?.stop_lon  || 0,
            sequence:       st.sequence,
            estimated_time: st.departureTime || st.arrivalTime,
          };
        });
      } else {
        // Fallback: real trip ID found but no stop times in index yet — use estimates
        stopEntries = buildEstimatedStops(rawStops, found);
      }
    } else {
      // No representative trip — use estimates
      stopEntries = buildEstimatedStops(rawStops, found);
    }

    // ── Frequency description ─────────────────────────────────────────────────
    const serviceHours = 16;
    const weeklyTrips = found.weekly_trip_count ?? found.trip_count ?? 0;
    const tripsPerDay = Math.round(weeklyTrips / 7);
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
      trip_count: weeklyTrips,
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

// ─── Fallback: time estimation when real data isn't available ────────────────

function buildEstimatedStops(rawStops: GTFSStop[], found: GTFSVariant): ScheduleEntry[] {
  const isRail = ["BR", "KI", "LE", "LW", "MI", "RH", "ST", "UP"].includes(
    found.route_variant ?? ""
  );
  const secsPerStop = isRail ? 150 : 180;
  const baseSec = 6 * 3600;

  return rawStops.map((s, i) => ({
    stop_id:        s.stop_id,
    stop_name:      s.stop_name,
    lat:            s.stop_lat,
    lon:            s.stop_lon,
    sequence:       s.stop_sequence,
    estimated_time: secondsToHHMM(baseSec + i * secsPerStop),
  }));
}
