/**
 * GTFS zip parser — runs in a Web Worker so a heavy feed never blocks the UI.
 *
 * Strategy for large feeds (stop_times.txt alone can be hundreds of MB):
 *  - Stream the zip twice with fflate's streaming Unzip (Blob.stream() gives a
 *    fresh stream per pass), so nothing is fully decompressed into memory.
 *  - Pass 1: small files only — agency, stops, routes, trips, calendar(_dates).
 *  - Pass 2: stop_times.txt + shapes.txt, decoded incrementally and aggregated
 *    on the fly. Trips collapse into *patterns* (unique stop sequences) with
 *    timing summaries; per-row data is discarded immediately.
 *  - Output: gzipped compact CityFeedPayload + stats, transferred back.
 */

import { Unzip, UnzipInflate } from "fflate";
import {
  compressPayload,
  pickFeedColor,
  type CityFeedPayload,
  type CityFeedStats,
  type CityPattern,
  type CityRoute,
  type CityStops,
  type ParserMessage,
} from "../cityGtfs";

const post = (msg: ParserMessage, transfer?: Transferable[]) =>
  (self as unknown as { postMessage(m: unknown, t?: Transferable[]): void }).postMessage(
    msg,
    transfer
  );

// Keep at most this many patterns per route (sorted by trip count) — beyond
// this they're near-duplicate branch variants that bloat the payload.
const MAX_PATTERNS_PER_ROUTE = 12;
// Shape simplification tolerance in degrees (~11 m at Toronto latitudes).
const SHAPE_TOLERANCE_DEG = 0.0001;
const COORD_DECIMALS = 5; // ~1 m — plenty for map display

// ── Streaming CSV ───────────────────────────────────────────────────────────

/**
 * Incremental CSV parser: feed it decoded text chunks, it emits complete rows.
 * Handles quoted fields (including embedded commas/newlines) spanning chunks.
 */
class StreamingCsv {
  private buf = "";
  header: string[] | null = null;

  constructor(private onRow: (fields: string[]) => void) {}

  push(text: string, final = false): void {
    this.buf += text;
    let start = 0;

    for (;;) {
      // Fast path: find next newline; only do the slow quote-aware scan when
      // the candidate line actually contains a quote character.
      const nl = this.buf.indexOf("\n", start);
      if (nl === -1) break;

      let line = this.buf.slice(start, nl);
      let consumedTo = nl + 1;

      if (line.includes('"')) {
        // Quotes may hide the real line end — scan with state.
        const scan = this.scanQuoted(start);
        if (scan === null) break; // row incomplete, wait for more data
        line = this.buf.slice(start, scan.end);
        consumedTo = scan.next;
      }

      this.emitLine(line);
      start = consumedTo;
    }

    this.buf = this.buf.slice(start);

    if (final && this.buf.trim().length > 0) {
      this.emitLine(this.buf);
      this.buf = "";
    }
  }

  /** Find the true end of a row starting at `from`, respecting quotes. */
  private scanQuoted(from: number): { end: number; next: number } | null {
    let inQuotes = false;
    for (let i = from; i < this.buf.length; i++) {
      const c = this.buf.charCodeAt(i);
      if (c === 34 /* " */) inQuotes = !inQuotes;
      else if (c === 10 /* \n */ && !inQuotes) return { end: i, next: i + 1 };
    }
    return null;
  }

  private emitLine(rawLine: string): void {
    const line = rawLine.endsWith("\r") ? rawLine.slice(0, -1) : rawLine;
    if (line.length === 0) return;

    const fields = line.includes('"') ? parseQuotedCsvLine(line) : line.split(",");

    if (!this.header) {
      // Strip UTF-8 BOM from the first header cell
      if (fields[0]?.charCodeAt(0) === 0xfeff) fields[0] = fields[0].slice(1);
      this.header = fields.map((f) => f.trim().toLowerCase());
      return;
    }
    this.onRow(fields);
  }
}

function parseQuotedCsvLine(line: string): string[] {
  const out: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      out.push(field);
      field = "";
    } else {
      field += ch;
    }
  }
  out.push(field);
  return out;
}

