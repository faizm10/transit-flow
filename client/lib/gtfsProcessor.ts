/**
 * TypeScript GTFS feed processor.
 * Accepts a GTFS ZIP buffer and produces 8 derived JSON/GeoJSON files,
 * then uploads them to Vercel Blob.
 *
 * Port of scripts/build_subroutes.py + scripts/build_gtfs_derived.py.
 */

import { unzipSync } from "fflate";
import { put } from "@vercel/blob";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ProcessResult {
  blobBaseUrl: string;
  routeCount: number;
  stopCount: number;
}

interface GtfsRoute {
  route_id: string;
  route_short_name: string;
  route_long_name: string;
  route_type: number;
  route_color: string;
}

interface GtfsTrip {
  trip_id: string;
  route_id: string;
  service_id: string;
  direction_id: number;
  shape_id: string | null;
  trip_headsign: string;
  route_variant: string;
}

interface GtfsStop {
  stop_id: string;
  stop_name: string;
  lat: number;
  lon: number;
}

interface VariantGroup {
  route_id: string;
  direction_id: number;
  signature: string;
  trip_count: number;
  weekly_trip_count: number;
  representative_trip_id: string;
  shape_id: string | null;
  headsign: string;
  route_variant: string;
  stop_sequence: Array<{ seq: number; stop_id: string }>;
  last_stop_id: string;
}

// ── CSV Parser ────────────────────────────────────────────────────────────────

function parseCSV(text: string): Record<string, string>[] {
  // Strip UTF-8 BOM
  const clean = text.startsWith("﻿") ? text.slice(1) : text;
  const lines = clean.split(/\r?\n/);
  if (lines.length < 2) return [];

  const headers = splitCSVLine(lines[0]);
  const rows: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const values = splitCSVLine(line);
    const row: Record<string, string> = {};
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = values[j] ?? "";
    }
    rows.push(row);
  }
  return rows;
}

