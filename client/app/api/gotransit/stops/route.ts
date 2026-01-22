import { NextResponse } from "next/server";
import path from "path";
import { promises as fs } from "fs";

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
    } else if (char === "," && !inQuotes) {
      values.push(current);
      current = "";
    } else {
      current += char;
    }
  }

  values.push(current);
  return values;
}

export async function GET() {
  try {
    const stopsPath = path.join(process.cwd(), "public", "gotransit", "stops.txt");
    const routesPath = path.join(process.cwd(), "public", "gotransit", "routes.txt");
    const tripsPath = path.join(process.cwd(), "public", "gotransit", "trips.txt");
    const stopTimesPath = path.join(process.cwd(), "public", "gotransit", "stop_times.txt");

    // Read and parse routes to find train (2) and bus (3) routes
    const routesContent = await fs.readFile(routesPath, "utf8");
    const routesLines = routesContent.split("\n").filter(Boolean);
    const routesHeaders = parseCsvLine(routesLines[0]).map((h) => h.trim());
    if (routesHeaders[0]) {
      routesHeaders[0] = routesHeaders[0].replace(/^\uFEFF/, "");
    }

    const goRoutes = new Map<
      string,
      { color: string; name: string; shortName: string; type: string }
    >();
    for (let i = 1; i < routesLines.length; i += 1) {
      const values = parseCsvLine(routesLines[i]);
      const route = routesHeaders.reduce<Record<string, string>>((obj, header, index) => {
        obj[header] = (values[index] || "").trim();
        return obj;
      }, {});

      if (route.route_type === "2" || route.route_type === "3") {
        goRoutes.set(route.route_id, {
          color: route.route_color || "10b981",
          name: route.route_long_name || "",
          shortName: route.route_short_name || "",
          type: route.route_type || "",
        });
      }
    }

    // Read and parse trips to find which trips belong to GO routes
    const tripsContent = await fs.readFile(tripsPath, "utf8");
    const tripsLines = tripsContent.split("\n").filter(Boolean);
    const tripsHeaders = parseCsvLine(tripsLines[0]).map((h) => h.trim());
    if (tripsHeaders[0]) {
      tripsHeaders[0] = tripsHeaders[0].replace(/^\uFEFF/, "");
    }

    const goTrips = new Map<string, string>(); // trip_id -> route_id
    for (let i = 1; i < tripsLines.length; i += 1) {
      const values = parseCsvLine(tripsLines[i]);
      const trip = tripsHeaders.reduce<Record<string, string>>((obj, header, index) => {
        obj[header] = (values[index] || "").trim();
        return obj;
      }, {});

      if (goRoutes.has(trip.route_id)) {
        goTrips.set(trip.trip_id, trip.route_id);
      }
    }

    // Read stop_times to find which stops are used by GO trips and which routes serve them
    // This file is large, so we'll sample it
    const stopTimesContent = await fs.readFile(stopTimesPath, "utf8");
    const stopTimesLines = stopTimesContent.split("\n").filter(Boolean);
    const stopTimesHeaders = parseCsvLine(stopTimesLines[0]).map((h) => h.trim());
    if (stopTimesHeaders[0]) {
      stopTimesHeaders[0] = stopTimesHeaders[0].replace(/^\uFEFF/, "");
    }

    const goStops = new Map<string, string[]>(); // stop_id -> route_ids[]
    // Sample every 100th line for performance (or just check first 10000 lines)
    const linesToCheck = Math.min(stopTimesLines.length, 50000);
    for (let i = 1; i < linesToCheck; i += 1) {
      const values = parseCsvLine(stopTimesLines[i]);
      const stopTime = stopTimesHeaders.reduce<Record<string, string>>((obj, header, index) => {
        obj[header] = (values[index] || "").trim();
        return obj;
      }, {});

      const routeId = goTrips.get(stopTime.trip_id);
      if (routeId) {
        if (!goStops.has(stopTime.stop_id)) {
          goStops.set(stopTime.stop_id, []);
        }
        const routes = goStops.get(stopTime.stop_id)!;
        if (!routes.includes(routeId)) {
          routes.push(routeId);
        }
      }
    }

    // Read and parse stops
    const stopsContent = await fs.readFile(stopsPath, "utf8");
    const stopsLines = stopsContent.split("\n").filter(Boolean);
    const stopsHeaders = parseCsvLine(stopsLines[0]).map((h) => h.trim());
    if (stopsHeaders[0]) {
      stopsHeaders[0] = stopsHeaders[0].replace(/^\uFEFF/, "");
    }

    const data = stopsLines.slice(1).map((line) => {
      const values = parseCsvLine(line);
      return stopsHeaders.reduce<Record<string, string>>((obj, header, index) => {
        obj[header] = (values[index] || "").trim();
        return obj;
      }, {});
    });

    // Filter to only include stops used by GO routes
    const features: GeoJSON.Feature[] = data
      .filter((row) => goStops.has(row.stop_id))
      .map((row) => {
        const lat = parseFloat(row.stop_lat);
        const lon = parseFloat(row.stop_lon);
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
          return null;
        }

        const routeIds = goStops.get(row.stop_id) || [];
        // Use the first route for the primary color
        const primaryRouteId = routeIds[0];
        const primaryRoute = goRoutes.get(primaryRouteId);
        const routeShortNames = routeIds
          .map((routeId) => {
            const route = goRoutes.get(routeId);
            return route?.shortName || route?.name || routeId;
          })
          .filter(Boolean);
        const routeTypes = routeIds
          .map((routeId) => goRoutes.get(routeId)?.type || "")
          .filter(Boolean);
        const routeNames = routeIds
          .map((routeId) => goRoutes.get(routeId)?.name || "")
          .filter(Boolean);

        return {
          type: "Feature",
          properties: {
            stop_id: row.stop_id,
            stop_name: row.stop_name,
            stop_code: row.stop_code || "",
            route_color: primaryRoute ? `#${primaryRoute.color}` : "#10b981",
            route_name: primaryRoute?.name || "",
            route_short_name: primaryRoute?.shortName || "",
            routes_count: routeIds.length,
            route_ids: routeIds,
            route_short_names: routeShortNames,
            route_names: routeNames,
            route_types: routeTypes,
          },
          geometry: {
            type: "Point",
            coordinates: [lon, lat],
          },
        } as GeoJSON.Feature;
      })
      .filter(Boolean) as GeoJSON.Feature[];

    const geojson: GeoJSON.FeatureCollection = {
      type: "FeatureCollection",
      features,
    };

    return NextResponse.json(geojson);
  } catch (error) {
    console.error("Error reading GO Transit stops:", error);
    return NextResponse.json({ error: "Failed to load stops" }, { status: 500 });
  }
}
