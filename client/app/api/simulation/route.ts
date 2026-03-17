import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import path from "path";
import { createReadStream, existsSync } from "fs";
import { promises as fs } from "fs";
import readline from "readline";
import { applyRateLimit, logApiEvent, normalizeStringArray } from "@/lib/server/api";

export const runtime = "nodejs";
export const maxDuration = 60;
const MAX_OUTPUT_TRIPS = 300;
const MAX_SHAPE_POINTS_PER_TRIP = 450;
const HEADER_SCAN_BYTES = 64 * 1024;
const SIMULATION_UNAVAILABLE_CODE = "SIMULATION_DATA_UNAVAILABLE";

type SimulationDataMode = "raw" | "precomputed" | "remote";
type SimulationArtifactSource = "raw" | "precomputed" | "remote-artifact";

type RouteEntry = {
  route_id: string;
  route_short_name: string;
  route_long_name: string;
  route_type: string | number;
};

type StopEntry = {
  stop_id: string;
  stop_name: string;
  stop_lat: number | null;
  stop_lon: number | null;
};

type TripMeta = {
  trip_id: string;
  route_id: string;
  route_short_name: string;
  route_long_name: string;
  route_type: string;
  direction_id: number;
  source: "gotransit" | "union-pearson";
  shape_id: string | null;
};

type TripStops = {
  stops: Array<{
    t: number;
    lat: number;
    lon: number;
    seq: number;
    shapeIndex: number | null;
  }>;
  minSeq: number | null;
  maxSeq: number | null;
  startStopName: string;
  endStopName: string;
  startTime: number | null;
  endTime: number | null;
  minTime: number | null;
  maxTime: number | null;
};

type SimulationShapePoint = { lat: number; lon: number; seq: number };

type SimulationBuildResult = {
  trips: Map<string, TripMeta>;
  stops: Map<string, TripStops>;
  shapes: Map<string, SimulationShapePoint[]>;
  artifactSource: SimulationArtifactSource;
  headerMode?: string;
};

type SimulationArtifactTrip = TripMeta & {
  service_id: string;
  stops: TripStops["stops"];
  start_stop_name: string;
  end_stop_name: string;
  start_time: number | null;
  end_time: number | null;
  min_time: number | null;
  max_time: number | null;
};

type SimulationArtifactPayload = {
  trips: SimulationArtifactTrip[];
  shapes: Record<string, SimulationShapePoint[]>;
};

type StopTimesHeaderInfo = {
  headers: string[];
  headerLineIndex: number;
  detectionMode: "stream-first-line" | "buffer-scan";
};

class SimulationRouteError extends Error {
  constructor(
    public status: number,
    public code: string,
    public safeMessage: string,
    public retryable: boolean,
    message: string,
  ) {
    super(message);
  }
}

function hasLocalSimulationArtifacts() {
  const root = path.join(process.cwd(), "public");
  return ["gotransit", "union-pearson"].some((feed) =>
    existsSync(path.join(root, feed, "derived", "simulation", "manifest.json"))
  );
}

function getSimulationDataMode(): SimulationDataMode {
  const mode = process.env.SIMULATION_DATA_MODE?.trim().toLowerCase();
  if (mode === "precomputed" || mode === "remote" || mode === "raw") {
    return mode;
  }
  if (process.env.NODE_ENV === "production") {
    return process.env.SIMULATION_ARTIFACT_BASE_URL?.trim() ? "remote" : "precomputed";
  }
  if (hasLocalSimulationArtifacts()) {
    return "precomputed";
  }
  return "raw";
}

function getArtifactSourceForMode(mode: SimulationDataMode): SimulationArtifactSource {
  return mode === "remote" ? "remote-artifact" : mode === "precomputed" ? "precomputed" : "raw";
}

function getRouteArtifactFilename(routeShortName: string) {
  return `route-${encodeURIComponent(routeShortName)}.json`;
}

function toFeedFolder(basePath: string) {
  return path.basename(basePath);
}