// ── Zip streaming ───────────────────────────────────────────────────────────

interface FileSink {
  /** Receives decoded text chunks as the entry decompresses */
  onText: (text: string, final: boolean) => void;
}

/**
 * Stream the zip once, decompressing only the entries in `sinks`
 * (matched by lowercase basename). Reports byte progress via onBytes.
 */
async function streamZip(
  file: File,
  sinks: Record<string, FileSink>,
  onBytes: (pushed: number) => void
): Promise<void> {
  const unzip = new Unzip();
  unzip.register(UnzipInflate);

  let firstError: Error | null = null;

  unzip.onfile = (entry) => {
    const base = entry.name.split("/").pop()?.toLowerCase() ?? "";
    const sink = sinks[base];
    if (!sink || entry.name.endsWith("/")) return;

    const decoder = new TextDecoder("utf-8");
    entry.ondata = (err, data, final) => {
      if (err) {
        firstError ??= err;
        return;
      }
      sink.onText(decoder.decode(data, { stream: !final }), final);
    };
    entry.start();
  };

  const reader = file.stream().getReader();
  let pushed = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      unzip.push(new Uint8Array(0), true);
      break;
    }
    unzip.push(value, false);
    pushed += value.byteLength;
    onBytes(pushed);
    if (firstError) throw firstError;
  }
  if (firstError) throw firstError;
}

// ── GTFS helpers ────────────────────────────────────────────────────────────

function parseTimeSecs(t: string): number | null {
  // "HH:MM:SS" — HH may exceed 23 for post-midnight service
  const p = t.split(":");
  if (p.length < 2) return null;
  const h = +p[0], m = +p[1], s = p.length > 2 ? +p[2] : 0;
  if (Number.isNaN(h) || Number.isNaN(m) || Number.isNaN(s)) return null;
  return h * 3600 + m * 60 + s;
}

function secsToHHMM(secs: number): string {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function yyyymmddToIso(d: string): string | null {
  if (!/^\d{8}$/.test(d)) return null;
  return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
}

function round(n: number): number {
  const f = 10 ** COORD_DECIMALS;
  return Math.round(n * f) / f;
}

/** Iterative Douglas–Peucker (planar with cos-lat correction) — no recursion,
 *  shapes can have tens of thousands of points. */
function simplifyShape(pts: [number, number][], tolDeg: number): [number, number][] {
  if (pts.length <= 2) return pts;
  const cosLat = Math.cos((pts[0][1] * Math.PI) / 180);
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;

  const stack: [number, number][] = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    if (b - a <= 1) continue;
    const ax = pts[a][0] * cosLat, ay = pts[a][1];
    const bx = pts[b][0] * cosLat, by = pts[b][1];
    const vx = bx - ax, vy = by - ay;
    const len2 = vx * vx + vy * vy;
    let maxD2 = -1, argMax = a + 1;
    for (let i = a + 1; i < b; i++) {
      const px = pts[i][0] * cosLat, py = pts[i][1];
      let t = len2 > 0 ? ((px - ax) * vx + (py - ay) * vy) / len2 : 0;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const dx = px - (ax + t * vx), dy = py - (ay + t * vy);
      const d2 = dx * dx + dy * dy;
      if (d2 > maxD2) { maxD2 = d2; argMax = i; }
    }
    if (maxD2 > tolDeg * tolDeg) {
      keep[argMax] = 1;
      stack.push([a, argMax], [argMax, b]);
    }
  }

  const out: [number, number][] = [];
  for (let i = 0; i < pts.length; i++) if (keep[i]) out.push(pts[i]);
  return out;
}

// ── Pattern aggregation ─────────────────────────────────────────────────────

interface PatternAcc {
  stopIds: string[];
  tripCount: number;
  weeklyTrips: number;
  firstDepSecs: number;
  lastDepSecs: number;
  hourly: number[];
  headsignCounts: Map<string, number>;
  shapeCounts: Map<string, number>;
}

interface TripInfo {
  routeId: string;
  serviceId: string;
  shapeId: string;
  headsign: string;
}

// ── Main ────────────────────────────────────────────────────────────────────

