import { NextRequest, NextResponse } from "next/server";
import { getFullIndex } from "@/lib/gtfsRawIndex";

// ─── Route handler ────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const route = searchParams.get("route")?.trim();
  const dayParam = searchParams.get("day");

  if (!route || dayParam === null) {
    return NextResponse.json({ error: "route and day params required" }, { status: 400 });
  }

  const dayOfWeek = parseInt(dayParam); // 0=Sun, 1=Mon … 6=Sat
  if (isNaN(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6) {
    return NextResponse.json({ error: "day must be 0–6 (0=Sun)" }, { status: 400 });
  }

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
        const destinations = Array.from(headsignMap.entries())
          .map(([headsign, times]) => ({
            headsign,
            departures: times.map((t) => ({ time: t })),
          }))
          .sort((a, b) => b.departures.length - a.departures.length);

        // Dominant headsign = most trips
        const dominantHeadsign = destinations[0]?.headsign ?? "";

        // All departures for this direction, each tagged with its headsign
        const allDeps = allEntries
          .filter((e) => e.directionId === directionId)
          .map((e) => ({ time: e.time, headsign: e.headsign }));

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
