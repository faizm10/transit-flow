import type { CustomRoute } from "@/lib/gtfs";

/** Reduce an array to at most `maxPts` evenly-sampled points. */
function simplify<T>(arr: T[], maxPts: number): T[] {
  if (arr.length <= maxPts) return arr;
  const step = (arr.length - 1) / (maxPts - 1);
  return Array.from({ length: maxPts }, (_, i) => arr[Math.round(i * step)]);
}

/**
 * Returns a Mapbox Static Images API URL that renders the route as a
 * coloured line + stop markers on a streets basemap.
 *
 * Uses NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN — already public, safe in URLs.
 */
export function buildStaticMapUrl(
  route: CustomRoute,
  width = 600,
  height = 280
): string | null {
  const token = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;
  if (!token) return null;

  // Ensure color is a valid 6-char hex (simplestyle needs it without #)
  const rawColor = route.color ?? "#3b82f6";
  const hex = (rawColor.startsWith("#") ? rawColor.slice(1) : rawColor)
    .replace(/[^0-9a-fA-F]/g, "")
    .padEnd(6, "0")
    .slice(0, 6);

  // Prefer drawn geometry; fall back to stop lat/lon order
  const rawCoords: [number, number][] =
    Array.isArray(route.geometry) && route.geometry.length > 1
      ? route.geometry
      : (route.stops ?? []).map((s) => [s.lon, s.lat] as [number, number]);

  if (rawCoords.length < 2) return null;

  const coords = simplify(rawCoords, 25);
  const stops = route.stops ?? [];

  const color = `#${hex}`;

  const features: object[] = [
    // White casing so the line is legible on any background
    {
      type: "Feature",
      properties: { stroke: "#ffffff", "stroke-width": 8, "stroke-opacity": 0.9 },
      geometry: { type: "LineString", coordinates: coords },
    },
    // Coloured route line
    {
      type: "Feature",
      properties: { stroke: color, "stroke-width": 5, "stroke-opacity": 1 },
      geometry: { type: "LineString", coordinates: coords },
    },
    // Intermediate stop dots
    ...stops.slice(1, -1).map((s) => ({
      type: "Feature",
      properties: {
        "marker-color": "#ffffff",
        "marker-size": "small",
        stroke: color,
        "stroke-width": 2,
        fill: "#ffffff",
        "fill-opacity": 1,
      },
      geometry: { type: "Point", coordinates: [s.lon, s.lat] },
    })),
    // Endpoint circles (coloured fill)
    ...[stops[0], stops.length > 1 ? stops[stops.length - 1] : null]
      .filter(Boolean)
      .map((s) => ({
        type: "Feature",
        properties: {
          "marker-color": color,
          "marker-size": "medium",
          stroke: "#ffffff",
          "stroke-width": 2,
          fill: color,
          "fill-opacity": 1,
        },
        geometry: { type: "Point", coordinates: [s!.lon, s!.lat] },
      })),
  ];

  const geojson = JSON.stringify({ type: "FeatureCollection", features });
  const overlay = `geojson(${encodeURIComponent(geojson)})`;
  const size = `${width}x${height}@2x`;

  return (
    `https://api.mapbox.com/styles/v1/mapbox/streets-v12/static/` +
    `${overlay}/auto/${size}?padding=50,50,50,50&access_token=${token}`
  );
}
