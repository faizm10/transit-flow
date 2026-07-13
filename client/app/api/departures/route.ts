import { NextRequest, NextResponse } from "next/server";
import { getFullIndex } from "@/lib/gtfsRawIndex";

function decodeOverridesParam(raw: string | null): unknown | null {
  if (!raw) return null;
  try {
    const normalized = raw.replace(/-/g, "+").replace(/_/g, "/");
    const padLen = (4 - (normalized.length % 4)) % 4;
    const padded = normalized + "=".repeat(padLen);
    const json = Buffer.from(padded, "base64").toString("utf-8");
    return JSON.parse(json) as unknown;
  } catch {
    return null;
  }
}

function isHHMM(value: unknown): value is string {
  return typeof value === "string" && /^\d{2}:\d{2}$/.test(value);
}

function normalizeTimes(values: unknown): string[] | null {
  if (!Array.isArray(values)) return null;
  const times = values.filter(isHHMM);
  return Array.from(new Set(times)).sort();
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const feedId = searchParams.get("feed") ?? "gotransit";
  const route = searchParams.get("route")?.trim();
  const dayParam = searchParams.get("day");
  const overridesParam = searchParams.get("overrides");

  if (!route || dayParam === null) {
    return NextResponse.json({ error: "route and day params required" }, { status: 400 });
  }

  const dayOfWeek = parseInt(dayParam); // 0=Sun, 1=Mon … 6=Sat
  if (isNaN(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6) {
    return NextResponse.json({ error: "day must be 0–6 (0=Sun)" }, { status: 400 });
  }

  // Optional: departures overrides (small slice sent from client)
  // Expected payload: { departuresByKey: Record<string, string[]> }
  const overridesRaw = decodeOverridesParam(overridesParam);
  const departuresByKey = (() => {
    if (!overridesRaw || typeof overridesRaw !== "object") return null;
    const obj = overridesRaw as Record<string, unknown>;
    const maybe = obj.departuresByKey;
    if (!maybe || typeof maybe !== "object") return null;
    const map = new Map<string, string[]>();
    for (const [k, v] of Object.entries(maybe as Record<string, unknown>)) {
      const times = normalizeTimes(v);
      if (times) map.set(k, times);
    }
    return map.size > 0 ? map : null;
  })();

  try {
    const { departures } = await getFullIndex(feedId);
    const key = `${route}|${dayOfWeek}`;
    const allEntries = departures.get(key) ?? [];

    // Group by directionId → headsign → { time, fromStop }[]
    type DepSlot = { time: string; fromStop?: string };
    const dirMap = new Map<number, Map<string, DepSlot[]>>();
    for (const e of allEntries) {
      let dir = dirMap.get(e.directionId);
      if (!dir) { dir = new Map(); dirMap.set(e.directionId, dir); }
      const bucket = dir.get(e.headsign) ?? [];
      bucket.push({ time: e.time, fromStop: e.fromStop });
      dir.set(e.headsign, bucket);
    }

    /** Reattach first-stop names from GTFS slots when the client only sends HH:MM overrides. */
    function mergeOverrideSlots(base: DepSlot[], overriddenTimes: string[]): DepSlot[] {
      const pool = [...base];
      return overriddenTimes.map((t) => {
        const idx = pool.findIndex((s) => s.time === t);
        if (idx < 0) return { time: t };
        const [match] = pool.splice(idx, 1);
        return { time: t, fromStop: match.fromStop };
      });
    }

    const directions = Array.from(dirMap.entries())
      .map(([directionId, headsignMap]) => {
        // Build per-destination groups (sorted most-trips-first)
        const destinations = Array.from(headsignMap.entries()).map(([headsign, slots]) => {
          const overrideKey = `${route}|${dayOfWeek}|${directionId}|${headsign}`;
          const overridden = departuresByKey?.get(overrideKey);
          const finalSlots: DepSlot[] = overridden ? mergeOverrideSlots(slots, overridden) : slots;
          return {
            headsign,
            departures: finalSlots,
          };
        })
          .sort((a, b) => b.departures.length - a.departures.length);

        // Dominant headsign = most trips
        const dominantHeadsign = destinations[0]?.headsign ?? "";

        // All departures for this direction, each tagged with its headsign
        const allDeps = (() => {
          if (!departuresByKey) {
            return allEntries
              .filter((e) => e.directionId === directionId)
              .map((e) => ({ time: e.time, headsign: e.headsign, fromStop: e.fromStop }));
          }
          return destinations
            .flatMap((dest) =>
              dest.departures.map((d) => ({
                time: d.time,
                headsign: dest.headsign,
                fromStop: d.fromStop,
              })),
            )
            .sort((a, b) => a.time.localeCompare(b.time));
        })();

        return { directionId, headsign: dominantHeadsign, destinations, departures: allDeps };
      })
      .sort((a, b) => a.directionId - b.directionId);

    // Full week in the UI when this route has any schedule rows (empty buckets are
    // backfilled in build_gtfs_derived.py from the nearest day with GTFS service).
    const availableDays =
      directions.length > 0 ? [0, 1, 2, 3, 4, 5, 6] : [];

    return NextResponse.json({ route, day: dayOfWeek, directions, availableDays });
  } catch (err) {
    console.error("[departures] Error:", err);
    return NextResponse.json({ error: "Failed to build schedule index" }, { status: 500 });
  }
}
