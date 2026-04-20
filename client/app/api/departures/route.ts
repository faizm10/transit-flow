import { NextRequest, NextResponse } from "next/server";
import path from "path";
import fs from "fs";
import readline from "readline";

const GTFS_DIR = path.join(process.cwd(), "..", "server", "data", "gotransit");

// ─── Types ────────────────────────────────────────────────────────────────────

interface DepartureEntry {
  time: string;      // "HH:MM" (24h, may exceed 24:xx for overnight)
  headsign: string;
  directionId: number;
}

// key: `${routeShortName}|${dayOfWeek}` (0=Sun, 1=Mon, ..., 6=Sat)
type DeparturesIndex = Map<string, DepartureEntry[]>;

// ─── Module-level cache (survives across requests in same process) ─────────────

let indexCache: DeparturesIndex | null = null;
let buildingPromise: Promise<DeparturesIndex> | null = null;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Stream a file line-by-line, calling onLine for each non-empty line. */
function streamLines(filePath: string, onLine: (line: string) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const rl = readline.createInterface({
      input: fs.createReadStream(filePath, { encoding: "utf8" }),
      crlfDelay: Infinity,
    });
    rl.on("line", (line) => { if (line.trim()) onLine(line); });
    rl.on("close", resolve);
    rl.on("error", reject);
  });
}

