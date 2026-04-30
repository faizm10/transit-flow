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
    return map;
  })();

  try {
    const { departures } = await getFullIndex();
    const key = `${route}|${dayOfWeek}`;
    const allEntries = departures.get(key) ?? [];

    // Group by directionId → headsign → departures
    const dirMap = new Map<number, Map<string, string[]>>();
    for (const e of allEntries) {
      let dir = dirMap.get(e.directionId);
      if (!dir) { dir = new Map(); dirMap.set(e.directionId, dir); }
      const bucket = dir.get(e.headsign) ?? [];
      bucket.push(e.time);
      dir.set(e.headsign, bucket);
    }

    const directions = Array.from(dirMap.entries())
      .map(([directionId, headsignMap]) => {
        // Build per-destination groups (sorted most-trips-first)
        const destinations = Array.from(headsignMap.entries()).map(([headsign, times]) => {
          const overrideKey = `${route}|${dayOfWeek}|${directionId}|${headsign}`;
          const finalTimes = departuresByKey?.get(overrideKey) ?? times;
          return {
            headsign,
            departures: finalTimes.map((t) => ({ time: t })),
          };
        })
          .sort((a, b) => b.departures.length - a.departures.length);

        // Dominant headsign = most trips
        const dominantHeadsign = destinations[0]?.headsign ?? "";

        // All departures for this direction, each tagged with its headsign
        const allDeps = (() => {
          // If no overrides, preserve existing behavior
          if (!departuresByKey) {
            return allEntries
              .filter((e) => e.directionId === directionId)
              .map((e) => ({ time: e.time, headsign: e.headsign }));
          }
          // Rebuild from the (possibly overridden) destination buckets
          return destinations
            .flatMap((dest) => dest.departures.map((d) => ({ time: d.time, headsign: dest.headsign })))
            .sort((a, b) => a.time.localeCompare(b.time));
        })();

        return { directionId, headsign: dominantHeadsign, destinations, departures: allDeps };
      })
      .sort((a, b) => a.directionId - b.directionId);

    // Which days have data for this route?
    const availableDays: number[] = [];
    for (let d = 0; d <= 6; d++) {
      if ((departures.get(`${route}|${d}`) ?? []).length > 0) availableDays.push(d);
    }

    return NextResponse.json({ route, day: dayOfWeek, directions, availableDays });
  } catch (err) {
    console.error("[departures] Error:", err);
    return NextResponse.json({ error: "Failed to build schedule index" }, { status: 500 });
  }
}
