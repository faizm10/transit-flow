/**
 * GTFS index — loaded from pre-generated derived JSON files.
 * Supports both GO Transit (local filesystem) and uploaded city feeds (Vercel Blob).
 *
 * Shared by /api/departures and /api/schedule.
 */

import { readFileSync, statSync } from "fs";
import { join } from "path";
import { resolveFeedSource, readDerivedFile } from "@/lib/feedLoader";

const GO_DERIVED_DIR = join(process.cwd(), "public", "gotransit", "derived");

// ─── Exported types ───────────────────────────────────────────────────────────

export interface DepartureEntry {
  time:        string;  // "HH:MM"
  headsign:    string;
  directionId: number;
  /** First stop name on this trip (board-here origin for departures cards) */
  fromStop?:   string;
}

export interface StopTimeEntry {
  stopId:        string;
  stopName:      string;
  lat:           number;
  lon:           number;
  sequence:      number;
  departureTime: string; // "HH:MM"
  arrivalTime:   string; // "HH:MM"
}

export interface FullIndex {
  /** key: `${routeShortName}|${dayOfWeek}` (JS getDay, 0=Sun) */
  departures:    Map<string, DepartureEntry[]>;
  /** key: representative_trip_id */
  tripStopTimes: Map<string, StopTimeEntry[]>;
}

// ─── Module-level cache (keyed by feedId) ────────────────────────────────────

interface CacheEntry {
  index: FullIndex;
  mtimeMs: number; // only tracked for local feeds
}

const indexCache = new Map<string, CacheEntry>();

function goMtimeMs(): number {
  try {
    const depPath = join(GO_DERIVED_DIR, "departures_index.json");
    const tripPath = join(GO_DERIVED_DIR, "trip_stop_times.json");
    return Math.max(statSync(depPath).mtimeMs, statSync(tripPath).mtimeMs);
  } catch {
    return 0;
  }
}

function buildIndexFromStrings(departuresJson: string, tripStopTimesJson: string): FullIndex {
  const departuresRaw = JSON.parse(departuresJson) as Record<string, DepartureEntry[]>;
  const tripStopTimesRaw = JSON.parse(tripStopTimesJson) as Record<string, StopTimeEntry[]>;
  return {
    departures:    new Map(Object.entries(departuresRaw)),
    tripStopTimes: new Map(Object.entries(tripStopTimesRaw)),
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function getFullIndex(feedId?: string | null): Promise<FullIndex> {
  const id = feedId ?? "gotransit";

  if (id === "gotransit") {
    const mtime = goMtimeMs();
    const cached = indexCache.get("gotransit");
    if (cached && cached.mtimeMs === mtime) return cached.index;

    const depJson  = readFileSync(join(GO_DERIVED_DIR, "departures_index.json"), "utf-8");
    const tripJson = readFileSync(join(GO_DERIVED_DIR, "trip_stop_times.json"), "utf-8");
    const index = buildIndexFromStrings(depJson, tripJson);
    indexCache.set("gotransit", { index, mtimeMs: mtime });
    return index;
  }

  // City feed — cache forever (blob contents don't change once processing is done)
  const cached = indexCache.get(id);
  if (cached) return cached.index;

  const source = await resolveFeedSource(id);
  const [depJson, tripJson] = await Promise.all([
    readDerivedFile(source, "departures_index.json"),
    readDerivedFile(source, "trip_stop_times.json"),
  ]);
  const index = buildIndexFromStrings(depJson, tripJson);
  indexCache.set(id, { index, mtimeMs: 0 });
  return index;
}

export function isIndexCached(feedId?: string | null): boolean {
  return indexCache.has(feedId ?? "gotransit");
}