async function parse(file: File): Promise<void> {
  const totalBytes = file.size;
  const progress = (phase: string, base: number, span: number, frac: number) =>
    post({ type: "progress", phase, pct: base + span * Math.min(1, frac) });

  // ══ Pass 1: small files ══════════════════════════════════════════════════
  let agency: string | null = null;
  const stops: CityStops = {};
  const routesById = new Map<
    string,
    { shortName: string; longName: string; type: number; color: string }
  >();
  const trips = new Map<string, TripInfo>();
  // service_id → days/week the service operates (from calendar.txt)
  const serviceDaysPerWeek = new Map<string, number>();
  // calendar_dates fallback: service_id → count of added dates
  const serviceDateCounts = new Map<string, number>();
  let minDate = "", maxDate = "";
  const seeDate = (d: string) => {
    if (!d) return;
    if (!minDate || d < minDate) minDate = d;
    if (!maxDate || d > maxDate) maxDate = d;
  };

  const col = (header: string[], name: string) => header.indexOf(name);

  /** Builds the row handler once, when the header row is known. */
  const makeSink = (build: (header: string[]) => (f: string[]) => void): FileSink => {
    let rowFn: ((f: string[]) => void) | null = null;
    const csv: StreamingCsv = new StreamingCsv((fields) => {
      rowFn ??= build(csv.header!);
      rowFn(fields);
    });
    return { onText: (text, final) => csv.push(text, final) };
  };

  const pass1Sinks: Record<string, FileSink> = {
    "agency.txt": makeSink((h) => {
      const i = col(h, "agency_name");
      return (f) => {
        if (agency === null && i >= 0 && f[i]) agency = f[i].trim();
      };
    }),
    "stops.txt": makeSink((h) => {
      const iId = col(h, "stop_id"), iLat = col(h, "stop_lat"),
        iLon = col(h, "stop_lon"), iName = col(h, "stop_name");
      return (f) => {
        const id = f[iId]?.trim();
        const lat = +f[iLat], lon = +f[iLon];
        if (!id || Number.isNaN(lat) || Number.isNaN(lon) || (lat === 0 && lon === 0)) return;
        stops[id] = [round(lon), round(lat), (f[iName] ?? "").trim()];
      };
    }),
    "routes.txt": makeSink((h) => {
      const iId = col(h, "route_id"), iShort = col(h, "route_short_name"),
        iLong = col(h, "route_long_name"), iType = col(h, "route_type"),
        iColor = col(h, "route_color");
      return (f) => {
        const id = f[iId]?.trim();
        if (!id) return;
        const rawColor = (iColor >= 0 ? f[iColor] : "")?.trim().replace(/^#/, "") ?? "";
        routesById.set(id, {
          shortName: (iShort >= 0 ? f[iShort] : "")?.trim() ?? "",
          longName: (iLong >= 0 ? f[iLong] : "")?.trim() ?? "",
          type: iType >= 0 ? parseInt(f[iType], 10) || 3 : 3,
          color: /^[0-9a-fA-F]{6}$/.test(rawColor) ? `#${rawColor.toLowerCase()}` : "",
        });
      };
    }),
    "trips.txt": makeSink((h) => {
      const iTrip = col(h, "trip_id"), iRoute = col(h, "route_id"),
        iService = col(h, "service_id"), iShape = col(h, "shape_id"),
        iHead = col(h, "trip_headsign");
      return (f) => {
        const id = f[iTrip]?.trim();
        if (!id) return;
        trips.set(id, {
          routeId: f[iRoute]?.trim() ?? "",
          serviceId: f[iService]?.trim() ?? "",
          shapeId: (iShape >= 0 ? f[iShape] : "")?.trim() ?? "",
          headsign: (iHead >= 0 ? f[iHead] : "")?.trim() ?? "",
        });
      };
    }),
    "calendar.txt": makeSink((h) => {
      const iService = col(h, "service_id");
      const dayIdx = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]
        .map((d) => col(h, d));
      const iStart = col(h, "start_date"), iEnd = col(h, "end_date");
      return (f) => {
        const sid = f[iService]?.trim();
        if (!sid) return;
        let days = 0;
        for (const i of dayIdx) if (i >= 0 && f[i]?.trim() === "1") days++;
        serviceDaysPerWeek.set(sid, days);
        if (iStart >= 0) seeDate(f[iStart]?.trim() ?? "");
        if (iEnd >= 0) seeDate(f[iEnd]?.trim() ?? "");
      };
    }),
    "calendar_dates.txt": makeSink((h) => {
      const iService = col(h, "service_id"), iDate = col(h, "date"),
        iType = col(h, "exception_type");
      return (f) => {
        const sid = f[iService]?.trim();
        if (!sid) return;
        const d = f[iDate]?.trim() ?? "";
        seeDate(d);
        if (iType < 0 || f[iType]?.trim() !== "2") {
          serviceDateCounts.set(sid, (serviceDateCounts.get(sid) ?? 0) + 1);
        }
      };
    }),
  };

  await streamZip(file, pass1Sinks, (pushed) =>
    progress("Reading stops, routes & trips", 0, 0.15, pushed / totalBytes)
  );

  if (Object.keys(stops).length === 0) {
    throw new Error("No stops found — is this a valid GTFS zip? (missing stops.txt)");
  }
  if (trips.size === 0) {
    throw new Error("No trips found — is this a valid GTFS zip? (missing trips.txt)");
  }

  // Days/week per service — calendar.txt wins; calendar_dates-only feeds
  // estimate from date density over the feed's date range.
  const feedWeeks = (() => {
    if (!minDate || !maxDate) return 1;
    const ms =
      Date.parse(yyyymmddToIso(maxDate) ?? "") - Date.parse(yyyymmddToIso(minDate) ?? "");
    return Math.max(1, ms / (7 * 24 * 3600 * 1000));
  })();
  const daysPerWeek = (serviceId: string): number => {
    const fromCalendar = serviceDaysPerWeek.get(serviceId);
    if (fromCalendar !== undefined && fromCalendar > 0) return fromCalendar;
    const dateCount = serviceDateCounts.get(serviceId);
    if (dateCount) return Math.min(7, dateCount / feedWeeks);
    return 1;
  };

  // ══ Pass 2: stop_times.txt + shapes.txt ═══════════════════════════════════
  // No row-ordering assumptions: some agencies export stop_times/shapes
  // sorted by sequence rather than grouped by id (interleaved rows), which
  // would silently drop geometry. Rows accumulate into flat number arrays
  // keyed by id — cheap even at millions of rows — and are assembled after
  // the stream ends.

  // Intern stop ids so per-trip storage is [seq, stopIdx, …] numbers only.
  const stopIdxById = new Map<string, number>();
  const stopIdByIdx: string[] = [];
  const internStop = (id: string): number => {
    let i = stopIdxById.get(id);
    if (i === undefined) {
      i = stopIdByIdx.length;
      stopIdxById.set(id, i);
      stopIdByIdx.push(id);
    }
    return i;
  };

  // trip_id → [seq, stopIdx, seq, stopIdx, …]
  const tripStopRows = new Map<string, number[]>();
  // trip_id → departure secs at the lowest stop_sequence seen so far
  const tripFirstDep = new Map<string, { seq: number; secs: number }>();

  // shape_id → [seq, lon, lat, …] (only shapes referenced by trips)
  const referencedShapes = new Set<string>();
  for (const t of trips.values()) if (t.shapeId) referencedShapes.add(t.shapeId);
  const shapeRows = new Map<string, number[]>();

  const pass2Sinks: Record<string, FileSink> = {
    "stop_times.txt": makeSink((h) => {
      const iTrip = col(h, "trip_id"), iStop = col(h, "stop_id"),
        iSeq = col(h, "stop_sequence"), iDep = col(h, "departure_time"),
        iArr = col(h, "arrival_time");
      return (f) => {
        const tripId = f[iTrip]?.trim();
        const stopId = f[iStop]?.trim();
        const seq = +f[iSeq];
        if (!tripId || !stopId || Number.isNaN(seq)) return;
        let rows = tripStopRows.get(tripId);
        if (!rows) {
          rows = [];
          tripStopRows.set(tripId, rows);
        }
        rows.push(seq, internStop(stopId));
        const cur = tripFirstDep.get(tripId);
        if (!cur || seq < cur.seq) {
          const t = parseTimeSecs(f[iDep] || (iArr >= 0 ? f[iArr] : "") || "");
          if (t !== null) tripFirstDep.set(tripId, { seq, secs: t });
        }
      };
    }),
    "shapes.txt": makeSink((h) => {
      const iId = col(h, "shape_id"), iLat = col(h, "shape_pt_lat"),
        iLon = col(h, "shape_pt_lon"), iSeq = col(h, "shape_pt_sequence");
      return (f) => {
        const id = f[iId]?.trim();
        if (!id || !referencedShapes.has(id)) return;
        const lat = +f[iLat], lon = +f[iLon], seq = +f[iSeq];
        if (Number.isNaN(lat) || Number.isNaN(lon)) return;
        let rows = shapeRows.get(id);
        if (!rows) {
          rows = [];
          shapeRows.set(id, rows);
        }
        rows.push(Number.isNaN(seq) ? rows.length / 3 : seq, lon, lat);
      };
    }),
  };

  await streamZip(file, pass2Sinks, (pushed) =>
    progress("Processing stop times & shapes", 0.15, 0.65, pushed / totalBytes)
  );

  if (tripStopRows.size === 0) {
    throw new Error("No stop times found — is this a valid GTFS zip? (missing stop_times.txt)");
  }

  // ── Simplify shapes (sorted by sequence, order-independent) ───────────────
  progress("Simplifying route shapes", 0.8, 0.05, 0.3);
  const simplifiedShapes = new Map<string, [number, number][]>();
  for (const [shapeId, rows] of shapeRows) {
    const n = rows.length / 3;
    if (n < 2) continue;
    const order = Array.from({ length: n }, (_, i) => i).sort(
      (a, b) => rows[a * 3] - rows[b * 3]
    );
    const pts = order.map((i) => [rows[i * 3 + 1], rows[i * 3 + 2]] as [number, number]);
    simplifiedShapes.set(
      shapeId,
      simplifyShape(pts, SHAPE_TOLERANCE_DEG).map(([lon, lat]) => [round(lon), round(lat)])
    );
  }
  shapeRows.clear();

  // ── Collapse trips into patterns ───────────────────────────────────────────
  progress("Building route patterns", 0.85, 0.05, 0.3);
  const patternsByRoute = new Map<string, Map<string, PatternAcc>>();
  let totalTrips = 0;

  for (const [tripId, rows] of tripStopRows) {
    const trip = trips.get(tripId);
    const n = rows.length / 2;
    if (!trip || !trip.routeId || n < 2) continue;

    const order = Array.from({ length: n }, (_, i) => i).sort(
      (a, b) => rows[a * 2] - rows[b * 2]
    );
    const stopIds = order.map((i) => stopIdByIdx[rows[i * 2 + 1]]);
    const key = stopIds.join("\u0001");

    let routePatterns = patternsByRoute.get(trip.routeId);
    if (!routePatterns) {
      routePatterns = new Map();
      patternsByRoute.set(trip.routeId, routePatterns);
    }
    let acc = routePatterns.get(key);
    if (!acc) {
      acc = {
        stopIds,
        tripCount: 0,
        weeklyTrips: 0,
        firstDepSecs: Infinity,
        lastDepSecs: -Infinity,
        hourly: new Array(24).fill(0),
        headsignCounts: new Map(),
        shapeCounts: new Map(),
      };
      routePatterns.set(key, acc);
    }
    acc.tripCount++;
    acc.weeklyTrips += daysPerWeek(trip.serviceId);
    const firstDep = tripFirstDep.get(tripId)?.secs;
    if (firstDep !== undefined) {
      acc.firstDepSecs = Math.min(acc.firstDepSecs, firstDep);
      acc.lastDepSecs = Math.max(acc.lastDepSecs, firstDep);
      acc.hourly[Math.floor(firstDep / 3600) % 24]++;
    }
    if (trip.headsign) {
      acc.headsignCounts.set(trip.headsign, (acc.headsignCounts.get(trip.headsign) ?? 0) + 1);
    }
    if (trip.shapeId) {
      acc.shapeCounts.set(trip.shapeId, (acc.shapeCounts.get(trip.shapeId) ?? 0) + 1);
    }
    totalTrips++;
  }
  tripStopRows.clear();

  if (totalTrips === 0) {
    throw new Error("No stop times matched trips.txt — is this a valid GTFS zip?");
  }

  // ══ Assemble compact payload ══════════════════════════════════════════════
  progress("Building compact payload", 0.9, 0.05, 0.5);

  const usedStopIds = new Set<string>();
  const routes: CityRoute[] = [];
  let colorIdx = 0;
  let totalPatterns = 0;

  for (const [routeId, patternMap] of patternsByRoute) {
    const info = routesById.get(routeId);
    const accs = [...patternMap.values()]
      .sort((a, b) => b.tripCount - a.tripCount)
      .slice(0, MAX_PATTERNS_PER_ROUTE);

    const patterns: CityPattern[] = accs.map((acc) => {
      for (const sid of acc.stopIds) usedStopIds.add(sid);
      let topHeadsign = "", topHeadsignN = 0;
      for (const [hs, n] of acc.headsignCounts) {
        if (n > topHeadsignN) { topHeadsign = hs; topHeadsignN = n; }
      }
      let topShape = "", topShapeN = 0;
      for (const [sh, n] of acc.shapeCounts) {
        if (n > topShapeN) { topShape = sh; topShapeN = n; }
      }
      return {
        stopIds: acc.stopIds,
        tripCount: acc.tripCount,
        weeklyTrips: Math.round(acc.weeklyTrips),
        firstDeparture: acc.firstDepSecs !== Infinity ? secsToHHMM(acc.firstDepSecs) : "",
        lastDeparture: acc.lastDepSecs !== -Infinity ? secsToHHMM(acc.lastDepSecs) : "",
        hourly: acc.hourly,
        headsign: topHeadsign,
        shape: simplifiedShapes.get(topShape) ?? null,
      };
    });
    totalPatterns += patterns.length;

    routes.push({
      id: routeId,
      shortName: info?.shortName ?? routeId,
      longName: info?.longName ?? "",
      type: info?.type ?? 3,
      color: info?.color || pickFeedColor(colorIdx++),
      patterns,
    });
  }
  routes.sort((a, b) =>
    (a.shortName || a.longName).localeCompare(b.shortName || b.longName, undefined, { numeric: true })
  );

  const keptStops: CityStops = {};
  let west = Infinity, south = Infinity, east = -Infinity, north = -Infinity;
  for (const sid of usedStopIds) {
    const s = stops[sid];
    if (!s) continue;
    keptStops[sid] = s;
    if (s[0] < west) west = s[0];
    if (s[0] > east) east = s[0];
    if (s[1] < south) south = s[1];
    if (s[1] > north) north = s[1];
  }

  const stats: CityFeedStats = {
    stops: Object.keys(keptStops).length,
    routes: routes.length,
    trips: totalTrips,
    patterns: totalPatterns,
    bbox: [west, south, east, north],
    serviceStart: yyyymmddToIso(minDate) ?? undefined,
    serviceEnd: yyyymmddToIso(maxDate) ?? undefined,
  };

  const payload: CityFeedPayload = { version: 1, stops: keptStops, routes };

  progress("Compressing", 0.95, 0.04, 0.5);
  const gzipped = compressPayload(payload);
  const buf = gzipped.buffer.slice(
    gzipped.byteOffset,
    gzipped.byteOffset + gzipped.byteLength
  ) as ArrayBuffer;

  post({ type: "result", agency, stats, gzipped: buf }, [buf]);
}

self.onmessage = (e: MessageEvent<{ file: File }>) => {
  parse(e.data.file).catch((err: unknown) => {
    post({
      type: "error",
      message: err instanceof Error ? err.message : "Failed to parse GTFS zip",
    });
  });
};
