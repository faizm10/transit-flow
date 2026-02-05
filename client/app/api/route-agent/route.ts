import { NextRequest, NextResponse } from "next/server";

type StopData = {
  stop_id: string;
  stop_name: string;
  stop_lat: number;
  stop_lon: number;
};

type RouteContext = {
  name?: string;
  stops?: Array<{ name?: string; lat: number; lng: number }>;
};

type RouteStop = {
  name: string;
  lat: number;
  lng: number;
  reasoning?: string;
  matched?: boolean;
};

const MAX_TOTAL_STOPS = 6;
const NEARBY_STOP_KM = 3;

function toRad(value: number) {
  return (value * Math.PI) / 180;
}

function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const sin1 = Math.sin(dLat / 2);
  const sin2 = Math.sin(dLng / 2);
  const h = sin1 * sin1 + Math.cos(lat1) * Math.cos(lat2) * sin2 * sin2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

function normalizeName(input: string) {
  return input.trim().toLowerCase();
}

function uniqStops(stops: RouteStop[]) {
  const seen = new Set<string>();
  const output: RouteStop[] = [];
  for (const stop of stops) {
    const key = `${normalizeName(stop.name)}|${stop.lat.toFixed(5)}|${stop.lng.toFixed(5)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(stop);
  }
  return output;
}

async function loadStops(): Promise<StopData[]> {
  try {
    const fs = await import("fs");
    const path = await import("path");
    const stopsPath = path.join(process.cwd(), "public", "gotransit", "stops.txt");
    const content = fs.readFileSync(stopsPath, "utf-8");
    const lines = content.split("\n");
    const stops: StopData[] = [];

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      const parts = line.split(",");
      if (parts.length < 4) continue;

      const stop_id = parts[0];
      const stop_name = parts[1];
      const stop_lat = parseFloat(parts[2]);
      const stop_lon = parseFloat(parts[3]);

      if (isNaN(stop_lat) || isNaN(stop_lon)) continue;
      stops.push({ stop_id, stop_name, stop_lat, stop_lon });
    }

    return stops;
  } catch (error) {
    console.error("Error loading stops:", error);
    return [];
  }
}

function findStopByName(stops: StopData[], name: string): StopData | null {
  const norm = normalizeName(name);
  const exact = stops.find((s) => normalizeName(s.stop_name) === norm);
  if (exact) return exact;
  const contains = stops.find((s) => normalizeName(s.stop_name).includes(norm));
  if (contains) return contains;
  const reverse = stops.find((s) => norm.includes(normalizeName(s.stop_name)));
  return reverse ?? null;
}

async function geocodePlace(query: string) {
  const token = process.env.MAPBOX_ACCESS_TOKEN || process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;
  if (!token) {
    return { error: "Mapbox token not configured" as const };
  }

  const bbox = "-95.16,41.67,-57.10,62.00"; // Ontario + Quebec bounds
  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(
    query
  )}.json?access_token=${token}&limit=1&bbox=${bbox}`;
  try {
    const response = await fetch(url);
    if (!response.ok) {
      return { error: `Mapbox geocoding failed (${response.status})` as const };
    }
    const data = await response.json();
    const feature = Array.isArray(data?.features) ? data.features[0] : null;
    if (!feature?.center || feature.center.length < 2) {
      return { error: "Mapbox geocoding returned no result" as const };
    }
    return {
      name: feature.text || query,
      lng: feature.center[0],
      lat: feature.center[1],
    };
  } catch (err) {
    return { error: `Mapbox geocoding fetch failed (${String(err)})` as const };
  }
}

async function resolvePlace(stops: StopData[], input: string) {
  const match = findStopByName(stops, input);
  if (match) {
    return {
      name: match.stop_name,
      lat: match.stop_lat,
      lng: match.stop_lon,
      matched: true,
    } as RouteStop;
  }

  const geo = await geocodePlace(input);
  if (!geo || "error" in geo) {
    return { error: geo && "error" in geo ? geo.error : "Failed to geocode place" };
  }
  return {
    name: geo.name || input,
    lat: geo.lat,
    lng: geo.lng,
    matched: false,
  } as RouteStop;
}

function parseAnchors(prompt: string) {
  const text = prompt.trim();
  const patterns = [
    /from\s+(.+?)\s+to\s+(.+)/i,
    /between\s+(.+?)\s+and\s+(.+)/i,
    /(.+?)\s+to\s+(.+)/i,
    /(.+?)\s*[-–—]\s*(.+)/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match && match[1] && match[2]) {
      return { start: match[1].trim(), end: match[2].trim() };
    }
  }
  return null;
}

