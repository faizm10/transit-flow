import path from "path";
import { createReadStream } from "fs";
import { promises as fs } from "fs";
import readline from "readline";

const CACHE_TTL_MS = 1000 * 60 * 30;

type VariantEntry = {
  variant_id: string;
  label: string;
  route_id: string;
  direction_id: number;
  representative_trip_id: string;
  route_variant?: string;
};

type RouteEntry = {
  route_id: string;
  route_short_name: string;
  route_long_name: string;
  route_type: number | string;
};

export type GoStopTiming = {
  stop_id: string;
  stop_name: string;
  stop_sequence: number;
  arrival_time: string;
  departure_time: string;
};

export type GoScheduleBuilderPayload = {
  variantId: string;
  routeShortName: string;
  routeLabel: string;
  directionId: number;
  seededSchedule?: {
    primary: {
      type: "fixed";
      departures: string[];
    };
  };
  stopTimings: GoStopTiming[];
  timedStopCount: number;
  departureCount: number;
  startStopName: string;
  endStopName: string;
};

let cachedPayloads:
  | {
      expiresAt: number;
      data: Map<string, GoScheduleBuilderPayload>;
    }
  | null = null;
let inFlightBuild: Promise<Map<string, GoScheduleBuilderPayload>> | null = null;

function parseCsvLine(line: string): string[] {
  const values: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];

    if (char === "\"") {
      if (inQuotes && next === "\"") {
        current += "\"";
        index += 1;
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

async function buildScheduleBuilderPayloads(): Promise<Map<string, GoScheduleBuilderPayload>> {
  const basePath = path.join(process.cwd(), "public", "gotransit", "derived");
  const variantsPath = path.join(basePath, "variants_index.json");
  const routesPath = path.join(basePath, "routes_index.json");
  const variantStopsPath = path.join(basePath, "variant_stops.json");
  const stopTimesPath = path.join(process.cwd(), "public", "gotransit", "stop_times.txt");
  const tripsPath = path.join(process.cwd(), "public", "gotransit", "trips.txt");

  const [variantsRaw, routesRaw, variantStopsRaw, tripsRaw] = await Promise.all([
    fs.readFile(variantsPath, "utf8"),
    fs.readFile(routesPath, "utf8"),
    fs.readFile(variantStopsPath, "utf8"),
    fs.readFile(tripsPath, "utf8"),
  ]);

  const variantsIndex = JSON.parse(variantsRaw) as Record<string, VariantEntry[]>;
  const routesIndex = JSON.parse(routesRaw) as RouteEntry[];
  const variantStops = JSON.parse(variantStopsRaw) as Record<string, GoStopTiming[]>;

  const routeById = new Map<string, RouteEntry>();
  routesIndex.forEach((route) => routeById.set(route.route_id, route));

  const variantLookup = new Map<
    string,
    {
      routeShortName: string;
      routeLabel: string;
      directionId: number;
      routeId: string;
      representativeTripId: string;
      routeVariant: string;
    }
  >();

  Object.entries(variantsIndex).forEach(([routeShortName, variants]) => {
    variants.forEach((variant) => {
      const routeVariant = (variant.route_variant || "").trim() || variant.variant_id;
      variantLookup.set(variant.variant_id, {
        routeShortName,
        routeLabel: `${routeShortName} - ${variant.label}`,
        directionId: variant.direction_id,
        routeId: variant.route_id,
        representativeTripId: variant.representative_trip_id,
        routeVariant,
      });
    });
  });

  const tripHeaders = parseCsvLine(tripsRaw.split("\n")[0] || "").map((h) => h.trim().replace(/^\uFEFF/, ""));
  const tripToVariants = new Map<string, string[]>();

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

      const routeId = row.route_id;
      const directionId = row.direction_id ? Number.parseInt(row.direction_id, 10) : 0;
      const routeVariant = row.route_variant || "";
      const tripId = row.trip_id;
      if (!tripId) return;

      variantLookup.forEach((info, variantId) => {
        if (
          info.routeId === routeId &&
          info.directionId === directionId &&
          (routeVariant === "" || info.routeVariant === routeVariant)
        ) {
          if (!tripToVariants.has(tripId)) {
            tripToVariants.set(tripId, []);
          }
          tripToVariants.get(tripId)!.push(variantId);
        }
      });
    });

  const departuresByVariant = new Map<string, number[]>();
  const stopTimingsByVariant = new Map<string, GoStopTiming[]>();
  const representativeTripToVariant = new Map<string, string>();
  variantLookup.forEach((info, variantId) => {
    representativeTripToVariant.set(info.representativeTripId, variantId);
  });

  const stream = createReadStream(stopTimesPath, { encoding: "utf8" });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
  let headers: string[] = [];
  let isHeader = true;

  for await (const line of rl) {
    if (!line) continue;
    if (isHeader) {
      headers = parseCsvLine(line).map((header) => header.trim());
      if (headers[0]) headers[0] = headers[0].replace(/^\uFEFF/, "");
      isHeader = false;
      continue;
    }

    const values = parseCsvLine(line);
    const row = headers.reduce<Record<string, string>>((acc, header, index) => {
      acc[header] = (values[index] || "").trim();
      return acc;
    }, {});

    const tripId = row.trip_id;
    if (!tripId) continue;

    const departureTime = parseTimeToSeconds(row.departure_time || row.arrival_time);
    const stopSequence = Number.parseInt(row.stop_sequence || "0", 10);
    const variantIds = tripToVariants.get(tripId) ?? [];

    if (stopSequence === 1 && departureTime !== null) {
      variantIds.forEach((variantId) => {
        if (!departuresByVariant.has(variantId)) departuresByVariant.set(variantId, []);
        departuresByVariant.get(variantId)!.push(departureTime);
      });
    }

    const representativeVariantId = representativeTripToVariant.get(tripId);
    if (representativeVariantId) {
      if (!stopTimingsByVariant.has(representativeVariantId)) {
        stopTimingsByVariant.set(representativeVariantId, []);
      }
      stopTimingsByVariant.get(representativeVariantId)!.push({
        stop_id: row.stop_id || "",
        stop_name: row.stop_name || "",
        stop_sequence: stopSequence,
        arrival_time: formatTime(parseTimeToSeconds(row.arrival_time)),
        departure_time: formatTime(parseTimeToSeconds(row.departure_time || row.arrival_time)),
      });
    }
  }

  const payloads = new Map<string, GoScheduleBuilderPayload>();
  variantLookup.forEach((info, variantId) => {
    const departures = Array.from(
      new Set((departuresByVariant.get(variantId) ?? []).map((seconds) => formatTime(seconds))),
    ).sort();
    const timings = [...(stopTimingsByVariant.get(variantId) ?? [])].sort(
      (a, b) => a.stop_sequence - b.stop_sequence,
    );
    const stops = variantStops[variantId] || [];
    const route = routeById.get(info.routeId);

    payloads.set(variantId, {
      variantId,
      routeShortName: info.routeShortName,
      routeLabel: info.routeLabel,
      directionId: info.directionId,
      seededSchedule:
        departures.length > 0
          ? {
              primary: {
                type: "fixed",
                departures,
              },
            }
          : undefined,
      stopTimings: timings,
      timedStopCount: timings.length,
      departureCount: departures.length,
      startStopName: stops[0]?.stop_name || route?.route_long_name || "",
      endStopName: stops[stops.length - 1]?.stop_name || "",
    });
  });

  return payloads;
}

export async function getGoScheduleBuilderPayload(
  variantId: string,
): Promise<GoScheduleBuilderPayload | null> {
  const now = Date.now();
  if (cachedPayloads && cachedPayloads.expiresAt > now) {
    return cachedPayloads.data.get(variantId) ?? null;
  }

  if (!inFlightBuild) {
    inFlightBuild = buildScheduleBuilderPayloads()
      .then((data) => {
        cachedPayloads = {
          expiresAt: Date.now() + CACHE_TTL_MS,
          data,
        };
        return data;
      })
      .finally(() => {
        inFlightBuild = null;
      });
  }

  const data = await inFlightBuild;
  return data.get(variantId) ?? null;
}
