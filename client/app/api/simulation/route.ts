import { NextResponse } from "next/server";
import path from "path";
import { createReadStream } from "fs";
import { promises as fs } from "fs";
import readline from "readline";

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
  routeShortNameFilter: string | null,
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
    if (routeShortNameFilter && route?.route_short_name !== routeShortNameFilter)
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

async function loadShapes(basePath: string): Promise<
  Map<string, Array<{ lat: number; lon: number; seq: number }>>
> {
  const shapesPath = path.join(basePath, "shapes.txt");
  const content = await fs.readFile(shapesPath, "utf8");
  const lines = content.split("\n").filter(Boolean);
  if (lines.length === 0) return new Map();
  const headers = parseCsvLine(lines[0]).map((h) => h.trim());
  if (headers[0]) {
    headers[0] = headers[0].replace(/^\uFEFF/, "");
  }

  const map = new Map<string, Array<{ lat: number; lon: number; seq: number }>>();
  for (let i = 1; i < lines.length; i += 1) {
    const values = parseCsvLine(lines[i]);
    const row = headers.reduce<Record<string, string>>((obj, header, index) => {
      obj[header] = (values[index] || "").trim();
      return obj;
    }, {});
    if (!row.shape_id) continue;
    const lat = row.shape_pt_lat ? Number(row.shape_pt_lat) : null;
    const lon = row.shape_pt_lon ? Number(row.shape_pt_lon) : null;
    const seq = row.shape_pt_sequence ? Number(row.shape_pt_sequence) : null;
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || !Number.isFinite(seq))
      continue;
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

async function loadTripStops(
  basePath: string,
  tripIds: Set<string>,
  stopsMap: Map<string, StopEntry>,
): Promise<Map<string, TripStops>> {
  const stopTimesPath = path.join(basePath, "stop_times.txt");
  const stream = createReadStream(stopTimesPath, { encoding: "utf8" });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

  const tripStops = new Map<string, TripStops>();
  let headers: string[] = [];
  let isHeader = true;

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

    const tripId = row.trip_id;
    if (!tripId || !tripIds.has(tripId)) continue;

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

    if (!tripStops.has(tripId)) {
      tripStops.set(tripId, {
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
    const entry = tripStops.get(tripId)!;
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

  return tripStops;
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

    entry.stops.forEach((stop) => {
      let bestIndex = 0;
      let bestDist = Number.POSITIVE_INFINITY;
      for (let i = 0; i < shape.length; i += 1) {
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
    });
  });
}

async function buildSimulationData(options: {
  basePath: string;
  source: TripMeta["source"];
  date: string;
  routeTypeFilter: Set<string> | null;
  routeShortNameFilter: string | null;
}) {
  const [routes, stops, serviceIds, shapes] = await Promise.all([
    loadRoutes(options.basePath),
    loadStops(options.basePath),
    loadActiveServiceIds(options.basePath, options.date),
    loadShapes(options.basePath),
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
      shapes: new Map(),
    };
  }

  const tripStops = await loadTripStops(
    options.basePath,
    new Set(trips.keys()),
    stops,
  );

  attachShapeIndices(tripStops, trips, shapes);

  return { trips, stops: tripStops, shapes };
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const dateParam = searchParams.get("date");
    const startParam = searchParams.get("start");
    const endParam = searchParams.get("end");
    const includeUpx = searchParams.get("includeUpx") !== "false";
    const routeTypesParam = searchParams.get("routeTypes");
    const routeShortNameParam = searchParams.get("routeShortName");

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

    const routeTypeFilter =
      routeTypesParam && routeTypesParam.trim().length > 0
        ? new Set(routeTypesParam.split(",").map((value) => value.trim()))
        : null;
    const routeShortNameFilter =
      routeShortNameParam && routeShortNameParam.trim().length > 0
        ? routeShortNameParam.trim()
        : null;

    const goBasePath = path.join(process.cwd(), "public", "gotransit");
    const upxBasePath = path.join(process.cwd(), "public", "union-pearson");

    const [goData, upxData] = await Promise.all([
      buildSimulationData({
        basePath: goBasePath,
        source: "gotransit",
        date: serviceDate,
        routeTypeFilter,
        routeShortNameFilter,
      }),
      includeUpx
        ? buildSimulationData({
            basePath: upxBasePath,
            source: "union-pearson",
            date: serviceDate,
            routeTypeFilter,
            routeShortNameFilter,
          })
        : Promise.resolve({
            trips: new Map<string, TripMeta>(),
            stops: new Map<string, TripStops>(),
            shapes: new Map(),
          }),
    ]);

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
    const appendTrips = (data: {
      trips: Map<string, TripMeta>;
      stops: Map<string, TripStops>;
      shapes: Map<string, Array<{ lat: number; lon: number; seq: number }>>;
    }) => {
      data.trips.forEach((trip) => {
        const stops = data.stops.get(trip.trip_id);
        if (!stops || stops.stops.length < 2) return;
        if (stops.minTime === null || stops.maxTime === null) return;
        const overlaps =
          stops.maxTime >= startSeconds && stops.minTime <= endSeconds;
        if (!overlaps) return;

        const shapePoints = trip.shape_id
          ? data.shapes.get(trip.shape_id) || []
          : [];

        output.push({
          ...trip,
          stops: stops.stops.map((stop) => ({
            t: stop.t,
            lat: stop.lat,
            lon: stop.lon,
            shapeIndex: stop.shapeIndex,
          })),
          shape: shapePoints.map((point) => ({
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

    return NextResponse.json({
      startSeconds,
      endSeconds,
      trips: output,
    });
  } catch (error) {
    console.error("Simulation data error:", error);
    return NextResponse.json(
      { error: "Failed to build simulation data" },
      { status: 500 },
    );
  }
}
