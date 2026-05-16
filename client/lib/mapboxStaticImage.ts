import type { CustomRoute } from "@/lib/gtfs";

/** Reduce an array to at most `maxPts` evenly-sampled points. */
function simplify<T>(arr: T[], maxPts: number): T[] {
  if (arr.length <= maxPts) return arr;
  const step = (arr.length - 1) / (maxPts - 1);
  return Array.from({ length: maxPts }, (_, i) => arr[Math.round(i * step)]);
}

/**
 * Returns a Mapbox Static Images API URL that renders the route as a
 * coloured line on a streets basemap, or null if the token is missing.
 *
 * Safe to call server-side; uses NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN which is
 * already public and safe to embed in URLs returned to the client.
 */
export function buildStaticMapUrl(
  route: CustomRoute,
  width = 600,
  height = 280
): string | null {
  const token = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;
  if (!token) return null;

  const color = route.color ?? "#3b82f6";

  // Prefer drawn geometry; fall back to stop positions
  const rawCoords: [number, number][] =
    Array.isArray(route.geometry) && route.geometry.length > 1
      ? route.geometry
      : (route.stops ?? []).map((s) => [s.lon, s.lat] as [number, number]);

  if (rawCoords.length < 2) return null;

  const coords = simplify(rawCoords, 30);

  // Strip "#" from hex — Mapbox uses bare hex in GeoJSON properties
  const hexColor = color.startsWith("#") ? color.slice(1) : color;

  const geojson = JSON.stringify({
    type: "FeatureCollection",
    features: [
      // Route line with casing
      {
        type: "Feature",
        properties: {
          stroke: "ffffff",
          "stroke-width": 7,
          "stroke-opacity": 0.7,
        },
        geometry: { type: "LineString", coordinates: coords },
      },
      // Route line
      {
        type: "Feature",
        properties: {
          stroke: hexColor,
          "stroke-width": 4,
          "stroke-opacity": 1,
        },
        geometry: { type: "LineString", coordinates: coords },
      },
    ],
  });

  const overlay = `geojson(${encodeURIComponent(geojson)})`;
  const size = `${width}x${height}@2x`;

  return (
    `https://api.mapbox.com/styles/v1/mapbox/streets-v12/static/` +
    `${overlay}/auto/${size}?padding=40,40,40,40&access_token=${token}`
  );
}
