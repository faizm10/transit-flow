import path from "path";
import { createReadStream } from "fs";
import { promises as fs } from "fs";
import readline from "readline";
import type { TrainCorridor, TrainCorridorStation } from "@/lib/trainCorridors";

const CACHE_TTL_MS = 1000 * 60 * 30;

type VariantEntry = {
  variant_id: string;
  label: string;
  route_id: string;
  direction_id: number;
  shape_id: string | null;
  representative_trip_id: string;
  route_variant?: string;
};

type RouteEntry = {
  route_id: string;
  route_short_name: string;
  route_long_name: string;
  route_type: number | string;
};

type GoVariantStop = {
  stop_id: string;
  stop_name: string;
  stop_lat: number | null;
  stop_lon: number | null;
  stop_sequence: number;
};

type TrainCorridorMap = Map<string, TrainCorridor>;

let cachedCorridors:
  | {
      expiresAt: number;
      data: TrainCorridorMap;
    }
  | null = null;
let inFlightBuild: Promise<TrainCorridorMap> | null = null;

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
  if ([hours, minutes, seconds].some((part) => Number.isNaN(part))) return null;
  const normalizedHours = hours >= 24 ? hours - 24 : hours;
  return normalizedHours * 3600 + minutes * 60 + seconds;
}

function formatTime(seconds: number | null): string {
  if (seconds === null) return "";
  const hours = Math.floor(seconds / 3600) % 24;
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function colorForRoute(routeShortName: string): string {
  const normalized = routeShortName.trim().toUpperCase();
  const routeColors: Record<string, string> = {
    LW: "#991b1b",
    LE: "#ef4444",
    KI: "#16a34a",
    BR: "#2563eb",
    MI: "#f59e0b",
    RH: "#0ea5e9",
    ST: "#8b5a2b",
    UP: "#0ea5e9",
  };

  return routeColors[normalized] ?? "#334155";
}

function sortTimes(values: Set<string>): string[] {
  return Array.from(values).sort((left, right) => {
    const leftSeconds = parseTimeToSeconds(left) ?? 0;
    const rightSeconds = parseTimeToSeconds(right) ?? 0;
    return leftSeconds - rightSeconds;
  });
}

function buildSeededSchedule(stations: TrainCorridorStation[]): TrainCorridor["seededSchedule"] {
  const departures = stations[0]?.departureTimes ?? [];
  if (departures.length === 0) return undefined;
  return {
    primary: {
      type: "fixed",
      departures,
    },
  };
}

async function buildGoTrainCorridors(): Promise<TrainCorridor[]> {
  const basePath = path.join(process.cwd(), "public", "gotransit", "derived");
  const variantsPath = path.join(basePath, "variants_index.json");
  const routesPath = path.join(basePath, "routes_index.json");
  const variantStopsPath = path.join(basePath, "variant_stops.json");
  const variantLinesPath = path.join(basePath, "variant_lines.geojson");
  const tripsPath = path.join(process.cwd(), "public", "gotransit", "trips.txt");
  const stopTimesPath = path.join(process.cwd(), "public", "gotransit", "stop_times.txt");

  const [variantsRaw, routesRaw, variantStopsRaw, variantLinesRaw, tripsRaw] = await Promise.all([
    fs.readFile(variantsPath, "utf8"),
    fs.readFile(routesPath, "utf8"),
    fs.readFile(variantStopsPath, "utf8"),
    fs.readFile(variantLinesPath, "utf8"),
    fs.readFile(tripsPath, "utf8"),
  ]);

  const variantsIndex = JSON.parse(variantsRaw) as Record<string, VariantEntry[]>;
  const routesIndex = JSON.parse(routesRaw) as RouteEntry[];
  const variantStops = JSON.parse(variantStopsRaw) as Record<string, GoVariantStop[]>;
  const variantLines = JSON.parse(variantLinesRaw) as GeoJSON.FeatureCollection;

  const routeById = new Map<string, RouteEntry>();
  routesIndex.forEach((route) => routeById.set(route.route_id, route));

  const trainRouteIds = new Map<string, string>();
  routesIndex.forEach((route) => {
    if (String(route.route_type) === "2") {
      trainRouteIds.set(route.route_id, route.route_short_name);
    }
  });

  const canonicalStationsByCorridor = new Map<string, TrainCorridorStation[]>();
  const corridorMeta = new Map<
    string,
    {
      routeLabel: string;
      routeColor: string;
      geometry: GeoJSON.LineString;
    }
  >();

  Object.entries(variantsIndex).forEach(([routeShortName, variants]) => {
    const trainVariants = variants.filter(
      (variant) => String(routeById.get(variant.route_id)?.route_type ?? "") === "2",
    );
    if (trainVariants.length === 0) return;

    const canonicalVariant = [...trainVariants].sort((left, right) => {
      const leftStops = variantStops[left.variant_id]?.length ?? 0;
      const rightStops = variantStops[right.variant_id]?.length ?? 0;
      if (rightStops !== leftStops) return rightStops - leftStops;
      return left.variant_id.localeCompare(right.variant_id);
    })[0];
    if (!canonicalVariant) return;

    const routeInfo = routeById.get(canonicalVariant.route_id);
    const canonicalStops = (variantStops[canonicalVariant.variant_id] ?? [])
      .filter((stop) => stop.stop_lat != null && stop.stop_lon != null)
      .sort((left, right) => left.stop_sequence - right.stop_sequence)
      .map((stop) => ({
        stop_id: stop.stop_id,
        stop_name: stop.stop_name,
        stop_lat: stop.stop_lat!,
        stop_lon: stop.stop_lon!,
        stop_sequence: stop.stop_sequence,
        departureTimes: [],
      }));
    if (canonicalStops.length === 0) return;

    const trainRouteIdsForCorridor = new Set(trainVariants.map((variant) => variant.route_id));
    const geometryFeature = variantLines.features
      .filter((feature) => {
        const props = feature.properties as Record<string, unknown> | undefined;
        return String(props?.route_short_name ?? "") === routeShortName;
      })
      .filter((feature) => {
        const props = feature.properties as Record<string, unknown> | undefined;
        return trainRouteIdsForCorridor.has(String(props?.route_id ?? ""));
      })
      .sort((left, right) => {
        const leftLength =
          left.geometry?.type === "LineString" ? left.geometry.coordinates.length : 0;
        const rightLength =
          right.geometry?.type === "LineString" ? right.geometry.coordinates.length : 0;
        return rightLength - leftLength;
      })[0];
    if (!geometryFeature || geometryFeature.geometry?.type !== "LineString") return;

    canonicalStationsByCorridor.set(routeShortName, canonicalStops);
    corridorMeta.set(routeShortName, {
      routeLabel: routeInfo?.route_long_name
        ? `${routeShortName} - ${routeInfo.route_long_name}`
        : routeShortName,
      routeColor: colorForRoute(routeShortName),
      geometry: {
        type: "LineString",
        coordinates: geometryFeature.geometry.coordinates as [number, number][],
      },
    });
  });

  const tripHeaders = parseCsvLine(tripsRaw.split("\n")[0] || "").map((header) =>
    header.trim().replace(/^\uFEFF/, ""),
  );
  const tripToCorridor = new Map<string, string>();
  tripsRaw
    .split("\n")
    .filter(Boolean)
    .slice(1)
    .forEach((line) => {
      const values = parseCsvLine(line);
      const row = tripHeaders.reduce<Record<string, string>>((acc, header, index) => {
        acc[header] = (values[index] || "").trim();
        return acc;
      }, {});
      const tripId = row.trip_id;
      const corridorId = trainRouteIds.get(row.route_id);
      if (tripId && corridorId && canonicalStationsByCorridor.has(corridorId)) {
        tripToCorridor.set(tripId, corridorId);
      }
    });

  const departureSetsByCorridor = new Map<string, Map<string, Set<string>>>();
  canonicalStationsByCorridor.forEach((stations, corridorId) => {
    departureSetsByCorridor.set(
      corridorId,
      new Map(stations.map((station) => [station.stop_id, new Set<string>()])),
    );
  });

  const stopTimeStream = createReadStream(stopTimesPath, { encoding: "utf8" });
  const stopTimeReader = readline.createInterface({ input: stopTimeStream, crlfDelay: Infinity });
  let stopTimeHeaders: string[] = [];
  let isStopTimeHeader = true;

  for await (const line of stopTimeReader) {
    if (!line) continue;
    if (isStopTimeHeader) {
      stopTimeHeaders = parseCsvLine(line).map((header) => header.trim().replace(/^\uFEFF/, ""));
      isStopTimeHeader = false;
      continue;
    }

    const values = parseCsvLine(line);
    const row = stopTimeHeaders.reduce<Record<string, string>>((acc, header, index) => {
      acc[header] = (values[index] || "").trim();
      return acc;
    }, {});

    const corridorId = tripToCorridor.get(row.trip_id);
    if (!corridorId) continue;
    const departureTime = formatTime(parseTimeToSeconds(row.departure_time || row.arrival_time));
    if (!departureTime) continue;
    const stopSet = departureSetsByCorridor.get(corridorId)?.get(row.stop_id);
    stopSet?.add(departureTime);
  }

  const corridors = Array.from(canonicalStationsByCorridor.entries())
    .map<TrainCorridor | null>(([corridorId, stations]) => {
      const meta = corridorMeta.get(corridorId);
      if (!meta) return null;
      const departureSets = departureSetsByCorridor.get(corridorId);
      const withDepartures = stations.map((station) => ({
        ...station,
        departureTimes: sortTimes(departureSets?.get(station.stop_id) ?? new Set<string>()),
      }));
      return {
        corridorId,
        routeShortName: corridorId,
        routeLabel: meta.routeLabel,
        source: "go-train" as const,
        routeColor: meta.routeColor,
        seededSchedule: buildSeededSchedule(withDepartures),
        stations: withDepartures,
        geometry: meta.geometry,
      };
    });
  return corridors.filter((corridor): corridor is TrainCorridor => corridor != null);
}

async function buildUpxCorridor(): Promise<TrainCorridor | null> {
  const basePath = path.join(process.cwd(), "public", "union-pearson");
  const [stopsRaw, tripsRaw, stopTimesRaw, shapesRaw] = await Promise.all([
    fs.readFile(path.join(basePath, "stops.txt"), "utf8"),
    fs.readFile(path.join(basePath, "trips.txt"), "utf8"),
    fs.readFile(path.join(basePath, "stop_times.txt"), "utf8"),
    fs.readFile(path.join(basePath, "shapes.txt"), "utf8"),
  ]);

  const stopLines = stopsRaw.split("\n").filter(Boolean);
  const stopHeaders = parseCsvLine(stopLines[0] || "").map((header) =>
    header.trim().replace(/^\uFEFF/, ""),
  );
  const stopById = new Map<
    string,
    { stop_name: string; stop_lat: number; stop_lon: number }
  >();
  stopLines.slice(1).forEach((line) => {
    const values = parseCsvLine(line);
    const row = stopHeaders.reduce<Record<string, string>>((acc, header, index) => {
      acc[header] = (values[index] || "").trim();
      return acc;
    }, {});
    const stopId = row.stop_id;
    const stopLat = Number(row.stop_lat);
    const stopLon = Number(row.stop_lon);
    if (!stopId || Number.isNaN(stopLat) || Number.isNaN(stopLon)) return;
    stopById.set(stopId, {
      stop_name: row.stop_name || stopId,
      stop_lat: stopLat,
      stop_lon: stopLon,
    });
  });

  const tripLines = tripsRaw.split("\n").filter(Boolean);
  const tripHeaders = parseCsvLine(tripLines[0] || "").map((header) =>
    header.trim().replace(/^\uFEFF/, ""),
  );
  const tripToShape = new Map<string, string>();
  let canonicalTripId: string | null = null;
  tripLines.slice(1).forEach((line) => {
    const values = parseCsvLine(line);
    const row = tripHeaders.reduce<Record<string, string>>((acc, header, index) => {
      acc[header] = (values[index] || "").trim();
      return acc;
    }, {});
    const tripId = row.trip_id;
    const shapeId = row.shape_id;
    if (tripId && shapeId) {
      tripToShape.set(tripId, shapeId);
    }
    if (!canonicalTripId && row.direction_id === "0" && tripId) {
      canonicalTripId = tripId;
    }
  });

  const stopTimeLines = stopTimesRaw.split("\n").filter(Boolean);
  const stopTimeHeaders = parseCsvLine(stopTimeLines[0] || "").map((header) =>
    header.trim().replace(/^\uFEFF/, ""),
  );
  const departureSets = new Map<string, Set<string>>();
  const canonicalStops: Array<{ stop_id: string; stop_sequence: number }> = [];

  stopTimeLines.slice(1).forEach((line) => {
    const values = parseCsvLine(line);
    const row = stopTimeHeaders.reduce<Record<string, string>>((acc, header, index) => {
      acc[header] = (values[index] || "").trim();
      return acc;
    }, {});
    const tripId = row.trip_id;
    const stopId = row.stop_id;
    if (!tripId || !stopId) return;

    const formattedDeparture = formatTime(parseTimeToSeconds(row.departure_time || row.arrival_time));
    if (formattedDeparture) {
      if (!departureSets.has(stopId)) departureSets.set(stopId, new Set<string>());
      departureSets.get(stopId)!.add(formattedDeparture);
    }

    if (canonicalTripId && tripId === canonicalTripId) {
      canonicalStops.push({
        stop_id: stopId,
        stop_sequence: Number(row.stop_sequence || "0"),
      });
    }
  });

  const orderedStations = canonicalStops
    .sort((left, right) => left.stop_sequence - right.stop_sequence)
    .map((stop, index) => {
      const stopInfo = stopById.get(stop.stop_id);
      if (!stopInfo) return null;
      return {
        stop_id: stop.stop_id,
        stop_name: stopInfo.stop_name,
        stop_lat: stopInfo.stop_lat,
        stop_lon: stopInfo.stop_lon,
        stop_sequence: index + 1,
        departureTimes: sortTimes(departureSets.get(stop.stop_id) ?? new Set<string>()),
      };
    })
    .filter((station): station is TrainCorridorStation => station != null);
  if (orderedStations.length === 0) return null;

  const shapeLines = shapesRaw.split("\n").filter(Boolean);
  const shapeHeaders = parseCsvLine(shapeLines[0] || "").map((header) =>
    header.trim().replace(/^\uFEFF/, ""),
  );
  const shapes = new Map<string, Array<{ coord: [number, number]; seq: number }>>();
  shapeLines.slice(1).forEach((line) => {
    const values = parseCsvLine(line);
    const row = shapeHeaders.reduce<Record<string, string>>((acc, header, index) => {
      acc[header] = (values[index] || "").trim();
      return acc;
    }, {});
    const shapeId = row.shape_id;
    const lat = Number(row.shape_pt_lat);
    const lon = Number(row.shape_pt_lon);
    const seq = Number(row.shape_pt_sequence || "0");
    if (!shapeId || Number.isNaN(lat) || Number.isNaN(lon) || Number.isNaN(seq)) return;
    if (!shapes.has(shapeId)) shapes.set(shapeId, []);
    shapes.get(shapeId)!.push({ coord: [lon, lat], seq });
  });

  const canonicalShapeId = (canonicalTripId && tripToShape.get(canonicalTripId)) || "UNPA";
  const canonicalShape = shapes.get(canonicalShapeId);
  if (!canonicalShape || canonicalShape.length === 0) return null;

  return {
    corridorId: "upx",
    routeShortName: "UP",
    routeLabel: "UP - Union Pearson Express",
    source: "upx",
    routeColor: colorForRoute("UP"),
    seededSchedule: buildSeededSchedule(orderedStations),
    stations: orderedStations,
    geometry: {
      type: "LineString",
      coordinates: canonicalShape.sort((left, right) => left.seq - right.seq).map((entry) => entry.coord),
    },
  };
}

async function buildTrainCorridors(): Promise<TrainCorridorMap> {
  const corridors = new Map<string, TrainCorridor>();
  const goCorridors = await buildGoTrainCorridors();
  goCorridors.forEach((corridor) => corridors.set(corridor.corridorId, corridor));
  const upx = await buildUpxCorridor();
  if (upx) corridors.set(upx.corridorId, upx);
  return corridors;
}

export async function getTrainCorridors(): Promise<TrainCorridor[]> {
  const now = Date.now();
  if (cachedCorridors && cachedCorridors.expiresAt > now) {
    return Array.from(cachedCorridors.data.values());
  }

  if (!inFlightBuild) {
    inFlightBuild = buildTrainCorridors()
      .then((data) => {
        cachedCorridors = {
          expiresAt: Date.now() + CACHE_TTL_MS,
          data,
        };
        inFlightBuild = null;
        return data;
      })
      .catch((error) => {
        inFlightBuild = null;
        throw error;
      });
  }

  return Array.from((await inFlightBuild).values());
}

export async function getTrainCorridor(corridorId: string): Promise<TrainCorridor | null> {
  const corridors = await getTrainCorridors();
  return corridors.find((corridor) => corridor.corridorId === corridorId) ?? null;
}