function extractStopList(prompt: string) {
  const lower = prompt.toLowerCase();
  const markers = [
    "add stops to",
    "add stop to",
    "add stops",
    "add stop",
    "insert stops",
    "insert stop",
    "include stops",
    "include stop",
  ];
  for (const marker of markers) {
    const idx = lower.indexOf(marker);
    if (idx >= 0) {
      const tail = prompt.slice(idx + marker.length).trim();
      if (!tail) return [];
      return tail
        .split(/,| and /i)
        .map((entry) => entry.trim())
        .filter(Boolean);
    }
  }
  return [];
}

function extractRemoveList(prompt: string) {
  const lower = prompt.toLowerCase();
  const markers = ["remove stops", "remove stop", "delete stops", "delete stop"];
  for (const marker of markers) {
    const idx = lower.indexOf(marker);
    if (idx >= 0) {
      const tail = prompt.slice(idx + marker.length).trim();
      if (!tail) return [];
      return tail
        .split(/,| and /i)
        .map((entry) => entry.trim())
        .filter(Boolean);
    }
  }
  return [];
}

function lineProjectProgress(
  line: Array<[number, number]>,
  point: { lat: number; lng: number }
) {
  let bestProgress = 0;
  let bestDist = Infinity;
  let total = 0;
  const segLengths: number[] = [];

  for (let i = 0; i < line.length - 1; i++) {
    const a = { lng: line[i][0], lat: line[i][1] };
    const b = { lng: line[i + 1][0], lat: line[i + 1][1] };
    const len = haversineKm(a, b);
    segLengths.push(len);
    total += len;
  }

  let traveled = 0;
  for (let i = 0; i < line.length - 1; i++) {
    const a = { lng: line[i][0], lat: line[i][1] };
    const b = { lng: line[i + 1][0], lat: line[i + 1][1] };
    const dx = b.lng - a.lng;
    const dy = b.lat - a.lat;
    const len2 = dx * dx + dy * dy;
    const t = len2 === 0 ? 0 : ((point.lng - a.lng) * dx + (point.lat - a.lat) * dy) / len2;
    const clamped = Math.max(0, Math.min(1, t));
    const proj = { lng: a.lng + clamped * dx, lat: a.lat + clamped * dy };
    const dist = haversineKm(point, proj);
    if (dist < bestDist) {
      bestDist = dist;
      const segLen = segLengths[i] ?? 0;
      bestProgress = total > 0 ? (traveled + segLen * clamped) / total : 0;
    }
    traveled += segLengths[i] ?? 0;
  }

  return bestProgress;
}

function sampleLine(line: Array<[number, number]>, stepKm = 0.4) {
  if (line.length < 2) return line;
  const samples: Array<[number, number]> = [line[0]];
  let carry = 0;

  for (let i = 0; i < line.length - 1; i++) {
    const a = { lng: line[i][0], lat: line[i][1] };
    const b = { lng: line[i + 1][0], lat: line[i + 1][1] };
    const segmentKm = haversineKm(a, b);
    if (segmentKm === 0) continue;

    let dist = carry;
    while (dist + stepKm <= segmentKm) {
      dist += stepKm;
      const t = dist / segmentKm;
      samples.push([a.lng + (b.lng - a.lng) * t, a.lat + (b.lat - a.lat) * t]);
    }
    carry = segmentKm - dist;
  }

  samples.push(line[line.length - 1]);
  return samples;
}

function collectStopsAlongRoute(
  stops: StopData[],
  line: Array<[number, number]>,
  maxStops: number
) {
  const samplePoints = sampleLine(line);
  const seen = new Set<string>();
  const ordered: StopData[] = [];

  for (const [lng, lat] of samplePoints) {
    let nearest: StopData | null = null;
    let nearestKm = Infinity;
    for (const stop of stops) {
      const km = haversineKm({ lat, lng }, { lat: stop.stop_lat, lng: stop.stop_lon });
      if (km <= NEARBY_STOP_KM && km < nearestKm) {
        nearestKm = km;
        nearest = stop;
      }
    }
    if (nearest) {
      const key = nearest.stop_id;
      if (!seen.has(key)) {
        seen.add(key);
        ordered.push(nearest);
        if (ordered.length >= maxStops) break;
      }
    }
  }

  return ordered;
}

