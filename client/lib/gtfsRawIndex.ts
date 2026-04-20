/**
 * GTFS raw data index — built once from the 2.88M-line stop_times.txt file,
 * then cached in process memory. Shared by /api/departures and /api/schedule.
 *
 * Collects in a single pass:
 *   1. Departures index:  routeShortName|dayOfWeek → sorted departure times
 *   2. Trip stop times:   representative_trip_id   → ordered stop time list
 */

import { readFileSync } from "fs";
import { join } from "path";
import { createReadStream } from "fs";
import { createInterface } from "readline";
import type { VariantsIndex, VariantStops, GTFSStop } from "@/lib/gtfs";

const DERIVED_DIR = join(process.cwd(), "public", "gotransit", "derived");
const GTFS_DIR    = join(process.cwd(), "..", "server", "data", "gotransit");

// ─── Exported types ───────────────────────────────────────────────────────────

export interface DepartureEntry {
  time: string;       // "HH:MM"
  headsign: string;
  directionId: number;
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
  /** key: `${routeShortName}|${dayOfWeek}` */
  departures:    Map<string, DepartureEntry[]>;
  /** key: representative_trip_id */
  tripStopTimes: Map<string, StopTimeEntry[]>;
}

// ─── Module-level cache ───────────────────────────────────────────────────────

let cachedIndex: FullIndex | null = null;
let buildingPromise: Promise<FullIndex> | null = null;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function streamLines(filePath: string, onLine: (line: string) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const rl = createInterface({
      input: createReadStream(filePath, { encoding: "utf8" }),
      crlfDelay: Infinity,
    });
    rl.on("line", (l) => { if (l.trim()) onLine(l); });
    rl.on("close", resolve);
    rl.on("error", reject);
  });
}

function splitCSV(line: string): string[] {
  const result: string[] = [];
  let cur = "", inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
      else inQ = !inQ;
    } else if (c === "," && !inQ) { result.push(cur); cur = ""; }
    else cur += c;
  }
  result.push(cur);
  return result;
}

function stripBOM(s: string): string {
  return s.replace(/^\uFEFF/, "");
}

function serviceIdToDayOfWeek(id: string): number {
  if (id.length !== 8) return -1;
  const dt = new Date(
    parseInt(id.slice(0, 4)),
    parseInt(id.slice(4, 6)) - 1,
    parseInt(id.slice(6, 8)),
  );
  return isNaN(dt.getTime()) ? -1 : dt.getDay();
}

/** "09:03:00" or "25:30:00" → "09:03" / "25:30" */
function toHHMM(t: string): string { return t.slice(0, 5); }

// ─── Index builder ────────────────────────────────────────────────────────────

