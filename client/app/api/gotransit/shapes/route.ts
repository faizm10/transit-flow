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
    const routesPath = path.join(process.cwd(), "public", "gotransit", "routes.txt");
    const tripsPath = path.join(process.cwd(), "public", "gotransit", "trips.txt");
    const shapesPath = path.join(process.cwd(), "public", "gotransit", "shapes.txt");

    // Read and parse routes to find train routes (route_type = 2)
    const routesContent = await fs.readFile(routesPath, "utf8");
    const routesLines = routesContent.split("\n").filter(Boolean);
    const routesHeaders = parseCsvLine(routesLines[0]).map((h) => h.trim());
    if (routesHeaders[0]) {
      routesHeaders[0] = routesHeaders[0].replace(/^\uFEFF/, "");
    }

    const allRoutes = new Map<string, { color: string; name: string; shortName: string; type: string }>();
    for (let i = 1; i < routesLines.length; i += 1) {
      const values = parseCsvLine(routesLines[i]);
      const route = routesHeaders.reduce<Record<string, string>>((obj, header, index) => {
        obj[header] = (values[index] || "").trim();
        return obj;
      }, {});

      allRoutes.set(route.route_id, {
        color: route.route_color || "10b981",
        name: route.route_long_name || "",
        shortName: route.route_short_name || "",
        type: route.route_type || "",
      });
    }

    // Read trips to map shape_id to route_id
    const tripsContent = await fs.readFile(tripsPath, "utf8");
    const tripsLines = tripsContent.split("\n").filter(Boolean);
    const tripsHeaders = parseCsvLine(tripsLines[0]).map((h) => h.trim());
    if (tripsHeaders[0]) {
      tripsHeaders[0] = tripsHeaders[0].replace(/^\uFEFF/, "");
    }
    const shapeToRoute = new Map<string, string>(); // shape_id -> route_id
    for (let i = 1; i < tripsLines.length; i += 1) {
      const values = parseCsvLine(tripsLines[i]);
      const trip = tripsHeaders.reduce<Record<string, string>>((obj, header, index) => {
        obj[header] = (values[index] || "").trim();
        return obj;
      }, {});
      if (allRoutes.has(trip.route_id) && trip.shape_id) {
        shapeToRoute.set(trip.shape_id, trip.route_id);
      }
    }
    // Read shapes.txt and build LineStrings
    const shapesContent = await fs.readFile(shapesPath, "utf8");
    const shapesLines = shapesContent.split("\n").filter(Boolean);
    const shapesHeaders = parseCsvLine(shapesLines[0]).map((h) => h.trim());
    if (shapesHeaders[0]) {
      shapesHeaders[0] = shapesHeaders[0].replace(/^\uFEFF/, "");
    }
    // Group shape points by shape_id
    const shapePoints = new Map<string, Array<[number, number, number]>>(); // shape_id -> [[lon, lat, sequence]]
    for (let i = 1; i < shapesLines.length; i += 1) {
      const values = parseCsvLine(shapesLines[i]);
      const shape = shapesHeaders.reduce<Record<string, string>>((obj, header, index) => {
        obj[header] = (values[index] || "").trim();
        return obj;
      }, {});
      const shapeId = shape.shape_id;
      if (!shapeToRoute.has(shapeId)) continue;
      const lat = parseFloat(shape.shape_pt_lat);
      const lon = parseFloat(shape.shape_pt_lon);
      const sequence = parseInt(shape.shape_pt_sequence, 10);
      if (!Number.isFinite(lat) || !Number.isFinite(lon) || !Number.isFinite(sequence)) {
        continue;
      }
      if (!shapePoints.has(shapeId)) {
        shapePoints.set(shapeId, []);
      }
      shapePoints.get(shapeId)!.push([lon, lat, sequence]);
    }
    // Create GeoJSON features
    const features: GeoJSON.Feature[] = [];
    for (const [shapeId, points] of shapePoints.entries()) {
      const routeId = shapeToRoute.get(shapeId);
      if (!routeId) continue;
      const routeInfo = allRoutes.get(routeId);
      if (!routeInfo) continue;
      // Sort points by sequence
      points.sort((a, b) => a[2] - b[2]);
      // Convert to coordinate array (remove sequence)
      const coordinates: [number, number][] = points.map(([lon, lat]) => [lon, lat]);
      features.push({
        type: "Feature",
        properties: {
          shape_id: shapeId,
          route_id: routeId,
          route_color: `#${routeInfo.color}`,
          route_name: routeInfo.name,
          route_short_name: routeInfo.shortName,
          route_type: routeInfo.type,
        },
        geometry: {
          type: "LineString",
          coordinates,
        },
      } as GeoJSON.Feature);
    }

    const geojson: GeoJSON.FeatureCollection = {
      type: "FeatureCollection",
      features,
    };

    console.log(`[GO] Returning ${features.length} shape features`);

    return NextResponse.json(geojson);
  } catch (error) {
    console.error("Error reading GO Transit shapes:", error);
    return NextResponse.json({ error: "Failed to load shapes" }, { status: 500 });
  }
}