function splitCSVLine(line: string): string[] {
  const fields: string[] = [];
  let i = 0;
  while (i <= line.length) {
    if (i === line.length) { fields.push(""); break; }
    if (line[i] === '"') {
      // Quoted field
      let value = "";
      i++;
      while (i < line.length) {
        if (line[i] === '"') {
          if (line[i + 1] === '"') { value += '"'; i += 2; }
          else { i++; break; }
        } else {
          value += line[i++];
        }
      }
      fields.push(value);
      if (line[i] === ",") i++;
    } else {
      const end = line.indexOf(",", i);
      if (end === -1) { fields.push(line.slice(i)); break; }
      fields.push(line.slice(i, end));
      i = end + 1;
    }
  }
  return fields;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function decode(bytes: Uint8Array): string {
  return new TextDecoder("utf-8").decode(bytes);
}

/**
 * Iterate lines of a huge CSV string without building an array of millions of
 * line strings (stop_times.txt for a big city can be 500 MB+ decoded —
 * `split()` would roughly double peak memory).
 */
function* iterateLines(text: string): Generator<string> {
  let start = 0;
  const n = text.length;
  while (start < n) {
    let end = text.indexOf("\n", start);
    if (end === -1) end = n;
    let line = text.slice(start, end);
    if (line.endsWith("\r")) line = line.slice(0, -1);
    yield line;
    start = end + 1;
  }
}

function pyDowToJs(pyWeekday: number): number {
  // Python weekday 0=Mon,6=Sun → JS getDay 0=Sun,6=Sat
  return (pyWeekday + 1) % 7;
}

function toHHMM(timeStr: string): string {
  return (timeStr || "").trim().slice(0, 5);
}

function parseSecs(t: string): number | null {
  const parts = (t || "").trim().split(":");
  if (parts.length < 2) return null;
  const h = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  const s = parts[2] ? parseInt(parts[2], 10) : 0;
  if (isNaN(h) || isNaN(m) || isNaN(s)) return null;
  return h * 3600 + m * 60 + s;
}

function suffixForIndex(i: number): string {
  return i < 26 ? String.fromCharCode(65 + i) : `V${i + 1}`;
}

// ── Step 1: Determine representative service IDs per JS day-of-week ──────────

function buildServiceDowMap(
  calendarRows: Record<string, string>[],
  calendarDatesRows: Record<string, string>[],
  today: Date,
): Map<number, string> {
  // Strategy: build a map of service_id → Set<JS_dow> by combining calendar.txt and calendar_dates.txt

  const serviceActiveDates = new Map<string, Set<string>>(); // service_id → ISO date strings

  // Process calendar.txt (explicit weekly schedule)
  const DOW_FIELDS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  if (calendarRows.length > 0) {
    for (const row of calendarRows) {
      const sid = row.service_id?.trim();
      if (!sid) continue;
      const startDate = row.start_date?.trim();
      const endDate = row.end_date?.trim();
      if (!startDate || !endDate) continue;

      const start = parseGtfsDate(startDate);
      const end = parseGtfsDate(endDate);
      if (!start || !end) continue;

      const dates = new Set<string>();
      const cursor = new Date(start);
      while (cursor <= end) {
        const jsDay = cursor.getUTCDay(); // 0=Sun,6=Sat
        if (row[DOW_FIELDS[jsDay]] === "1") {
          dates.add(cursor.toISOString().slice(0, 10));
        }
        cursor.setUTCDate(cursor.getUTCDate() + 1);
      }
      serviceActiveDates.set(sid, dates);
    }
  }

  // Apply calendar_dates.txt exceptions
  for (const row of calendarDatesRows) {
    const sid = row.service_id?.trim();
    const dateStr = row.date?.trim();
    const type = row.exception_type?.trim();
    if (!sid || !dateStr) continue;

    const iso = gtfsDateToISO(dateStr);
    if (!iso) continue;

    if (!serviceActiveDates.has(sid)) serviceActiveDates.set(sid, new Set());
    const dates = serviceActiveDates.get(sid)!;
    if (type === "2") dates.delete(iso);
    else dates.add(iso);
  }

  // For each JS DOW, pick the service_id that has the most upcoming (or recent) dates
  const todayISO = today.toISOString().slice(0, 10);
  const rep = new Map<number, string>();

  // Collect all active dates per DOW per service
  const dowServiceCounts = new Map<number, Map<string, number>>(); // dow → serviceId → count of near-today dates
  for (const [sid, dates] of serviceActiveDates) {
    for (const iso of dates) {
      const d = new Date(iso + "T12:00:00Z");
      const jsDay = d.getUTCDay();
      if (!dowServiceCounts.has(jsDay)) dowServiceCounts.set(jsDay, new Map());
      const map = dowServiceCounts.get(jsDay)!;
      // Score: future dates score higher (closer = higher score)
      const delta = (new Date(iso + "T12:00:00Z").getTime() - new Date(todayISO + "T12:00:00Z").getTime()) / 86400000;
      const score = delta >= 0 ? 1000 - delta : delta; // future is positive, prefer closest future
      map.set(sid, (map.get(sid) ?? 0) + (delta >= 0 ? 1 : 0));
    }
  }

  // Pick the service_id with most future dates per DOW
  for (const [jsDay, serviceMap] of dowServiceCounts) {
    let bestSid = "";
    let bestCount = -Infinity;
    for (const [sid, count] of serviceMap) {
      if (count > bestCount) { bestCount = count; bestSid = sid; }
    }
    if (bestSid) rep.set(jsDay, bestSid);
  }

  // If calendar_dates.txt uses date-as-service-id (GO Transit style), handle that too
  if (rep.size === 0 && calendarDatesRows.length > 0) {
    const best = new Map<number, { delta: number; sid: string }>();
    for (const row of calendarDatesRows) {
      const sid = row.service_id?.trim() ?? "";
      if (sid.length !== 8) continue; // expect YYYYMMDD
      const iso = gtfsDateToISO(sid);
      if (!iso) continue;
      const d = new Date(iso + "T12:00:00Z");
      const jsDay = d.getUTCDay();
      const delta = (d.getTime() - new Date(todayISO + "T12:00:00Z").getTime()) / 86400000;
      const cur = best.get(jsDay);
      const preferFuture = !cur ||
        (delta >= 0 && (cur.delta < 0 || delta < cur.delta)) ||
        (delta < 0 && cur.delta < 0 && delta > cur.delta);
      if (preferFuture) best.set(jsDay, { delta, sid });
    }
    for (const [jsDay, { sid }] of best) rep.set(jsDay, sid);
  }

  return rep;
}

function parseGtfsDate(s: string): Date | null {
  if (!s || s.length !== 8) return null;
  const iso = `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
  const d = new Date(iso + "T12:00:00Z");
  return isNaN(d.getTime()) ? null : d;
}

function gtfsDateToISO(s: string): string | null {
  if (!s || s.length !== 8) return null;
  return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
}

// ── Main processor ────────────────────────────────────────────────────────────

export async function processGtfsFeed(
  zipBuffer: ArrayBuffer,
  feedId: string,
  onProgress?: (msg: string) => void,
): Promise<ProcessResult> {
  const log = (msg: string) => { onProgress?.(msg); };

  // ── Unzip ────────────────────────────────────────────────────────────────
  log("Unzipping GTFS feed…");
  // Normalize filenames: some feeds wrap files in a subfolder
  const files = new Map<string, Uint8Array>();
  {
    let rawFiles: Record<string, Uint8Array> | null = unzipSync(new Uint8Array(zipBuffer));
    for (const [path, data] of Object.entries(rawFiles)) {
      const name = path.includes("/") ? path.split("/").pop()! : path;
      files.set(name, data);
    }
    rawFiles = null; // release the container so consumed entries can be GC'd
  }

  // Each file is read exactly once; drop the compressed bytes immediately so
  // peak memory holds only one decoded copy of each file at a time.
  const require = (name: string) => {
    const data = files.get(name);
    if (!data) throw new Error(`This ZIP doesn't look like a GTFS feed — missing required file: ${name}`);
    files.delete(name);
    return decode(data);
  };
  const optional = (name: string) => {
    const data = files.get(name);
    if (!data) return "";
    files.delete(name);
    return decode(data);
  };

  // ── Parse core GTFS files ────────────────────────────────────────────────
  log("Parsing routes.txt…");
  const routeRows = parseCSV(require("routes.txt"));
  const routes: GtfsRoute[] = routeRows.map(r => ({
    route_id:         r.route_id?.trim() ?? "",
    route_short_name: r.route_short_name?.trim() ?? "",
    route_long_name:  r.route_long_name?.trim() ?? "",
    route_type:       parseInt(r.route_type?.trim() || "3", 10) || 3,
    route_color:      r.route_color?.trim() ?? "",
  })).filter(r => r.route_id);

  const routeById = new Map(routes.map(r => [r.route_id, r]));

  log("Parsing stops.txt…");
  const stopRows = parseCSV(require("stops.txt"));
  const stopsLookup = new Map<string, GtfsStop>();
  for (const r of stopRows) {
    const sid = r.stop_id?.trim();
    if (!sid) continue;
    const lat = parseFloat(r.stop_lat);
    const lon = parseFloat(r.stop_lon);
    if (isNaN(lat) || isNaN(lon)) continue;
    stopsLookup.set(sid, { stop_id: sid, stop_name: r.stop_name?.trim() ?? sid, lat, lon });
  }
  log(`  ${stopsLookup.size.toLocaleString()} stops`);

  log("Parsing trips.txt…");
  const tripRows = parseCSV(require("trips.txt"));
  const trips = new Map<string, GtfsTrip>();
  for (const r of tripRows) {
    const tid = r.trip_id?.trim();
    if (!tid) continue;
    trips.set(tid, {
      trip_id:       tid,
      route_id:      r.route_id?.trim() ?? "",
      service_id:    r.service_id?.trim() ?? "",
      direction_id:  parseInt(r.direction_id?.trim() || "0", 10) || 0,
      shape_id:      r.shape_id?.trim() || null,
      trip_headsign: r.trip_headsign?.trim() ?? "",
      route_variant: r.route_variant?.trim() ?? "",
    });
  }
  log(`  ${trips.size.toLocaleString()} trips`);

  log("Parsing calendar…");
  const calendarText = optional("calendar.txt");
  const calendarDatesText = optional("calendar_dates.txt");
  const calendarRows = calendarText ? parseCSV(calendarText) : [];
  const calendarDatesRows = calendarDatesText ? parseCSV(calendarDatesText) : [];
  const repByDow = buildServiceDowMap(calendarRows, calendarDatesRows, new Date());
  const repServiceIds = new Set(repByDow.values());
  log(`  Representative DOWs: ${JSON.stringify(Object.fromEntries(repByDow))}`);

  // ── Parse stop_times.txt (the big file) ─────────────────────────────────
  // First, build the set of trip IDs we need:
  // - All trips whose service_id is in repServiceIds (for sim + departures)
  // - Representative trip IDs from variants (for schedule API)
  // We'll build variants first from a stop_times scan to get repTripIds,
  // but that would require two passes. Instead, we collect ALL trip stop times
  // for repService trips, then build variants from those.

  log("Parsing stop_times.txt (large file, may take a while)…");
  let stopTimesText: string | null = require("stop_times.txt");

  // We need sim trips and will determine rep trips during variant building
  // Collect: for rep-service trips → sim stop times
  //          for all trips → just stop_id ordered list (for variant building)
  const tripStopSeq = new Map<string, Array<{ seq: number; stop_id: string }>>();
  const simStopTimes = new Map<string, Array<{ stop_id: string; t: number; seq: number }>>();

  // Trips in representative service days (for simulation)
  const simTripIds = new Set<string>();
  for (const [, trip] of trips) {
    if (repServiceIds.has(trip.service_id)) simTripIds.add(trip.trip_id);
  }

  // Parse stop_times (single streaming pass — no line array)
  let colTripId = -1, colStopId = -1, colSeq = -1, colDep = -1, colArr = -1;
  let sawHeader = false;
  let rowCount = 0;
  for (const rawLine of iterateLines(stopTimesText)) {
    if (!sawHeader) {
      sawHeader = true;
      const headers = splitCSVLine(rawLine.startsWith("﻿") ? rawLine.slice(1) : rawLine);
      colTripId = headers.indexOf("trip_id");
      colStopId = headers.indexOf("stop_id");
      colSeq    = headers.indexOf("stop_sequence");
      colDep    = headers.indexOf("departure_time");
      colArr    = headers.indexOf("arrival_time");
      continue;
    }
    const line = rawLine.trim();
    if (!line) continue;
    rowCount++;
    if (rowCount % 500_000 === 0) log(`  ${rowCount.toLocaleString()} stop_time rows…`);

    const vals = splitCSVLine(line);
    const tid     = vals[colTripId]?.trim() ?? "";
    const stopId  = vals[colStopId]?.trim() ?? "";
    const seqRaw  = vals[colSeq]?.trim() ?? "0";
    const depRaw  = vals[colDep]?.trim() ?? "";
    const arrRaw  = vals[colArr]?.trim() ?? depRaw;
    if (!tid || !stopId) continue;

    const seq = parseInt(seqRaw, 10) || 0;

    // Always collect stop sequence for variant building
    if (!tripStopSeq.has(tid)) tripStopSeq.set(tid, []);
    tripStopSeq.get(tid)!.push({ seq, stop_id: stopId });

    // Collect sim stop times only for rep-service trips
    if (simTripIds.has(tid)) {
      const depStr = depRaw || arrRaw;
      const depSecs = parseSecs(depStr);
      if (depSecs !== null) {
        if (!simStopTimes.has(tid)) simStopTimes.set(tid, []);
        simStopTimes.get(tid)!.push({ stop_id: stopId, t: depSecs, seq });
      }
    }
  }
  stopTimesText = null; // release the decoded CSV before building derived outputs
  log(`  ${rowCount.toLocaleString()} rows processed`);

  // Sort stop sequences
  for (const [, seqs] of tripStopSeq) seqs.sort((a, b) => a.seq - b.seq);
  for (const [, stops] of simStopTimes) stops.sort((a, b) => a.seq - b.seq);

  // ── Build variants (port of build_subroutes.py) ──────────────────────────
  log("Building route variants…");
  const variantGroups = new Map<string, VariantGroup>(); // key → group

  for (const [tid] of tripStopSeq) {
    const trip = trips.get(tid);
    if (!trip) continue;
    const seqs = tripStopSeq.get(tid)!;
    if (seqs.length === 0) continue;

    const orderedStopIds = seqs.map(s => s.stop_id);
    const signature = orderedStopIds.join("|");
    const key = `${trip.route_id}|${trip.direction_id}|${signature}`;

    let group = variantGroups.get(key);
    if (!group) {
      group = {
        route_id: trip.route_id,
        direction_id: trip.direction_id,
        signature,
        trip_count: 0,
        weekly_trip_count: 0,
        representative_trip_id: tid,
        shape_id: trip.shape_id,
        headsign: trip.trip_headsign,
        route_variant: trip.route_variant,
        stop_sequence: seqs,
        last_stop_id: orderedStopIds[orderedStopIds.length - 1],
      };
      variantGroups.set(key, group);
    } else {
      if (trip.shape_id && (!group.shape_id || trip.shape_id < group.shape_id)) {
        group.shape_id = trip.shape_id;
      }
      if (trip.trip_headsign && (!group.headsign || tid < group.representative_trip_id)) {
        group.headsign = trip.trip_headsign;
      }
    }
    group.trip_count++;
    if (repServiceIds.has(trip.service_id)) group.weekly_trip_count++;
  }

  // Group variants by route short name
  const variantsByShort = new Map<string, VariantGroup[]>();
  for (const [, group] of variantGroups) {
    const route = routeById.get(group.route_id);
    const shortName = route?.route_short_name || group.route_id;
    if (!variantsByShort.has(shortName)) variantsByShort.set(shortName, []);
    variantsByShort.get(shortName)!.push(group);
  }

  // Sort and label variants, build variants_index
  const variantsIndex: Record<string, unknown[]> = {};
  const variantsOrdered: Array<{ shortName: string; entry: Record<string, unknown>; group: VariantGroup }> = [];

  for (const [shortName, groups] of [...variantsByShort.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    groups.sort((a, b) =>
      b.trip_count - a.trip_count ||
      a.direction_id - b.direction_id ||
      (a.shape_id ?? "~~~").localeCompare(b.shape_id ?? "~~~")
    );

    const variantList: unknown[] = [];
    for (let idx = 0; idx < groups.length; idx++) {
      const group = groups[idx];
      const suffix = suffixForIndex(idx);
      const variantId = `${shortName}${suffix}`;

      let label = group.headsign;
      if (!label) {
        const lastStop = stopsLookup.get(group.last_stop_id);
        label = lastStop ? `to ${lastStop.stop_name}` : `${shortName} ${suffix}`;
      }

      const entry = {
        variant_id:             variantId,
        label,
        route_id:               group.route_id,
        direction_id:           group.direction_id,
        shape_id:               group.shape_id,
        trip_count:             group.trip_count,
        weekly_trip_count:      group.weekly_trip_count,
        representative_trip_id: group.representative_trip_id,
        route_variant:          group.route_variant,
      };
      variantList.push(entry);
      variantsOrdered.push({ shortName, entry: entry as Record<string, unknown>, group });
    }
    variantsIndex[shortName] = variantList;
  }

  // ── variant_stops ────────────────────────────────────────────────────────
  const variantStops: Record<string, unknown[]> = {};
  for (const { entry, group } of variantsOrdered) {
    const vid = entry.variant_id as string;
    variantStops[vid] = group.stop_sequence.map(({ seq, stop_id }) => {
      const s = stopsLookup.get(stop_id);
      return {
        stop_id,
        stop_name: s?.stop_name ?? stop_id,
        stop_lat:  s?.lat ?? 0,
        stop_lon:  s?.lon ?? 0,
        stop_sequence: seq,
      };
    });
  }

  // ── shapes (only needed shape_ids) ───────────────────────────────────────
  log("Parsing shapes.txt…");
  const neededShapeIds = new Set(
    variantsOrdered.map(v => v.group.shape_id).filter((s): s is string => !!s)
  );
  const shapePoints = new Map<string, Array<{ seq: number; lon: number; lat: number }>>();

  let shapesText: string | null = optional("shapes.txt");
  if (shapesText) {
    let cShapeId = -1, cLat = -1, cLon = -1, cSeq = -1;
    let sawShapeHeader = false;
    for (const rawLine of iterateLines(shapesText)) {
      if (!sawShapeHeader) {
        sawShapeHeader = true;
        const sHdrs = splitCSVLine(rawLine.startsWith("﻿") ? rawLine.slice(1) : rawLine);
        cShapeId = sHdrs.indexOf("shape_id");
        cLat     = sHdrs.indexOf("shape_pt_lat");
        cLon     = sHdrs.indexOf("shape_pt_lon");
        cSeq     = sHdrs.indexOf("shape_pt_sequence");
        continue;
      }
      const sl = rawLine.trim();
      if (!sl) continue;
      const sv = splitCSVLine(sl);
      const shapeId = sv[cShapeId]?.trim() ?? "";
      if (!neededShapeIds.has(shapeId)) continue;
      const lat = parseFloat(sv[cLat] ?? "");
      const lon = parseFloat(sv[cLon] ?? "");
      const seq = parseInt(sv[cSeq] ?? "0", 10) || 0;
      if (isNaN(lat) || isNaN(lon)) continue;
      if (!shapePoints.has(shapeId)) shapePoints.set(shapeId, []);
      shapePoints.get(shapeId)!.push({ seq, lon, lat });
    }
    for (const [, pts] of shapePoints) pts.sort((a, b) => a.seq - b.seq);
  }
  shapesText = null;

  // ── variant_lines.geojson ────────────────────────────────────────────────
  log("Building variant_lines.geojson…");
  const geojsonFeatures: unknown[] = [];
  const seenShapeIds = new Set<string>();

  for (const { shortName, entry, group } of variantsOrdered) {
    const shapeId = group.shape_id;
    if (!shapeId || seenShapeIds.has(shapeId)) continue;
    const pts = shapePoints.get(shapeId);
    if (!pts || pts.length < 2) continue;
    seenShapeIds.add(shapeId);

    const route = routeById.get(group.route_id);
    const rawColor = route?.route_color ?? "";
    const routeColor = /^[0-9A-Fa-f]{6}$/.test(rawColor) ? `#${rawColor}` : "#0066CC";

    geojsonFeatures.push({
      type: "Feature",
      geometry: {
        type: "LineString",
        coordinates: pts.map(p => [p.lon, p.lat]),
      },
      properties: {
        route_short_name: shortName,
        variant_id:       entry.variant_id,
        shape_id:         shapeId,
        route_id:         entry.route_id,
        direction_id:     entry.direction_id,
        trip_count:       entry.trip_count,
        weekly_trip_count: entry.weekly_trip_count,
        route_color:      routeColor,
      },
    });
  }
  const variantLines = { type: "FeatureCollection", features: geojsonFeatures };

  // ── routes_index.json (with route_color) ────────────────────────────────
  const routesIndex = routes.map(r => ({
    route_id:         r.route_id,
    route_short_name: r.route_short_name,
    route_long_name:  r.route_long_name,
    route_type:       r.route_type,
    route_color:      r.route_color,
  }));

  // ── stops_lookup.json ────────────────────────────────────────────────────
  const stopsLookupOut: Record<string, unknown> = {};
  for (const [sid, s] of stopsLookup) {
    stopsLookupOut[sid] = { lat: s.lat, lon: s.lon, name: s.stop_name };
  }

  // ── sim_trips_by_dow.json ────────────────────────────────────────────────
  log("Building sim_trips_by_dow.json…");
  const tripsByService = new Map<string, GtfsTrip[]>();
  for (const [, trip] of trips) {
    if (repServiceIds.has(trip.service_id)) {
      if (!tripsByService.has(trip.service_id)) tripsByService.set(trip.service_id, []);
      tripsByService.get(trip.service_id)!.push(trip);
    }
  }

  const simByDow: Record<string, unknown[]> = {};
  for (const [jsDow, serviceId] of repByDow) {
    const bucket: unknown[] = [];
    for (const trip of (tripsByService.get(serviceId) ?? [])) {
      const st = simStopTimes.get(trip.trip_id);
      if (!st || st.length < 2) continue;
      const route = routeById.get(trip.route_id);
      bucket.push({
        trip_id:          trip.trip_id,
        route_short_name: route?.route_short_name ?? "",
        route_long_name:  trip.trip_headsign || route?.route_long_name || "",
        route_type:       route?.route_type ?? 3,
        shape_id:         trip.shape_id,
        stops:            st,
      });
    }
    simByDow[String(jsDow)] = bucket;
    log(`  DOW ${jsDow}: ${bucket.length.toLocaleString()} trips`);
  }

  // ── departures_index.json ────────────────────────────────────────────────
  log("Building departures_index.json…");
  const departuresIndex: Record<string, unknown[]> = {};

  for (const [jsDow, serviceId] of repByDow) {
    for (const trip of (tripsByService.get(serviceId) ?? [])) {
      const route = routeById.get(trip.route_id);
      const sn = route?.route_short_name ?? "";
      if (!sn) continue;
      const st = simStopTimes.get(trip.trip_id);
      if (!st || st.length === 0) continue;
      const depSecs = st[0].t;
      const h = Math.floor((depSecs % 86400) / 3600);
      const m = Math.floor((depSecs % 3600) / 60);
      const key = `${sn}|${jsDow}`;
      const fromStop = stopsLookup.get(st[0].stop_id)?.stop_name ?? st[0].stop_id;
      const entry = {
        time:        `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`,
        headsign:    trip.trip_headsign,
        directionId: trip.direction_id,
        fromStop,
      };
      if (!departuresIndex[key]) departuresIndex[key] = [];
      departuresIndex[key].push(entry);
    }
  }

  // Deduplicate and sort
  for (const key of Object.keys(departuresIndex)) {
    const seen = new Set<string>();
    const deduped: unknown[] = [];
    for (const e of departuresIndex[key] as Array<Record<string, unknown>>) {
      const k = `${e.time}|${e.directionId}|${e.headsign}|${e.fromStop}`;
      if (!seen.has(k)) { seen.add(k); deduped.push(e); }
    }
    (deduped as Array<Record<string, unknown>>).sort((a, b) => String(a.time).localeCompare(String(b.time)));
    departuresIndex[key] = deduped;
  }

  // Backfill empty DOW buckets from nearest day with service
  const allShortNames = new Set<string>();
  for (const [, trips] of tripsByService) {
    for (const t of trips) {
      const sn = routeById.get(t.route_id)?.route_short_name ?? "";
      if (sn) allShortNames.add(sn);
    }
  }
  for (const sn of allShortNames) {
    for (let d = 0; d < 7; d++) {
      const k = `${sn}|${d}`;
      if (departuresIndex[k]?.length) continue;
      for (let dist = 1; dist < 7; dist++) {
        const donor = `${sn}|${(d + dist) % 7}`;
        if (departuresIndex[donor]?.length) {
          departuresIndex[k] = [...departuresIndex[donor]];
          break;
        }
        const donor2 = `${sn}|${(d - dist + 7) % 7}`;
        if (departuresIndex[donor2]?.length) {
          departuresIndex[k] = [...departuresIndex[donor2]];
          break;
        }
      }
    }
  }

  // ── trip_stop_times.json (for schedule API) ───────────────────────────────
  log("Building trip_stop_times.json…");
  const repTripIds = new Set<string>();
  for (const { entry } of variantsOrdered) {
    repTripIds.add(entry.representative_trip_id as string);
  }

  const tripStopTimesOut: Record<string, unknown[]> = {};
  for (const tid of repTripIds) {
    const st = simStopTimes.get(tid);
    if (!st) continue;
    tripStopTimesOut[tid] = st.map(s => {
      const info = stopsLookup.get(s.stop_id);
      const h = Math.floor((s.t % 86400) / 3600);
      const m = Math.floor((s.t % 3600) / 60);
      const hhmm = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
      return {
        stopId:        s.stop_id,
        stopName:      info?.stop_name ?? s.stop_id,
        lat:           info?.lat ?? 0,
        lon:           info?.lon ?? 0,
        sequence:      s.seq,
        arrivalTime:   hhmm,
        departureTime: hhmm,
      };
    });
  }

  // ── Upload all 8 files to Vercel Blob ─────────────────────────────────────
  log("Uploading derived files to Vercel Blob…");
  const blobPath = (name: string) => `feeds/${feedId}/derived/${name}`;

  const uploads = await Promise.all([
    put(blobPath("routes_index.json"),    JSON.stringify(routesIndex),    { access: "public" }),
    put(blobPath("variants_index.json"),  JSON.stringify(variantsIndex),  { access: "public" }),
    put(blobPath("variant_stops.json"),   JSON.stringify(variantStops),   { access: "public" }),
    put(blobPath("variant_lines.geojson"), JSON.stringify(variantLines),  { access: "public" }),
    put(blobPath("stops_lookup.json"),    JSON.stringify(stopsLookupOut), { access: "public" }),
    put(blobPath("sim_trips_by_dow.json"), JSON.stringify(simByDow),      { access: "public" }),
    put(blobPath("departures_index.json"), JSON.stringify(departuresIndex), { access: "public" }),
    put(blobPath("trip_stop_times.json"), JSON.stringify(tripStopTimesOut), { access: "public" }),
  ]);

  // Derive blobBaseUrl from the first upload URL
  // URL format: https://<store>.blob.vercel-storage.com/feeds/<feedId>/derived/routes_index.json
  const firstUrl = uploads[0].url;
  const blobBaseUrl = firstUrl.slice(0, firstUrl.lastIndexOf("/"));

  log(`Done. ${routes.length} routes, ${stopsLookup.size} stops.`);

  return {
    blobBaseUrl,
    routeCount: routes.length,
    stopCount:  stopsLookup.size,
  };
}