async function buildFullIndex(): Promise<FullIndex> {
  console.log("[gtfsRawIndex] Building full GTFS index…");
  const t0 = Date.now();

  // ── Pre-load derived JSON ─────────────────────────────────────────────────
  const variantsIndex: VariantsIndex = JSON.parse(
    readFileSync(join(DERIVED_DIR, "variants_index.json"), "utf-8"),
  );
  const variantStops: VariantStops = JSON.parse(
    readFileSync(join(DERIVED_DIR, "variant_stops.json"), "utf-8"),
  );

  // Build: representative_trip_id → variant_id
  const repTripToVariant = new Map<string, string>();
  // Build: stop_id → GTFSStop (across all variants, for name/coord lookup)
  const stopById = new Map<string, GTFSStop>();

  for (const [variantId, variants] of Object.entries(variantsIndex)) {
    for (const v of variants) {
      if (v.representative_trip_id) {
        repTripToVariant.set(v.representative_trip_id, variantId);
      }
    }
  }
  for (const stops of Object.values(variantStops)) {
    for (const s of stops) {
      if (!stopById.has(s.stop_id)) stopById.set(s.stop_id, s);
    }
  }

  // ── Step 1: routes.txt → route_id → short_name ──────────────────────────
  const routeIdToShortName = new Map<string, string>();
  let firstLine = true;
  let cRouteId = 0, cShortName = 2;
  await streamLines(join(GTFS_DIR, "routes.txt"), (line) => {
    const p = splitCSV(line);
    if (firstLine) {
      firstLine = false;
      const h = p.map((x) => stripBOM(x).trim());
      cRouteId = h.indexOf("route_id");
      cShortName = h.indexOf("route_short_name");
      return;
    }
    const rid = p[cRouteId]?.trim(), sn = p[cShortName]?.trim();
    if (rid && sn) routeIdToShortName.set(rid, sn);
  });

  // ── Step 2: trips.txt → trip_id → metadata ───────────────────────────────
  interface TripMeta { routeShortName: string; dayOfWeek: number; headsign: string; directionId: number; }
  const tripMap = new Map<string, TripMeta>();

  firstLine = true;
  let cTripId = 2, cServiceId = 1, cRouteIdT = 0, cHeadsign = 3, cDirId = 5;
  await streamLines(join(GTFS_DIR, "trips.txt"), (line) => {
    const p = splitCSV(line);
    if (firstLine) {
      firstLine = false;
      const h = p.map((x) => stripBOM(x).trim());
      cRouteIdT  = h.indexOf("route_id");
      cServiceId = h.indexOf("service_id");
      cTripId    = h.indexOf("trip_id");
      cHeadsign  = h.indexOf("trip_headsign");
      cDirId     = h.indexOf("direction_id");
      return;
    }
    const rid = p[cRouteIdT]?.trim(), sid = p[cServiceId]?.trim(),
          tid = p[cTripId]?.trim(),   hs  = p[cHeadsign]?.trim() ?? "",
          dir = parseInt(p[cDirId]?.trim() ?? "0");
    if (!rid || !tid || !sid) return;
    const sn = routeIdToShortName.get(rid);
    if (!sn) return;
    const dow = serviceIdToDayOfWeek(sid);
    if (dow < 0) return;
    tripMap.set(tid, { routeShortName: sn, dayOfWeek: dow, headsign: hs, directionId: dir });
  });

  // ── Step 3: stop_times.txt — single pass ─────────────────────────────────
  //   • For ALL trips:         first stop (minSeq) → departures index
  //   • For representative:    ALL stops            → per-trip stop time list

  const departures = new Map<string, DepartureEntry[]>();
  // raw collected stop times before joining: tripId → [{sid, arr, dep, seq}]
  const rawTripST = new Map<string, { stopId: string; arr: string; dep: string; seq: number }[]>();

  firstLine = true;
  let cStTripId = 0, cArr = 1, cDep = 2, cStopId = 3, cSeq = 4;

  // Departure tracking per trip (for departures index)
  let prevTripId = "";
  let prevMinSeq = Infinity;
  let prevMinDep = "";

  const finalizeTrip = () => {
    if (!prevTripId || prevMinDep === "") return;
    const meta = tripMap.get(prevTripId);
    if (!meta) return;
    const key = `${meta.routeShortName}|${meta.dayOfWeek}`;
    const bucket = departures.get(key);
    const entry: DepartureEntry = { time: toHHMM(prevMinDep), headsign: meta.headsign, directionId: meta.directionId };
    if (bucket) bucket.push(entry);
    else departures.set(key, [entry]);
  };

  await streamLines(join(GTFS_DIR, "stop_times.txt"), (line) => {
    const p = splitCSV(line);
    if (firstLine) {
      firstLine = false;
      const h = p.map((x) => stripBOM(x).trim());
      cStTripId = h.indexOf("trip_id");
      cArr      = h.indexOf("arrival_time");
      cDep      = h.indexOf("departure_time");
      cStopId   = h.indexOf("stop_id");
      cSeq      = h.indexOf("stop_sequence");
      return;
    }

    const tid = stripBOM(p[cStTripId] ?? "").trim();
    if (!tid) return;

    // Skip quickly if not in our trip map at all
    const inTripMap = tripMap.has(tid);
    const isRep     = repTripToVariant.has(tid);
    if (!inTripMap && !isRep) {
      if (tid !== prevTripId) { finalizeTrip(); prevTripId = tid; prevMinSeq = Infinity; prevMinDep = ""; }
      return;
    }

    const dep = (p[cDep] ?? "").trim();
    const arr = (p[cArr] ?? "").trim();
    const seq = parseInt((p[cSeq] ?? "999999").trim());
    const sid = (p[cStopId] ?? "").trim();

    // Departures index: track min sequence per trip
    if (tid !== prevTripId) {
      finalizeTrip();
      prevTripId = tid; prevMinSeq = seq; prevMinDep = dep;
    } else if (seq < prevMinSeq) {
      prevMinSeq = seq; prevMinDep = dep;
    }

    // Representative trip stop times: collect all stops
    if (isRep) {
      const existing = rawTripST.get(tid);
      const entry = { stopId: sid, arr, dep, seq };
      if (existing) existing.push(entry);
      else rawTripST.set(tid, [entry]);
    }
  });
  finalizeTrip();

  // ── Post-process departures: deduplicate + sort ───────────────────────────
  for (const [key, entries] of departures) {
    const seen = new Set<string>();
    const deduped = entries.filter((e) => {
      const k = `${e.time}|${e.directionId}`;
      if (seen.has(k)) return false;
      seen.add(k); return true;
    });
    deduped.sort((a, b) => a.time.localeCompare(b.time));
    departures.set(key, deduped);
  }

  // ── Build per-variant stop time list: join rawTripST with stop metadata ──
  const tripStopTimes = new Map<string, StopTimeEntry[]>();

  for (const [tripId, rawST] of rawTripST) {
    const variantId = repTripToVariant.get(tripId);

    // Sort raw stop times by sequence
    rawST.sort((a, b) => a.seq - b.seq);

    // Build enriched stop time list
    const entries: StopTimeEntry[] = rawST.map((raw) => {
      // Try to find stop metadata from variant_stops first (most accurate for this variant)
      let stop: GTFSStop | undefined;
      if (variantId) {
        const varStops = variantStops[variantId] ?? [];
        stop = varStops.find((s) => s.stop_id === raw.stopId || s.stop_sequence === raw.seq);
      }
      // Fall back to global stop lookup
      if (!stop) stop = stopById.get(raw.stopId);

      return {
        stopId:        raw.stopId,
        stopName:      stop?.stop_name ?? raw.stopId,
        lat:           stop?.stop_lat  ?? 0,
        lon:           stop?.stop_lon  ?? 0,
        sequence:      raw.seq,
        arrivalTime:   toHHMM(raw.arr  || raw.dep),
        departureTime: toHHMM(raw.dep  || raw.arr),
      };
    });

    tripStopTimes.set(tripId, entries);
  }

  console.log(
    `[gtfsRawIndex] Done in ${Date.now() - t0}ms — ` +
    `${departures.size} dep buckets, ${tripStopTimes.size} trip schedules`,
  );

  return { departures, tripStopTimes };
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function getFullIndex(): Promise<FullIndex> {
  if (cachedIndex) return Promise.resolve(cachedIndex);
  if (!buildingPromise) {
    buildingPromise = buildFullIndex()
      .then((idx) => { cachedIndex = idx; return idx; })
      .catch((err) => { buildingPromise = null; throw err; });
  }
  return buildingPromise;
}

/** True once the index has been built at least once. */
export function isIndexCached(): boolean { return cachedIndex !== null; }
