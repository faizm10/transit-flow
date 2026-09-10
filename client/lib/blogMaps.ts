/**
 * Mapbox Static Images API URLs for blog illustrations — a corridor drawn as a
 * line with labelled endpoints on a clean basemap. Uses the public
 * NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN (safe in URLs).
 */

type LngLat = [number, number];

export interface Corridor {
  /** Ordered path points, [lng, lat]. First and last are the endpoints. */
  path: LngLat[];
  fromLabel: string;
  toLabel: string;
}

export function corridorImageUrl(
  corridor: Corridor,
  {
    width = 1280,
    height = 620,
    accent = "0b7a3d",
    theme = "light",
  }: {
    width?: number;
    height?: number;
    accent?: string;
    theme?: "light" | "dark";
  } = {}
): string | null {
  const token = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;
  if (!token || corridor.path.length < 2) return null;

  const style = theme === "dark" ? "dark-v11" : "light-v11";
  const casingColor = theme === "dark" ? "#0c1310" : "#ffffff";

  const line = {
    type: "Feature" as const,
    properties: { stroke: `#${accent}`, "stroke-width": 4, "stroke-opacity": 0.95 },
    geometry: { type: "LineString" as const, coordinates: corridor.path },
  };
  const casing = {
    type: "Feature" as const,
    properties: { stroke: casingColor, "stroke-width": 8, "stroke-opacity": 0.9 },
    geometry: { type: "LineString" as const, coordinates: corridor.path },
  };

  const a = corridor.path[0];
  const b = corridor.path[corridor.path.length - 1];
  const pin = (p: LngLat, label: "a" | "b") =>
    `pin-l-${label}+${accent}(${p[0].toFixed(5)},${p[1].toFixed(5)})`;

  const overlay = [
    `geojson(${encodeURIComponent(JSON.stringify(casing))})`,
    `geojson(${encodeURIComponent(JSON.stringify(line))})`,
    pin(a, "a"),
    pin(b, "b"),
  ].join(",");

  return (
    `https://api.mapbox.com/styles/v1/mapbox/${style}/static/${overlay}` +
    `/auto/${width}x${height}@2x?padding=64&access_token=${token}`
  );
}
