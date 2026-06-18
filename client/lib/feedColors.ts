/**
 * Color resolution for city GTFS feeds.
 * Uses the feed's own route_color from routes.txt when valid,
 * otherwise falls back to a deterministic palette.
 */

import { CUSTOM_ROUTE_COLORS } from "@/lib/routeColors";

export function colorForCityRoute(
  routeColor: string | undefined | null,
  routeShortName: string,
  feedId: string,
): string {
  if (routeColor && /^[0-9A-Fa-f]{6}$/.test(routeColor)) {
    return `#${routeColor}`;
  }
  // Deterministic fallback: hash feedId+shortName → palette index
  const seed = feedId + routeShortName;
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  const palette = CUSTOM_ROUTE_COLORS;
  return palette[hash % palette.length];
}
