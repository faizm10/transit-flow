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
    const stopsContent = await fs.readFile(stopsPath, "utf8");
    const stopsLines = stopsContent.split("\n").filter(Boolean);
    const stopsHeaders = parseCsvLine(stopsLines[0]).map((h) => h.trim());
    if (stopsHeaders[0]) {
      stopsHeaders[0] = stopsHeaders[0].replace(/^\uFEFF/, "");
    }

    const features: GeoJSON.Feature[] = stopsLines.slice(1)
      .map((line) => {
        const values = parseCsvLine(line);
        const row = stopsHeaders.reduce<Record<string, string>>((obj, header, index) => {
          obj[header] = (values[index] || "").trim();
          return obj;
        }, {});
        const lat = parseFloat(row.stop_lat);
        const lon = parseFloat(row.stop_lon);
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
          return null;
        }
        return {
          type: "Feature",
          properties: {
            stop_id: row.stop_id,
            stop_name: row.stop_name,
            stop_code: row.stop_code || "",
            location_type: row.location_type || "",
            parent_station: row.parent_station || "",
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
    console.error("Error reading stops.txt:", error);
    return NextResponse.json({ error: "Failed to load stops" }, { status: 500 });
  }
}