async function readSimulationArtifactJson<T>(
  basePath: string,
  relativePath: string,
  mode: Exclude<SimulationDataMode, "raw">,
): Promise<T> {
  if (mode === "remote") {
    const baseUrl = process.env.SIMULATION_ARTIFACT_BASE_URL?.trim();
    if (!baseUrl) {
      throw new SimulationRouteError(
        503,
        SIMULATION_UNAVAILABLE_CODE,
        "Simulation is temporarily unavailable for GTFS feed data.",
        true,
        "SIMULATION_ARTIFACT_BASE_URL is not configured for remote artifact mode",
      );
    }

    const url = `${baseUrl.replace(/\/+$/, "")}/${toFeedFolder(basePath)}/${relativePath}`;
    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
      },
    });
    if (!response.ok) {
      throw new SimulationRouteError(
        503,
        SIMULATION_UNAVAILABLE_CODE,
        "Simulation is temporarily unavailable for GTFS feed data.",
        true,
        `Remote simulation artifact request failed (${response.status}) for ${url}`,
      );
    }
    return (await response.json()) as T;
  }

  const filePath = path.join(basePath, "derived", "simulation", relativePath);
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8")) as T;
  } catch (error) {
    throw new SimulationRouteError(
      503,
      SIMULATION_UNAVAILABLE_CODE,
      "Simulation is temporarily unavailable for GTFS feed data.",
      true,
      `Failed to read simulation artifact ${filePath}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

async function readInitialTextChunk(filePath: string, maxBytes: number) {
  const handle = await fs.open(filePath, "r");
  try {
    const buffer = Buffer.alloc(maxBytes);
    const { bytesRead } = await handle.read(buffer, 0, maxBytes, 0);
    return buffer.toString("utf8", 0, bytesRead);
  } finally {
    await handle.close();
  }
}

async function detectStopTimesHeader(stopTimesPath: string): Promise<StopTimesHeaderInfo> {
  const preview = await readInitialTextChunk(stopTimesPath, HEADER_SCAN_BYTES);
  const lines = preview.split(/\r?\n/);

  for (let index = 0; index < lines.length && index < 25; index += 1) {
    const headers = parseHeaderLine(lines[index] ?? "");
    if (headers.includes("trip_id") && headers.includes("stop_id")) {
      return {
        headers,
        headerLineIndex: index,
        detectionMode: index === 0 ? "stream-first-line" : "buffer-scan",
      };
    }
  }

  throw new SimulationRouteError(
    503,
    SIMULATION_UNAVAILABLE_CODE,
    "Simulation is temporarily unavailable for GTFS feed data.",
    true,
    `Unable to detect a valid stop_times header in ${stopTimesPath}`,
  );
}

function parseCsvLine(line: string): string[] {
  const values: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const next = line[i + 1];

    if (char === "\"") {
      if (inQuotes && next === "\"") {
        current += "\"";
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      values.push(current);
      current = "";
      continue;
    }

    current += char;
  }

  values.push(current);
  return values;
}

function parseHeaderLine(line: string): string[] {
  const cleaned = line.replace(/^\uFEFF/, "").trimEnd();
  const comma = parseCsvLine(cleaned).map((h) => h.trim());
  if (comma.includes("trip_id") && comma.includes("stop_id")) return comma;
  if (cleaned.includes("\t")) {
    const tab = cleaned.split("\t").map((h) => h.trim());
    if (tab.includes("trip_id") && tab.includes("stop_id")) return tab;
  }
  if (cleaned.includes(";")) {
    const semi = cleaned.split(";").map((h) => h.trim());
    if (semi.includes("trip_id") && semi.includes("stop_id")) return semi;
  }
  return comma;
}

function parseTimeToSeconds(value: string | undefined): number | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parts = trimmed.split(":");
  if (parts.length < 2) return null;
  const hours = Number(parts[0]);
  const minutes = Number(parts[1]);
  const seconds = Number(parts[2] ?? "0");
  if ([hours, minutes, seconds].some((part) => Number.isNaN(part))) {
    return null;
  }
  return hours * 3600 + minutes * 60 + seconds;
}

function parseShortTime(value: string | null): number | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parts = trimmed.split(":");
  if (parts.length < 2) return null;
  const hours = Number(parts[0]);
  const minutes = Number(parts[1]);
  if ([hours, minutes].some((part) => Number.isNaN(part))) {
    return null;
  }
  return hours * 3600 + minutes * 60;
}

function canonicalTripId(value: string): string {
  return value.trim().replace(/^\d{8}-/, "");
}

function downsampleShape(
  points: Array<{ lat: number; lon: number; seq: number }>,
): Array<{ lat: number; lon: number; seq: number }> {
  if (points.length <= MAX_SHAPE_POINTS_PER_TRIP) return points;
  const keep = MAX_SHAPE_POINTS_PER_TRIP;
  const sampled: Array<{ lat: number; lon: number; seq: number }> = [];
  for (let i = 0; i < keep; i += 1) {
    const index = Math.round((i * (points.length - 1)) / (keep - 1));
    sampled.push(points[index]);
  }
  return sampled;
}

function remapShapeIndex(
  shapeIndex: number | null,
  originalLength: number,
  sampledLength: number,
): number | null {
  if (shapeIndex === null) return null;
  if (originalLength <= 0 || sampledLength <= 0) return null;
  if (sampledLength === 1) return 0;
  if (originalLength === 1) return 0;

  const normalized = shapeIndex / (originalLength - 1);
  const mapped = Math.round(normalized * (sampledLength - 1));
  return Math.max(0, Math.min(sampledLength - 1, mapped));
}

function toServiceDate(value: string): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const [year, month, day] = trimmed.split("-");
  if (!year || !month || !day) return null;
  return `${year}${month.padStart(2, "0")}${day.padStart(2, "0")}`;
}

async function loadRoutes(basePath: string): Promise<Map<string, RouteEntry>> {
  const routesPath = path.join(basePath, "routes.txt");
  const content = await fs.readFile(routesPath, "utf8");
  const lines = content.split("\n").filter(Boolean);
  if (lines.length === 0) return new Map();
  const headers = parseCsvLine(lines[0]).map((h) => h.trim());
  if (headers[0]) {
    headers[0] = headers[0].replace(/^\uFEFF/, "");
  }

  const map = new Map<string, RouteEntry>();
  for (let i = 1; i < lines.length; i += 1) {
    const values = parseCsvLine(lines[i]);
    const row = headers.reduce<Record<string, string>>((obj, header, index) => {
      obj[header] = (values[index] || "").trim();
      return obj;
    }, {});
    if (!row.route_id) continue;
    map.set(row.route_id, {
      route_id: row.route_id,
      route_short_name: row.route_short_name || "",
      route_long_name: row.route_long_name || "",
      route_type: row.route_type || "",
    });
  }
  return map;
}

async function loadStops(basePath: string): Promise<Map<string, StopEntry>> {
  const stopsPath = path.join(basePath, "stops.txt");
  const content = await fs.readFile(stopsPath, "utf8");
  const lines = content.split("\n").filter(Boolean);
  if (lines.length === 0) return new Map();
  const headers = parseCsvLine(lines[0]).map((h) => h.trim());
  if (headers[0]) {
    headers[0] = headers[0].replace(/^\uFEFF/, "");
  }

  const map = new Map<string, StopEntry>();
  for (let i = 1; i < lines.length; i += 1) {
    const values = parseCsvLine(lines[i]);
    const row = headers.reduce<Record<string, string>>((obj, header, index) => {
      obj[header] = (values[index] || "").trim();
      return obj;
    }, {});
    if (!row.stop_id) continue;
    const lat = row.stop_lat ? Number(row.stop_lat) : null;
    const lon = row.stop_lon ? Number(row.stop_lon) : null;
    map.set(row.stop_id, {
      stop_id: row.stop_id,
      stop_name: row.stop_name || "",
      stop_lat: Number.isFinite(lat) ? lat : null,
      stop_lon: Number.isFinite(lon) ? lon : null,
    });
  }
  return map;
}

async function loadActiveServiceIds(
  basePath: string,
  targetDate: string,
): Promise<Set<string>> {
  const calendarDatesPath = path.join(basePath, "calendar_dates.txt");
  const content = await fs.readFile(calendarDatesPath, "utf8");
  const lines = content.split("\n").filter(Boolean);
  if (lines.length === 0) return new Set();
  const headers = parseCsvLine(lines[0]).map((h) => h.trim());
  if (headers[0]) {
    headers[0] = headers[0].replace(/^\uFEFF/, "");
  }
  const hasExceptionType = headers.includes("exception_type");
  const active = new Set<string>();

  for (let i = 1; i < lines.length; i += 1) {
    const values = parseCsvLine(lines[i]);
    const row = headers.reduce<Record<string, string>>((obj, header, index) => {
      obj[header] = (values[index] || "").trim();
      return obj;
    }, {});
    if (row.date !== targetDate) continue;
    const serviceId = row.service_id;
    if (!serviceId) continue;
    if (!hasExceptionType) {
      active.add(serviceId);
      continue;
    }
    const exceptionType = row.exception_type;
    if (exceptionType === "1") {
      active.add(serviceId);
    } else if (exceptionType === "2") {
      active.delete(serviceId);
    }
  }

  return active;
}

async function loadTripsForDate(
  basePath: string,
  routeMap: Map<string, RouteEntry>,
  activeServiceIds: Set<string>,
  source: TripMeta["source"],
  routeTypeFilter: Set<string> | null,
  routeShortNameFilter: Set<string> | null,
): Promise<Map<string, TripMeta>> {
  const tripsPath = path.join(basePath, "trips.txt");
  const content = await fs.readFile(tripsPath, "utf8");
  const lines = content.split("\n").filter(Boolean);
  if (lines.length === 0) return new Map();
  const headers = parseCsvLine(lines[0]).map((h) => h.trim());
  if (headers[0]) {
    headers[0] = headers[0].replace(/^\uFEFF/, "");
  }

  const trips = new Map<string, TripMeta>();
  for (let i = 1; i < lines.length; i += 1) {
    const values = parseCsvLine(lines[i]);
    const row = headers.reduce<Record<string, string>>((obj, header, index) => {
      obj[header] = (values[index] || "").trim();
      return obj;
    }, {});
    if (!row.trip_id || !row.service_id || !row.route_id) continue;
    if (!activeServiceIds.has(row.service_id)) continue;

    const route = routeMap.get(row.route_id);
    const routeType = String(route?.route_type ?? "");
    if (routeTypeFilter && !routeTypeFilter.has(routeType)) continue;
    if (
      routeShortNameFilter &&
      !routeShortNameFilter.has(String(route?.route_short_name ?? ""))
    )
      continue;

    trips.set(row.trip_id, {
      trip_id: row.trip_id,
      route_id: row.route_id,
      route_short_name: route?.route_short_name || "",
      route_long_name: route?.route_long_name || "",
      route_type: routeType,
      direction_id: row.direction_id ? Number(row.direction_id) : 0,
      source,
      shape_id: row.shape_id || null,
    });
  }

  return trips;
}

async function loadTripStops(
  basePath: string,
  tripIds: Set<string>,
  stopsMap: Map<string, StopEntry>,
): Promise<{ tripStops: Map<string, TripStops>; headerMode: StopTimesHeaderInfo["detectionMode"] }> {
  const stopTimesPath = path.join(basePath, "stop_times.txt");
  const headerInfo = await detectStopTimesHeader(stopTimesPath);
  const stream = createReadStream(stopTimesPath, { encoding: "utf8" });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

  const tripStops = new Map<string, TripStops>();
  const canonicalTripIdMap = new Map<string, string>();
  tripIds.forEach((tripId) => {
    const key = canonicalTripId(tripId);
    if (!canonicalTripIdMap.has(key)) {
      canonicalTripIdMap.set(key, tripId);
    }
  });
  let fallbackMatchedRows = 0;
  const headers = headerInfo.headers;
  let lineIndex = -1;

  for await (const line of rl) {
    lineIndex += 1;
    if (lineIndex < headerInfo.headerLineIndex) continue;
    if (lineIndex === headerInfo.headerLineIndex) {
      continue;
    }
    if (!line) continue;

    const values = parseCsvLine(line);
    const row = headers.reduce<Record<string, string>>((obj, header, index) => {
      obj[header] = (values[index] || "").trim();
      return obj;
    }, {});

    const tripId = row.trip_id;
    if (!tripId) continue;
    let matchedTripId: string | null = null;
    if (tripIds.has(tripId)) {
      matchedTripId = tripId;
    } else {
      const canonical = canonicalTripId(tripId);
      const fallbackTripId = canonicalTripIdMap.get(canonical);
      if (fallbackTripId) {
        matchedTripId = fallbackTripId;
        fallbackMatchedRows += 1;
      }
    }
    if (!matchedTripId) continue;

    const stopId = row.stop_id;
    if (!stopId) continue;
    const stop = stopsMap.get(stopId);
    if (!stop || stop.stop_lat === null || stop.stop_lon === null) continue;

    const timeSeconds =
      parseTimeToSeconds(row.departure_time) ??
      parseTimeToSeconds(row.arrival_time);
    if (timeSeconds === null) continue;

    const seq = Number(row.stop_sequence);
    if (!Number.isFinite(seq)) continue;

    if (!tripStops.has(matchedTripId)) {
      tripStops.set(matchedTripId, {
        stops: [],
        minSeq: null,
        maxSeq: null,
        startStopName: "",
        endStopName: "",
        startTime: null,
        endTime: null,
        minTime: null,
        maxTime: null,
      });
    }
    const entry = tripStops.get(matchedTripId)!;
    entry.stops.push({
      t: timeSeconds,
      lat: stop.stop_lat,
      lon: stop.stop_lon,
      seq,
      shapeIndex: null,
    });

    if (entry.minSeq === null || seq < entry.minSeq) {
      entry.minSeq = seq;
      entry.startStopName = stop.stop_name;
      entry.startTime = timeSeconds;
    }
    if (entry.maxSeq === null || seq > entry.maxSeq) {
      entry.maxSeq = seq;
      entry.endStopName = stop.stop_name;
      entry.endTime = timeSeconds;
    }

    entry.minTime = entry.minTime === null ? timeSeconds : Math.min(entry.minTime, timeSeconds);
    entry.maxTime = entry.maxTime === null ? timeSeconds : Math.max(entry.maxTime, timeSeconds);
  }

  tripStops.forEach((entry) => {
    entry.stops.sort((a, b) => a.seq - b.seq);
  });

  if (fallbackMatchedRows > 0) {
    console.log("[simulation] stop_times fallback trip_id matching used", {
      fallbackMatchedRows,
      matchedTrips: tripStops.size,
    });
  }

  return {
    tripStops,
    headerMode: headerInfo.detectionMode,
  };
}

async function loadShapesForTrips(
  basePath: string,
  trips: Map<string, TripMeta>,
): Promise<Map<string, Array<{ lat: number; lon: number; seq: number }>>> {
  const shapeIds = new Set<string>();
  trips.forEach((trip) => {
    if (trip.shape_id) shapeIds.add(trip.shape_id);
  });
  if (shapeIds.size === 0) return new Map();

  const shapesPath = path.join(basePath, "shapes.txt");
  const stream = createReadStream(shapesPath, { encoding: "utf8" });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

  let headers: string[] = [];
  let isHeader = true;
  const map = new Map<string, Array<{ lat: number; lon: number; seq: number }>>();

  for await (const line of rl) {
    if (!line) continue;
    if (isHeader) {
      headers = parseCsvLine(line).map((h) => h.trim());
      if (headers[0]) {
        headers[0] = headers[0].replace(/^\uFEFF/, "");
      }
      isHeader = false;
      continue;
    }

    const values = parseCsvLine(line);
    const row = headers.reduce<Record<string, string>>((obj, header, index) => {
      obj[header] = (values[index] || "").trim();
      return obj;
    }, {});

    if (!row.shape_id || !shapeIds.has(row.shape_id)) continue;
    const lat = row.shape_pt_lat ? Number(row.shape_pt_lat) : null;
    const lon = row.shape_pt_lon ? Number(row.shape_pt_lon) : null;
    const seq = row.shape_pt_sequence ? Number(row.shape_pt_sequence) : null;
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || !Number.isFinite(seq)) {
      continue;
    }

    if (!map.has(row.shape_id)) {
      map.set(row.shape_id, []);
    }
    map.get(row.shape_id)!.push({
      lat: lat as number,
      lon: lon as number,
      seq: seq as number,
    });
  }

  map.forEach((points) => points.sort((a, b) => a.seq - b.seq));
  return map;
}

function attachShapeIndices(
  tripStops: Map<string, TripStops>,
  trips: Map<string, TripMeta>,
  shapes: Map<string, Array<{ lat: number; lon: number; seq: number }>>,
) {
  tripStops.forEach((entry, tripId) => {
    const trip = trips.get(tripId);
    if (!trip || !trip.shape_id) return;
    const shape = shapes.get(trip.shape_id);
    if (!shape || shape.length < 2) return;

    // Keep indices monotonic to follow shape direction and avoid jumps.
    let searchStart = 0;
    entry.stops.forEach((stop) => {
      let bestIndex = searchStart;
      let bestDist = Number.POSITIVE_INFINITY;
      for (let i = searchStart; i < shape.length; i += 1) {
        const point = shape[i];
        const dx = point.lon - stop.lon;
        const dy = point.lat - stop.lat;
        const dist = dx * dx + dy * dy;
        if (dist < bestDist) {
          bestDist = dist;
          bestIndex = i;
        }
      }
      stop.shapeIndex = bestIndex;
      searchStart = bestIndex;
    });
  });
}

async function buildSimulationDataRaw(options: {
  basePath: string;
  source: TripMeta["source"];
  date: string;
  routeTypeFilter: Set<string> | null;
  routeShortNameFilter: Set<string> | null;
}): Promise<SimulationBuildResult> {
  const [routes, stops, serviceIds] = await Promise.all([
    loadRoutes(options.basePath),
    loadStops(options.basePath),
    loadActiveServiceIds(options.basePath, options.date),
  ]);

  const trips = await loadTripsForDate(
    options.basePath,
    routes,
    serviceIds,
    options.source,
    options.routeTypeFilter,
    options.routeShortNameFilter,
  );

  if (trips.size === 0) {
    return {
      trips: new Map<string, TripMeta>(),
      stops: new Map<string, TripStops>(),
      shapes: new Map<string, SimulationShapePoint[]>(),
      artifactSource: "raw",
    };
  }

  const { tripStops, headerMode } = await loadTripStops(
    options.basePath,
    new Set(trips.keys()),
    stops,
  );
  const shapes = await loadShapesForTrips(options.basePath, trips);
  attachShapeIndices(tripStops, trips, shapes);
  return {
    trips,
    stops: tripStops,
    shapes,
    artifactSource: "raw",
    headerMode,
  };
}

async function buildSimulationDataFromArtifacts(options: {
  basePath: string;
  source: TripMeta["source"];
  date: string;
  routeTypeFilter: Set<string> | null;
  routeShortNameFilter: Set<string> | null;
  mode: Exclude<SimulationDataMode, "raw">;
}): Promise<SimulationBuildResult> {
  if (!options.routeShortNameFilter || options.routeShortNameFilter.size === 0) {
    throw new SimulationRouteError(
      503,
      SIMULATION_UNAVAILABLE_CODE,
      "Simulation is temporarily unavailable for GTFS feed data.",
      true,
      `Precomputed simulation mode requires routeShortNameFilter for ${options.basePath}`,
    );
  }

  const activeServiceIds = new Set(
    await readSimulationArtifactJson<string[]>(
      options.basePath,
      `service-dates/${options.date}.json`,
      options.mode,
    ),
  );

  if (activeServiceIds.size === 0) {
    return {
      trips: new Map<string, TripMeta>(),
      stops: new Map<string, TripStops>(),
      shapes: new Map<string, SimulationShapePoint[]>(),
      artifactSource: getArtifactSourceForMode(options.mode),
    };
  }

  const routeArtifacts = await Promise.all(
    Array.from(options.routeShortNameFilter).map(async (routeShortName) => ({
      routeShortName,
      payload: await readSimulationArtifactJson<SimulationArtifactPayload>(
        options.basePath,
        `routes/${getRouteArtifactFilename(routeShortName)}`,
        options.mode,
      ),
    })),
  );

  const trips = new Map<string, TripMeta>();
  const stops = new Map<string, TripStops>();
  const shapes = new Map<string, SimulationShapePoint[]>();

  routeArtifacts.forEach(({ payload }) => {
    // Load shapes from the artifact-level shapes dict (stored once, not per trip).
    const artifactShapes: Record<string, SimulationShapePoint[]> = payload.shapes ?? {};
    Object.entries(artifactShapes).forEach(([shapeId, points]) => {
      if (!shapes.has(shapeId)) {
        shapes.set(shapeId, points);
      }
    });

    payload.trips.forEach((trip) => {
      if (!activeServiceIds.has(trip.service_id)) return;
      if (options.routeTypeFilter && !options.routeTypeFilter.has(trip.route_type)) return;

      trips.set(trip.trip_id, {
        trip_id: trip.trip_id,
        route_id: trip.route_id,
        route_short_name: trip.route_short_name,
        route_long_name: trip.route_long_name,
        route_type: trip.route_type,
        direction_id: trip.direction_id,
        source: trip.source,
        shape_id: trip.shape_id,
      });

      stops.set(trip.trip_id, {
        stops: trip.stops,
        minSeq: trip.stops.length > 0 ? Math.min(...trip.stops.map((stop) => stop.seq)) : null,
        maxSeq: trip.stops.length > 0 ? Math.max(...trip.stops.map((stop) => stop.seq)) : null,
        startStopName: trip.start_stop_name,
        endStopName: trip.end_stop_name,
        startTime: trip.start_time,
        endTime: trip.end_time,
        minTime: trip.min_time,
        maxTime: trip.max_time,
      });
    });
  });

  return {
    trips,
    stops,
    shapes,
    artifactSource: getArtifactSourceForMode(options.mode),
  };
}

async function buildSimulationData(options: {
  basePath: string;
  source: TripMeta["source"];
  date: string;
  routeTypeFilter: Set<string> | null;
  routeShortNameFilter: Set<string> | null;
  mode: SimulationDataMode;
}): Promise<SimulationBuildResult> {
  if (options.mode === "raw") {
    return buildSimulationDataRaw(options);
  }

  try {
    return await buildSimulationDataFromArtifacts({
      ...options,
      mode: options.mode,
    });
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      logApiEvent("/api/simulation", "error", {
        artifactFallback: true,
        message: error instanceof Error ? error.message : String(error),
        source: options.source,
      });
      return buildSimulationDataRaw(options);
    }
    throw error;
  }
}

export async function GET(request: NextRequest) {
  const requestId = `sim-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const requestStartedAt = Date.now();
  let debug = false;
  const simulationMode = getSimulationDataMode();
  const limited = applyRateLimit(request, {
    bucket: "simulation",
    limit: 6,
    windowMs: 60_000,
  });
  if (limited) return limited;
  try {
    const { searchParams } = new URL(request.url);
    debug =
      searchParams.get("debug") === "1" ||
      searchParams.get("debug") === "true";
    const dateParam = searchParams.get("date");
    const startParam = searchParams.get("start");
    const endParam = searchParams.get("end");
    const includeUpx = searchParams.get("includeUpx") !== "false";
    const routeTypesParam = searchParams.get("routeTypes");
    const routeShortNameParam = searchParams.get("routeShortName");
    const routeShortNamesParam = searchParams.get("routeShortNames");

    if (!dateParam || !startParam || !endParam) {
      return NextResponse.json(
        { error: "date, start, and end are required" },
        { status: 400 },
      );
    }

    const serviceDate = toServiceDate(dateParam);
    const startSeconds = parseShortTime(startParam);
    const endSeconds = parseShortTime(endParam);
    if (!serviceDate || startSeconds === null || endSeconds === null) {
      return NextResponse.json(
        { error: "Invalid date or time format" },
        { status: 400 },
      );
    }
    if (endSeconds <= startSeconds) {
      return NextResponse.json(
        { error: "End time must be after start time" },
        { status: 400 },
      );
    }

    const routeTypeValues =
      routeTypesParam && routeTypesParam.trim().length > 0
        ? normalizeStringArray(routeTypesParam.split(","), {
            maxItems: 8,
            maxItemLength: 4,
          })
        : [];
    const routeTypeFilter =
      routeTypeValues.length > 0 ? new Set(routeTypeValues) : null;
    const routeShortNames = normalizeStringArray(
      routeShortNamesParam && routeShortNamesParam.trim().length > 0
        ? routeShortNamesParam.split(",")
        : routeShortNameParam && routeShortNameParam.trim().length > 0
          ? [routeShortNameParam]
          : [],
      {
        maxItems: 12,
        maxItemLength: 16,
      },
    );
    const routeShortNameFilter =
      routeShortNames.length > 0 ? new Set(routeShortNames) : null;

    logApiEvent("/api/simulation", "request", {
      requestId,
      dateParam,
      startParam,
      endParam,
      includeUpx,
      routeTypesParam,
      routeShortNames,
      debug,
      mode: simulationMode,
    });

    const goBasePath = path.join(process.cwd(), "public", "gotransit");
    const upxBasePath = path.join(process.cwd(), "public", "union-pearson");
    const buildStartedAt = Date.now();

    const emptyFeedResult = {
      trips: new Map<string, TripMeta>(),
      stops: new Map<string, TripStops>(),
      shapes: new Map<string, SimulationShapePoint[]>(),
      artifactSource: "raw" as const,
      headerMode: undefined,
    };

    const [goData, upxData] = await Promise.all([
      buildSimulationData({
        basePath: goBasePath,
        source: "gotransit",
        date: serviceDate,
        routeTypeFilter,
        routeShortNameFilter,
        mode: simulationMode,
      }),
      includeUpx
        ? buildSimulationData({
            basePath: upxBasePath,
            source: "union-pearson",
            date: serviceDate,
            routeTypeFilter,
            routeShortNameFilter,
            mode: simulationMode,
          }).catch((error) => {
            logApiEvent("/api/simulation", "error", {
              requestId,
              upxUnavailable: true,
              message: error instanceof Error ? error.message : String(error),
            });
            return emptyFeedResult;
          })
        : Promise.resolve(emptyFeedResult),
    ]);
    const buildDurationMs = Date.now() - buildStartedAt;

    const output: Array<
      TripMeta & {
        stops: Array<{ t: number; lat: number; lon: number; shapeIndex: number | null }>;
        shape: Array<{ lat: number; lon: number }>;
        start_stop_name: string;
        end_stop_name: string;
        start_time: number | null;
        end_time: number | null;
      }
    > = [];
    const shouldDownsampleShapes = (routeShortNameFilter?.size ?? 0) > 8;
    let wasTruncated = false;
    const appendTrips = (data: {
      trips: Map<string, TripMeta>;
      stops: Map<string, TripStops>;
      shapes: Map<string, Array<{ lat: number; lon: number; seq: number }>>;
    }) => {
      data.trips.forEach((trip) => {
        if (output.length >= MAX_OUTPUT_TRIPS) {
          wasTruncated = true;
          return;
        }
        const stops = data.stops.get(trip.trip_id);
        if (!stops || stops.stops.length < 2) return;
        if (stops.minTime === null || stops.maxTime === null) return;
        const overlaps =
          stops.maxTime >= startSeconds && stops.minTime <= endSeconds;
        if (!overlaps) return;

        const shapePoints = trip.shape_id
          ? data.shapes.get(trip.shape_id) || []
          : [];
        const sampledShapePoints = shouldDownsampleShapes
          ? downsampleShape(shapePoints)
          : shapePoints;
        const originalShapeLength = shapePoints.length;
        const sampledShapeLength = sampledShapePoints.length;

        output.push({
          ...trip,
          stops: stops.stops.map((stop) => ({
            t: stop.t,
            lat: stop.lat,
            lon: stop.lon,
            shapeIndex: remapShapeIndex(
              stop.shapeIndex,
              originalShapeLength,
              sampledShapeLength,
            ),
          })),
          shape: sampledShapePoints.map((point) => ({
            lat: point.lat,
            lon: point.lon,
          })),
          start_stop_name: stops.startStopName,
          end_stop_name: stops.endStopName,
          start_time: stops.startTime,
          end_time: stops.endTime,
        });
      });
    };

    appendTrips(goData);
    appendTrips(upxData);

    const diagnostics = {
      requestId,
      durationMs: Date.now() - requestStartedAt,
      buildDurationMs,
      input: {
        serviceDate,
        startSeconds,
        endSeconds,
        includeUpx,
        routeTypes: routeTypeFilter ? Array.from(routeTypeFilter) : [],
        routeShortNames: routeShortNameFilter
          ? Array.from(routeShortNameFilter)
          : [],
      },
      go: {
        trips: goData.trips.size,
        stopSets: goData.stops.size,
        shapes: goData.shapes.size,
        artifactSource: goData.artifactSource,
        headerMode: goData.headerMode ?? null,
      },
      upx: {
        trips: upxData.trips.size,
        stopSets: upxData.stops.size,
        shapes: upxData.shapes.size,
        artifactSource: upxData.artifactSource,
        headerMode: upxData.headerMode ?? null,
      },
      outputTrips: output.length,
      truncated: wasTruncated,
      limits: {
        maxOutputTrips: MAX_OUTPUT_TRIPS,
        maxShapePointsPerTrip: MAX_SHAPE_POINTS_PER_TRIP,
        downsampleShapes: shouldDownsampleShapes,
      },
    };
    logApiEvent("/api/simulation", "success", diagnostics);

    return NextResponse.json({
      startSeconds,
      endSeconds,
      trips: output,
      ...(debug ? { diagnostics } : {}),
    }, {
      headers: {
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const failure = {
      requestId,
      durationMs: Date.now() - requestStartedAt,
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    };
    logApiEvent("/api/simulation", "error", failure);

    if (error instanceof SimulationRouteError) {
      return NextResponse.json(
        {
          error: error.safeMessage,
          code: error.code,
          requestId,
          retryable: error.retryable,
          ...(debug ? { details: failure } : {}),
        },
        {
          status: error.status,
          headers: {
            "Cache-Control": "no-store",
          },
        },
      );
    }

    return NextResponse.json(
      {
        error: "Simulation is temporarily unavailable for GTFS feed data.",
        code: SIMULATION_UNAVAILABLE_CODE,
        requestId,
        retryable: true,
        ...(debug ? { details: failure } : {}),
      },
      {
        status: 503,
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  }
}
