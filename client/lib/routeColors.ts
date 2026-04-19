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
export const PINK_BUS_COLOR = "#ec4899";
export const PURPLE_BUS_COLOR = "#a855f7";

const BUS_ROUTE_LINE_COLORS: Record<string, string> = {
  "11": GO_RAIL_LINES.LW.color,
  "12": GO_RAIL_LINES.LW.color,
  "16": GO_RAIL_LINES.LW.color,
  "17": GO_RAIL_LINES.MI.color,
  "18": GO_RAIL_LINES.LW.color,
  "21": GO_RAIL_LINES.MI.color,
  "22": GO_RAIL_LINES.MI.color,
  "25": GO_RAIL_LINES.MI.color,
  "27": GO_RAIL_LINES.MI.color,
  "29": GO_RAIL_LINES.KI.color,
  "30": GO_RAIL_LINES.KI.color,
  "40": PINK_BUS_COLOR,
  "41": PINK_BUS_COLOR,
  "47": PINK_BUS_COLOR,
  "48": PINK_BUS_COLOR,
  "52": PURPLE_BUS_COLOR,
  "56": PURPLE_BUS_COLOR,
  "61": GO_RAIL_LINES.RH.color,
  "65": GO_RAIL_LINES.BR.color,
  "68": GO_RAIL_LINES.BR.color,
  "88": GO_RAIL_LINES.LE.color,
  "90": GO_RAIL_LINES.LE.color,
  "92": GO_RAIL_LINES.LE.color,
  "94": PINK_BUS_COLOR,
  "96": GO_RAIL_LINES.LE.color,
};

function busSeriesLineColor(shortName: string): string | null {
  const routeNumber = Number(shortName.trim().match(/^\d+/)?.[0]);
  if (!Number.isFinite(routeNumber)) return null;

  const exactColor = BUS_ROUTE_LINE_COLORS[String(routeNumber).padStart(2, "0")] ?? BUS_ROUTE_LINE_COLORS[String(routeNumber)];
  if (exactColor) return exactColor;

  if (routeNumber >= 30 && routeNumber <= 39) return GO_RAIL_LINES.KI.color;
  if (routeNumber >= 70 && routeNumber <= 79) return GO_RAIL_LINES.ST.color;

  return null;
}

export function colorForRoute(shortName: string, routeType?: number): string {
  if (GO_RAIL_LINES[shortName]) return GO_RAIL_LINES[shortName].color;
  if (routeType !== 2) {
    const busColor = busSeriesLineColor(shortName);
    if (busColor) return busColor;
  }
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
