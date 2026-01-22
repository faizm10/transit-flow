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

export async function GET() {
  try {
    const filePath = path.join(process.cwd(), "public", "union-pearson", "shapes.txt");
    const fileContents = await fs.readFile(filePath, "utf8");

    const lines = fileContents.split("\n").filter(Boolean);
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

    return NextResponse.json(featureCollection);
  } catch (error) {
    console.error("Error fetching Union Pearson shapes:", error);
    return NextResponse.json(
      { error: "Failed to fetch Union Pearson shapes" },
      { status: 500 }
    );
  }
}