async function getRouteGeometry(start: RouteStop, end: RouteStop) {
  const token = process.env.MAPBOX_ACCESS_TOKEN || process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;
  if (!token) {
    return { error: "Mapbox token not configured" as const };
  }

  const coords = `${start.lng},${start.lat};${end.lng},${end.lat}`;
  const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${coords}?geometries=geojson&overview=full&access_token=${token}`;
  let response: Response;
  try {
    response = await fetch(url);
  } catch (err) {
    return { error: `Mapbox routing fetch failed (${String(err)})` as const };
  }
  if (!response.ok) {
    return { error: `Mapbox routing failed (${response.status})` as const };
  }
  const data = await response.json();
  const route = Array.isArray(data?.routes) ? data.routes[0] : null;
  const line = route?.geometry?.coordinates;
  if (!Array.isArray(line)) {
    const msg =
      typeof data?.message === "string"
        ? data.message
        : typeof data?.code === "string"
          ? data.code
          : "Mapbox routing returned no geometry";
    return { error: msg as const };
  }
  return { line: line as Array<[number, number]> };
}

export async function POST(request: NextRequest) {
  try {
    const { prompt, currentRoute } = await request.json();

    if (!prompt || typeof prompt !== "string") {
      return NextResponse.json({ error: "Prompt is required" }, { status: 400 });
    }

    const allStops = await loadStops();
    if (allStops.length === 0) {
      return NextResponse.json({ error: "Failed to load stop data" }, { status: 500 });
    }

    const current = currentRoute as RouteContext | null;
    const addList = extractStopList(prompt);
    const removeList = extractRemoveList(prompt);

    let startLabel: string | null = null;
    let endLabel: string | null = null;
    const anchor = parseAnchors(prompt);
    if (anchor) {
      startLabel = anchor.start;
      endLabel = anchor.end;
    } else if (current?.stops && current.stops.length >= 2) {
      startLabel = current.stops[0]?.name ?? null;
      endLabel = current.stops[current.stops.length - 1]?.name ?? null;
    }

    if (!startLabel || !endLabel) {
      return NextResponse.json({ error: "Unable to determine start/end locations" }, { status: 400 });
    }

    const startResolved = await resolvePlace(allStops, startLabel);
    const endResolved = await resolvePlace(allStops, endLabel);
    if (!startResolved || "error" in startResolved || !endResolved || "error" in endResolved) {
      const details = [
        startResolved && "error" in startResolved ? `Start: ${startResolved.error}` : null,
        endResolved && "error" in endResolved ? `End: ${endResolved.error}` : null,
      ]
        .filter(Boolean)
        .join(" | ");
      return NextResponse.json(
        { error: "Unable to resolve start/end locations", details },
        { status: 400 }
      );
    }
    const start = startResolved as RouteStop;
    const end = endResolved as RouteStop;

    if (removeList.length > 0 || addList.length > 0) {
      // Edits are handled in the UI after Generate; keep start/end only.
    }

    const routeGeometry = await getRouteGeometry(start, end);
    let line: Array<[number, number]>;
    let routingNote: string | null = null;
    if ("error" in routeGeometry) {
      // Fallback to straight line so we can still pick corridor stops
      routingNote = routeGeometry.error;
      line = [
        [start.lng, start.lat],
        [end.lng, end.lat],
      ];
    } else {
      line = routeGeometry.line;
    }

    // Only return start/end. Stops are added via Generate in the UI.
    let combined = uniqStops([
      { ...start, reasoning: "Start point", matched: start.matched },
      { ...end, reasoning: "End point", matched: end.matched },
    ]);

    combined = combined.sort((a, b) => lineProjectProgress(line, a) - lineProjectProgress(line, b));

    return NextResponse.json({
      success: true,
      model: "deterministic",
      route: {
        name: `${start.name} → ${end.name}`,
        stops: combined,
        reasoning: routingNote
          ? `Mapbox routing failed (${routingNote}). Using straight-line corridor.`
          : "Start/end resolved. Use Generate to add corridor stops.",
      },
    });
  } catch (error) {
    console.error("Route agent error:", error);
    return NextResponse.json(
      {
        error: "Failed to generate route",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
