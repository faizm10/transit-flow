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
    const filePath = path.join(process.cwd(), "public", "union-pearson", "stops.txt");
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

    const features: GeoJSON.Feature[] = data
      .map((row) => {
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
          },
          geometry: {
            type: "Point",
            coordinates: [lon, lat],
          },
        } as GeoJSON.Feature;
      })
      .filter(Boolean) as GeoJSON.Feature[];

    return NextResponse.json({
      type: "FeatureCollection",
      features,
    } satisfies GeoJSON.FeatureCollection);
  } catch (error) {
    console.error("Error fetching Union Pearson stops:", error);
    return NextResponse.json(
      { error: "Failed to fetch Union Pearson stops" },
      { status: 500 }
    );
  }
}
