export type RouteShortName = string;

export interface GOLineInfo {
  name: string;
  color: string;
  textColor: string;
  emoji: string;
}

/** Rail lines — keyed by route_short_name (official GO Transit brand colors) */
export const GO_RAIL_LINES: Record<string, GOLineInfo> = {
  BR: { name: "Barrie Line",         color: "#155ba0", textColor: "#fff", emoji: "🔵" },
  KI: { name: "Kitchener Line",      color: "#138336", textColor: "#fff", emoji: "🟢" },
  LE: { name: "Lakeshore East Line", color: "#ee2722", textColor: "#fff", emoji: "🔴" },
  LW: { name: "Lakeshore West Line", color: "#8b0a31", textColor: "#fff", emoji: "🟤" },
  MI: { name: "Milton Line",         color: "#dd521f", textColor: "#fff", emoji: "🟠" },
  RH: { name: "Richmond Hill Line",  color: "#27adea", textColor: "#fff", emoji: "🩵" },
  ST: { name: "Stouffville Line",    color: "#774111", textColor: "#fff", emoji: "🟤" },
  UP: { name: "UP Express",          color: "#231F20", textColor: "#fff", emoji: "✈️" },
};

/** Default bus route color */
export const BUS_COLOR = "#0066CC";
export const BUS_COLOR_LIGHT = "#E3F0FF";

export function colorForRoute(shortName: string, routeType?: number): string {
  if (GO_RAIL_LINES[shortName]) return GO_RAIL_LINES[shortName].color;
  if (routeType === 2) return "#007A33"; // rail fallback
  return BUS_COLOR;
}

export function isRailRoute(shortName: string, routeType?: number): boolean {
  return shortName in GO_RAIL_LINES || routeType === 2;
}

/** 8-color palette for user-created custom routes */
export const CUSTOM_ROUTE_COLORS = [
  "#EF4444", "#F97316", "#EAB308", "#22C55E",
  "#06B6D4", "#3B82F6", "#8B5CF6", "#EC4899",
];

export function getCustomRouteColor(index: number): string {
  return CUSTOM_ROUTE_COLORS[index % CUSTOM_ROUTE_COLORS.length];
}
