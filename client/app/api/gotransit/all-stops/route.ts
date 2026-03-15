import { NextRequest, NextResponse } from "next/server";
import { applyRateLimit, jsonError } from "@/lib/server/api";
import { readPublicTextCached } from "@/lib/server/gtfs-cache";

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

export async function GET(request: NextRequest) {
  const limited = applyRateLimit(request, {
    bucket: "all-stops",
    limit: 20,
    windowMs: 60_000,
  });
  if (limited) return limited;

  try {
    const stopsContent = await readPublicTextCached("gotransit/stops.txt");
    const stopsLines = stopsContent.split("\n").filter(Boolean);
    if (stopsLines.length === 0) {
      return jsonError(500, "Failed to load stops");
    }
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

    return NextResponse.json(geojson, {
      headers: {
        "Cache-Control": "public, max-age=1800, stale-while-revalidate=86400",
      },
    });
  } catch (error) {
    console.error("Error reading stops.txt:", error);
    return NextResponse.json({ error: "Failed to load stops" }, { status: 500 });
  }
}