/** Simple CSV split (handles double-quoted fields). */
function splitCSV(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else { inQuotes = !inQuotes; }
    } else if (ch === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

/** Strip UTF-8 BOM from a field name. */
function stripBOM(s: string): string {
  return s.replace(/^\uFEFF/, "").replace(/^\u00ef\u00bb\u00bf/, "");
}

/** "YYYYMMDD" service_id → day of week (0=Sun … 6=Sat). Returns -1 if unparseable. */
function serviceIdToDayOfWeek(serviceId: string): number {
  if (serviceId.length !== 8) return -1;
  const y = parseInt(serviceId.slice(0, 4));
  const m = parseInt(serviceId.slice(4, 6)) - 1;
  const d = parseInt(serviceId.slice(6, 8));
  const dt = new Date(y, m, d);
  return isNaN(dt.getTime()) ? -1 : dt.getDay();
}

/** "09:03:00" → "09:03". Handles times ≥ 24:00:00 (overnight service). */
function gtfsTimeToHHMM(t: string): string {
  return t.slice(0, 5);
}

// ─── Index builder ────────────────────────────────────────────────────────────

async function buildDeparturesIndex(): Promise<DeparturesIndex> {
  console.log("[departures] Building schedule index from GTFS files…");
  const t0 = Date.now();

  // ── Step 1: routes.txt → route_id → short_name ──────────────────────────
  const routeIdToShortName = new Map<string, string>();
  let firstLine = true;
  let colRouteId = 0, colShortName = 2; // default column positions

  await streamLines(path.join(GTFS_DIR, "routes.txt"), (line) => {
    const parts = splitCSV(line);
    if (firstLine) {
      firstLine = false;
      const headers = parts.map((h) => stripBOM(h).trim());
      colRouteId = headers.indexOf("route_id");
      colShortName = headers.indexOf("route_short_name");
      return;
    }
    const routeId = parts[colRouteId]?.trim();
    const shortName = parts[colShortName]?.trim();
    if (routeId && shortName) routeIdToShortName.set(routeId, shortName);
  });

  // ── Step 2: trips.txt → trip_id → { routeShortName, dayOfWeek, headsign, directionId } ──
  interface TripInfo {
    routeShortName: string;
    dayOfWeek: number;
    headsign: string;
    directionId: number;
  }
  const tripMap = new Map<string, TripInfo>();

  firstLine = true;
  let colTripId = 2, colServiceId = 1, colRouteIdT = 0,
      colHeadsign = 3, colDirectionId = 5;

  await streamLines(path.join(GTFS_DIR, "trips.txt"), (line) => {
    const parts = splitCSV(line);
    if (firstLine) {
      firstLine = false;
      const headers = parts.map((h) => stripBOM(h).trim());
      colRouteIdT   = headers.indexOf("route_id");
      colServiceId  = headers.indexOf("service_id");
      colTripId     = headers.indexOf("trip_id");
      colHeadsign   = headers.indexOf("trip_headsign");
      colDirectionId = headers.indexOf("direction_id");
      return;
    }

    const routeId   = parts[colRouteIdT]?.trim();
    const serviceId = parts[colServiceId]?.trim();
    const tripId    = parts[colTripId]?.trim();
    const headsign  = parts[colHeadsign]?.trim() ?? "";
    const directionId = parseInt(parts[colDirectionId]?.trim() ?? "0");

    if (!routeId || !tripId || !serviceId) return;
    const routeShortName = routeIdToShortName.get(routeId);
    if (!routeShortName) return;

    const dayOfWeek = serviceIdToDayOfWeek(serviceId);
    if (dayOfWeek < 0) return;

    tripMap.set(tripId, { routeShortName, dayOfWeek, headsign, directionId });
  });

  // ── Step 3: stop_times.txt → first-stop departure per trip ──────────────
  //
  // stop_times.txt entries appear in DESCENDING stop_sequence order within each trip.
  // We track minSeq + timeAtMinSeq per trip, finalising when trip_id changes.
  //
  const index: DeparturesIndex = new Map();

  let prevTripId = "";
  let prevMinSeq = Infinity;
  let prevMinTime = "";
  firstLine = true;

  let colStTripId = 0, colDepTime = 2, colStopSeq = 4;

  const finalizePrevTrip = () => {
    if (!prevTripId || prevMinTime === "") return;
    const info = tripMap.get(prevTripId);
    if (!info) return;
    const key = `${info.routeShortName}|${info.dayOfWeek}`;
    const bucket = index.get(key);
    const entry: DepartureEntry = {
      time: gtfsTimeToHHMM(prevMinTime),
      headsign: info.headsign,
      directionId: info.directionId,
    };
    if (bucket) bucket.push(entry);
    else index.set(key, [entry]);
  };

  await streamLines(path.join(GTFS_DIR, "stop_times.txt"), (line) => {
    const commaIdx0 = line.indexOf(",");
    const tripId = commaIdx0 >= 0 ? line.slice(0, commaIdx0) : line;

    if (firstLine) {
      firstLine = false;
      const parts = splitCSV(line);
      const headers = parts.map((h) => stripBOM(h).trim());
      colStTripId = headers.indexOf("trip_id");
      colDepTime  = headers.indexOf("departure_time");
      colStopSeq  = headers.indexOf("stop_sequence");
      return;
    }

    // Fast-path: if trip_id not in tripMap, skip (avoids full CSV parse)
    const fastTripId = stripBOM(tripId).trim();
    if (!tripMap.has(fastTripId) && fastTripId !== prevTripId) {
      if (fastTripId !== prevTripId) {
        finalizePrevTrip();
        prevTripId = fastTripId;
        prevMinSeq = Infinity;
        prevMinTime = "";
      }
      return;
    }

    // Full parse only for trips we care about
    const parts = splitCSV(line);
    const tid = stripBOM(parts[colStTripId] ?? "").trim();
    const depTime = (parts[colDepTime] ?? "").trim();
    const seq = parseInt((parts[colStopSeq] ?? "999999").trim());

    if (tid !== prevTripId) {
      finalizePrevTrip();
      prevTripId = tid;
      prevMinSeq = seq;
      prevMinTime = depTime;
    } else if (seq < prevMinSeq) {
      prevMinSeq = seq;
      prevMinTime = depTime;
    }
  });
  finalizePrevTrip(); // handle last trip in file

  // ── Sort each bucket by time ─────────────────────────────────────────────
  for (const [key, entries] of index) {
    // Deduplicate by time+direction (same trip pattern across multiple Mondays)
    const seen = new Set<string>();
    const deduped = entries.filter((e) => {
      const k = `${e.time}|${e.directionId}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
    deduped.sort((a, b) => a.time.localeCompare(b.time));
    index.set(key, deduped);
  }

  console.log(`[departures] Index built in ${Date.now() - t0}ms — ${index.size} buckets, ${tripMap.size} trips`);
  return index;
}

function getIndex(): Promise<DeparturesIndex> {
  if (indexCache) return Promise.resolve(indexCache);
  if (!buildingPromise) {
    buildingPromise = buildDeparturesIndex()
      .then((idx) => { indexCache = idx; return idx; })
      .catch((err) => { buildingPromise = null; throw err; });
  }
  return buildingPromise;
}

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
    const index = await getIndex();
    const key = `${route}|${dayOfWeek}`;
    const allEntries = index.get(key) ?? [];

    // Group by directionId, pick most common headsign per direction
    const dirMap = new Map<number, Map<string, { time: string }[]>>();
    for (const e of allEntries) {
      let dir = dirMap.get(e.directionId);
      if (!dir) { dir = new Map(); dirMap.set(e.directionId, dir); }
      const bucket = dir.get(e.headsign) ?? [];
      bucket.push({ time: e.time });
      dir.set(e.headsign, bucket);
    }

    const directions = Array.from(dirMap.entries())
      .map(([directionId, headsignMap]) => {
        // Pick headsign with most trips
        let bestHeadsign = "";
        let bestCount = 0;
        for (const [hs, deps] of headsignMap) {
          if (deps.length > bestCount) { bestCount = deps.length; bestHeadsign = hs; }
        }
        // Flatten all departures for this direction (already sorted + deduped at build time)
        const departures = allEntries
          .filter((e) => e.directionId === directionId)
          .map((e) => ({ time: e.time }));
        return { directionId, headsign: bestHeadsign, departures };
      })
      .sort((a, b) => a.directionId - b.directionId);

    // Which days have data for this route?
    const availableDays: number[] = [];
    for (let d = 0; d <= 6; d++) {
      if ((index.get(`${route}|${d}`) ?? []).length > 0) availableDays.push(d);
    }

    return NextResponse.json({ route, day: dayOfWeek, directions, availableDays });
  } catch (err) {
    console.error("[departures] Error:", err);
    return NextResponse.json({ error: "Failed to build schedule index" }, { status: 500 });
  }
}
