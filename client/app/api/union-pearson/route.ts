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

export async function GET(request: NextRequest) {
  const limited = applyRateLimit(request, {
    bucket: "union-pearson",
    limit: 20,
    windowMs: 60_000,
  });
  if (limited) return limited;

  try {
    const fileContents = await readPublicTextCached("union-pearson/shapes.txt");

    const lines = fileContents.split("\n").filter(Boolean);
    if (lines.length === 0) {
      return jsonError(500, "Failed to fetch Union Pearson shapes");
    }
    const headers = parseCsvLine(lines[0]).map((header) => header.trim());
    if (headers[0]) {
      headers[0] = headers[0].replace(/^\uFEFF/, "");
    }

    const data = lines.slice(1).map((line) => {
      const values = parseCsvLine(line);
      return headers.reduce<Record<string, string>>((obj, header, index) => {
        obj[header] = (values[index] || "").trim();
        return obj;
      }, {});
    });

    const shapes: { [key: string]: Array<{ coord: [number, number]; seq: number }> } = {};

    data.forEach((row) => {
      const shapeId = row.shape_id;
      const lat = parseFloat(row.shape_pt_lat);
      const lon = parseFloat(row.shape_pt_lon);
      const seq = Number.parseInt(row.shape_pt_sequence || "0", 10);

      if (!shapeId || !Number.isFinite(lat) || !Number.isFinite(lon)) {
        return;
      }

      if (!shapes[shapeId]) {
        shapes[shapeId] = [];
      }
      shapes[shapeId].push({ coord: [lon, lat], seq });
    });

    const featureCollection: GeoJSON.FeatureCollection = {
      type: "FeatureCollection",
      features: Object.keys(shapes).map((shapeId) => ({
        type: "Feature",
        properties: {
          shape_id: shapeId,
        },
        geometry: {
          type: "LineString",
          coordinates: shapes[shapeId]
            .sort((a, b) => a.seq - b.seq)
            .map((entry) => entry.coord),
        },
      })),
    };

    return NextResponse.json(featureCollection, {
      headers: {
        "Cache-Control": "public, max-age=1800, stale-while-revalidate=86400",
      },
    });
  } catch (error) {
    console.error("Error fetching Union Pearson shapes:", error);
    return NextResponse.json(
      { error: "Failed to fetch Union Pearson shapes" },
      { status: 500 }
    );
  }
}
