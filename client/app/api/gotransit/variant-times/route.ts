import { NextResponse } from "next/server";
import path from "path";
import { createReadStream } from "fs";
import { promises as fs } from "fs";
import readline from "readline";

type VariantEntry = {
  variant_id: string;
  label: string;
  route_id: string;
  direction_id: number;
  shape_id: string | null;
  trip_count: number;
  representative_trip_id: string;
  route_variant?: string;
};

type RouteEntry = {
  route_id: string;
  route_short_name: string;
  route_long_name: string;
  route_type: number | string;
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

function formatDuration(seconds: number | null): string {
  if (seconds === null || seconds < 0) return "N/A";
  const minutesTotal = Math.round(seconds / 60);
  const hours = Math.floor(minutesTotal / 60);
  const minutes = minutesTotal % 60;
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

function formatTime(seconds: number | null): string {
  if (seconds === null) return "";
  const hours = Math.floor(seconds / 3600) % 24;
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const requestedVariantId = searchParams.get("variant_id")?.trim();
    const basePath = path.join(
      process.cwd(),
      "public",
      "gotransit",
      "derived",
    );
    const variantsPath = path.join(basePath, "variants_index.json");
    const routesPath = path.join(basePath, "routes_index.json");
    const variantStopsPath = path.join(basePath, "variant_stops.json");
    const stopTimesPath = path.join(
      process.cwd(),
      "public",
      "gotransit",
      "stop_times.txt",
    );

    const [variantsRaw, routesRaw, variantStopsRaw] = await Promise.all([
      fs.readFile(variantsPath, "utf8"),
      fs.readFile(routesPath, "utf8"),
      fs.readFile(variantStopsPath, "utf8"),
    ]);

    const variantsIndex = JSON.parse(variantsRaw) as Record<
      string,
      VariantEntry[]
    >;
    const routesIndex = JSON.parse(routesRaw) as RouteEntry[];
    const variantStops = JSON.parse(variantStopsRaw) as Record<
      string,
      Array<{
        stop_id: string;
        stop_name: string;
        stop_lat: number | null;
        stop_lon: number | null;
        stop_sequence: number;
      }>
    >;

    const routeById = new Map<string, RouteEntry>();
    routesIndex.forEach((route) => routeById.set(route.route_id, route));

    const variantLookup = new Map<
      string,
      {
        route_short_name: string;
        route_variant: string;
        direction_id: number;
        route_id: string;
        representative_trip_id: string;
      }
    >();

    const targetTripIds = new Set<string>();
    Object.entries(variantsIndex).forEach(([routeShortName, variants]) => {
      variants.forEach((variant) => {
        const routeVariant = (variant.route_variant || "").trim();
        const displayVariant = routeVariant || variant.variant_id;
        variantLookup.set(variant.variant_id, {
          route_short_name: routeShortName,
          route_variant: displayVariant,
          direction_id: variant.direction_id,
          route_id: variant.route_id,
          representative_trip_id: variant.representative_trip_id,
        });
        targetTripIds.add(variant.representative_trip_id);
      });
    });

    const tripTimes = new Map<
      string,
      { minSeq: number; maxSeq: number; start: number | null; end: number | null }
    >();
    const requestedStopTimings = new Map<
      string,
      Array<{
        stop_id: string;
        stop_name: string;
        stop_sequence: number;
        arrival_time: string;
        departure_time: string;
      }>
    >();

    const stream = createReadStream(stopTimesPath, { encoding: "utf8" });
    const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
    let headers: string[] = [];
    let isHeader = true;

    for await (const line of rl) {
      if (!line) continue;
      if (isHeader) {
        headers = parseCsvLine(line).map((header) => header.trim());
        if (headers[0]) {
          headers[0] = headers[0].replace(/^\uFEFF/, "");
        }
        isHeader = false;
        continue;
      }

      const values = parseCsvLine(line);
      const row = headers.reduce<Record<string, string>>((acc, header, idx) => {
        acc[header] = (values[idx] || "").trim();
        return acc;
      }, {});

      const tripId = row.trip_id;
      if (!tripId || !targetTripIds.has(tripId)) continue;

      const sequence = Number(row.stop_sequence);
      if (!Number.isFinite(sequence)) continue;

      const startTime = parseTimeToSeconds(row.departure_time || row.arrival_time);
      const endTime = parseTimeToSeconds(row.arrival_time || row.departure_time);

      const current = tripTimes.get(tripId);
      if (!current) {
        tripTimes.set(tripId, {
          minSeq: sequence,
          maxSeq: sequence,
          start: startTime,
          end: endTime,
        });
        continue;
      }

      if (sequence < current.minSeq) {
        current.minSeq = sequence;
        current.start = startTime;
      } else if (sequence === current.minSeq && current.start === null) {
        current.start = startTime;
      }

      if (sequence > current.maxSeq) {
        current.maxSeq = sequence;
        current.end = endTime;
      } else if (sequence === current.maxSeq && current.end === null) {
        current.end = endTime;
      }

      if (requestedVariantId) {
        const variantInfo = variantLookup.get(requestedVariantId);
        if (variantInfo?.representative_trip_id === tripId) {
          if (!requestedStopTimings.has(requestedVariantId)) {
            requestedStopTimings.set(requestedVariantId, []);
          }
          requestedStopTimings.get(requestedVariantId)!.push({
            stop_id: row.stop_id || "",
            stop_name: row.stop_name || "",
            stop_sequence: sequence,
            arrival_time: formatTime(parseTimeToSeconds(row.arrival_time)),
            departure_time: formatTime(parseTimeToSeconds(row.departure_time || row.arrival_time)),
          });
        }
      }
    }

    const results = Array.from(variantLookup.entries())
      .filter(([variantId]) => !requestedVariantId || variantId === requestedVariantId)
      .map(
      ([variantId, info]) => {
        const tripInfo = tripTimes.get(info.representative_trip_id);
        const durationSeconds =
          tripInfo && tripInfo.start !== null && tripInfo.end !== null
            ? tripInfo.end - tripInfo.start
            : null;

        const stops = variantStops[variantId] || [];
        const startStop = stops[0]?.stop_name || "";
        const endStop = stops[stops.length - 1]?.stop_name || "";

        const route = routeById.get(info.route_id);

        return {
          variant_id: variantId,
          route_short_name: info.route_short_name,
          route_variant: info.route_variant,
          direction_id: info.direction_id,
          route_id: info.route_id,
          route_long_name: route?.route_long_name || "",
          route_type: route?.route_type ?? "",
          start_stop_name: startStop,
          end_stop_name: endStop,
          duration_seconds: durationSeconds,
          duration_label: formatDuration(durationSeconds),
          stop_timings:
            requestedVariantId === variantId
              ? (requestedStopTimings.get(variantId) ?? []).sort(
                  (a, b) => a.stop_sequence - b.stop_sequence,
                )
              : undefined,
        };
      },
    );

    results.sort((a, b) => {
      const typeA = String(a.route_type);
      const typeB = String(b.route_type);
      if (typeA !== typeB) return typeA.localeCompare(typeB);
      if (a.route_short_name !== b.route_short_name) {
        return a.route_short_name.localeCompare(b.route_short_name);
      }
      if (a.route_variant !== b.route_variant) {
        return a.route_variant.localeCompare(b.route_variant);
      }
      return a.direction_id - b.direction_id;
    });

    return NextResponse.json({ results });
  } catch (error) {
    console.error("Error building variant times:", error);
    return NextResponse.json(
      { error: "Failed to load variant times" },
      { status: 500 },
    );
  }
}
