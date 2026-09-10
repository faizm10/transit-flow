import type mapboxgl from "mapbox-gl";
import { GO_RAIL_LINES } from "@/lib/routeColors";
import type { ServiceAlert } from "@/lib/serviceUpdates";

/**
 * On-map overlay for GO service alerts: a pulsing colored glow on affected
 * rail lines plus a warning badge at each line's centre. All three layers
 * share the existing "go-routes" GeoJSON source and are filtered by
 * route_short_name, so there is no extra geometry to load.
 */

export const ALERT_GLOW_LAYER = "go-routes-alert-glow";
export const ALERT_BADGE_LAYER = "go-routes-alert-badge";
export const ALERT_LAYER_IDS = [ALERT_GLOW_LAYER, ALERT_BADGE_LAYER];

const RAIL_CODES = ["BR", "KI", "LE", "LW", "MI", "RH", "ST", "UP"] as const;
export type RailCode = (typeof RAIL_CODES)[number];

const DELAY_COLOR = "#f59e0b"; // amber-500
const CANCEL_COLOR = "#ef4444"; // red-500
const NOTICE_COLOR = "#94a3b8"; // slate-400

export function isRailCode(code: string): code is RailCode {
  return (RAIL_CODES as readonly string[]).includes(code);
}

export interface RailAlertIndex {
  /** rail code → alerts on that line, worst-severity first */
  byCode: Map<RailCode, ServiceAlert[]>;
  /** rail code → the color for that line's badge (and glow, where it has one) */
  colorByCode: Map<RailCode, string>;
  /** every rail code with at least one alert (all get a badge) */
  codes: RailCode[];
  /** codes with a delay or cancellation — these get the pulsing glow */
  glowCodes: RailCode[];
}

/** Group alerts by affected rail line and pick each line's worst severity. */
export function indexRailAlerts(alerts: ServiceAlert[]): RailAlertIndex {
  const byCode = new Map<RailCode, ServiceAlert[]>();

  for (const alert of alerts) {
    for (const route of alert.routes) {
      if (!isRailCode(route)) continue;
      const list = byCode.get(route) ?? [];
      list.push(alert);
      byCode.set(route, list);
    }
  }

  const rank: Record<ServiceAlert["type"], number> = {
    cancellation: 0,
    delay: 1,
    information: 2,
    other: 3,
  };

  const colorByCode = new Map<RailCode, string>();
  const glowCodes: RailCode[] = [];
  for (const [code, list] of byCode) {
    list.sort((a, b) => rank[a.type] - rank[b.type]);
    const hasCancel = list.some((a) => a.type === "cancellation");
    const hasDelay = list.some((a) => a.type === "delay");
    colorByCode.set(code, hasCancel ? CANCEL_COLOR : hasDelay ? DELAY_COLOR : NOTICE_COLOR);
    if (hasCancel || hasDelay) glowCodes.push(code);
  }

  return { byCode, colorByCode, codes: [...byCode.keys()], glowCodes };
}

/** A round badge (RGBA), one per accent color, added via map.addImage. */
function makeBadgeImage(color: string, glyph: string, size = 44): ImageData {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const c = size / 2;

  // white outer disc for contrast against the line
  ctx.beginPath();
  ctx.arc(c, c, c - 2, 0, Math.PI * 2);
  ctx.fillStyle = "#ffffff";
  ctx.fill();

  // colored inner disc
  ctx.beginPath();
  ctx.arc(c, c, c - 5, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();

  ctx.fillStyle = "#ffffff";
  ctx.font = `700 ${size * 0.58}px system-ui, -apple-system, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(glyph, c, c + size * 0.02);

  return ctx.getImageData(0, 0, size, size);
}

export const BADGE_IMAGE_IDS: Record<string, string> = {
  [DELAY_COLOR]: "alert-badge-delay",
  [CANCEL_COLOR]: "alert-badge-cancel",
  [NOTICE_COLOR]: "alert-badge-notice",
};

const BADGE_GLYPHS: Record<string, string> = {
  [DELAY_COLOR]: "!",
  [CANCEL_COLOR]: "!",
  [NOTICE_COLOR]: "i",
};

/** Add the alert overlay layers. Call once, inside map.on("load"). */
export function addServiceAlertLayers(map: mapboxgl.Map): void {
  for (const [color, id] of Object.entries(BADGE_IMAGE_IDS)) {
    if (!map.hasImage(id)) {
      map.addImage(id, makeBadgeImage(color, BADGE_GLYPHS[color] ?? "!"), {
        pixelRatio: 2,
      });
    }
  }

  const hiddenFilter: mapboxgl.FilterSpecification = [
    "in",
    ["get", "route_short_name"],
    ["literal", []],
  ];

  // Pulsing glow directly above the normal route line.
  map.addLayer(
    {
      id: ALERT_GLOW_LAYER,
      type: "line",
      source: "go-routes",
      filter: hiddenFilter,
      layout: { "line-join": "round", "line-cap": "round", visibility: "none" },
      paint: {
        "line-color": ["coalesce", ["get", "__alertColor"], DELAY_COLOR],
        "line-width": ["interpolate", ["linear"], ["zoom"], 8, 8, 13, 18],
        "line-blur": 3,
        "line-opacity": 0.4,
      },
    },
    "go-routes-hit"
  );

  // One warning badge at the centre of each affected line. Busiest variant wins
  // placement so a line shows a single badge, not one per direction/variant.
  map.addLayer({
    id: ALERT_BADGE_LAYER,
    type: "symbol",
    source: "go-routes",
    filter: hiddenFilter,
    layout: {
      visibility: "none",
      "symbol-placement": "line-center",
      "icon-image": ["coalesce", ["get", "__alertBadge"], BADGE_IMAGE_IDS[DELAY_COLOR]],
      "icon-size": ["interpolate", ["linear"], ["zoom"], 8, 0.4, 13, 0.72],
      "icon-allow-overlap": false,
      "icon-ignore-placement": false,
      "symbol-sort-key": ["-", 0, ["to-number", ["get", "trip_count"], 0]],
    },
  });
}

/**
 * Show / hide / retarget the overlay.
 *
 * The go-routes features have no alert data of their own, so we can't drive
 * per-line color from a `["get", ...]`. Instead we inject a `match` on
 * route_short_name into the paint/layout expressions each time the alert set
 * changes.
 */
export function applyServiceAlerts(
  map: mapboxgl.Map,
  index: RailAlertIndex | null
): void {
  const on = !!index && index.codes.length > 0;

  for (const id of ALERT_LAYER_IDS) {
    if (map.getLayer(id)) {
      map.setLayoutProperty(id, "visibility", on ? "visible" : "none");
    }
  }
  if (!on || !index) return;

  const codeFilter = (codes: string[]): mapboxgl.FilterSpecification => [
    "in",
    ["get", "route_short_name"],
    ["literal", codes],
  ];

  // route_short_name → color / badge, as flat `match` args
  const colorMatch: (string | string[])[] = ["match", ["get", "route_short_name"]];
  const badgeMatch: (string | string[])[] = ["match", ["get", "route_short_name"]];
  for (const code of index.codes) {
    const color = index.colorByCode.get(code) ?? NOTICE_COLOR;
    colorMatch.push([code], color);
    badgeMatch.push([code], BADGE_IMAGE_IDS[color] ?? BADGE_IMAGE_IDS[NOTICE_COLOR]);
  }
  colorMatch.push(NOTICE_COLOR);
  badgeMatch.push(BADGE_IMAGE_IDS[NOTICE_COLOR]);

  // Glow only on lines with a real disruption; badges on every alerted line.
  if (map.getLayer(ALERT_GLOW_LAYER)) {
    map.setFilter(ALERT_GLOW_LAYER, codeFilter(index.glowCodes));
    map.setLayoutProperty(
      ALERT_GLOW_LAYER,
      "visibility",
      index.glowCodes.length > 0 ? "visible" : "none"
    );
    map.setPaintProperty(
      ALERT_GLOW_LAYER,
      "line-color",
      colorMatch as unknown as mapboxgl.ExpressionSpecification
    );
  }
  if (map.getLayer(ALERT_BADGE_LAYER)) {
    // One badge per line, not one per variant: keep only the busiest variant
    // for each alerted code. Falls back to a plain code filter for any code
    // whose geometry hasn't loaded into a tile yet.
    const repVariants = pickRepresentativeVariants(map, index.codes);
    map.setFilter(
      ALERT_BADGE_LAYER,
      repVariants
        ? ([
            "any",
            ["in", ["get", "variant_id"], ["literal", repVariants.variantIds]],
            ["in", ["get", "route_short_name"], ["literal", repVariants.missingCodes]],
          ] as mapboxgl.FilterSpecification)
        : codeFilter(index.codes)
    );
    map.setLayoutProperty(
      ALERT_BADGE_LAYER,
      "icon-image",
      badgeMatch as unknown as mapboxgl.ExpressionSpecification
    );
  }
}

/** Busiest loaded variant_id per rail code, so each line shows a single badge. */
function pickRepresentativeVariants(
  map: mapboxgl.Map,
  codes: string[]
): { variantIds: string[]; missingCodes: string[] } | null {
  let feats: mapboxgl.GeoJSONFeature[];
  try {
    feats = map.querySourceFeatures("go-routes", {
      filter: ["in", ["get", "route_short_name"], ["literal", codes]],
    });
  } catch {
    return null;
  }
  if (feats.length === 0) return null;

  const best = new Map<string, { variantId: string; trips: number }>();
  for (const f of feats) {
    const code = f.properties?.route_short_name as string | undefined;
    const variantId = f.properties?.variant_id as string | undefined;
    if (!code || !variantId) continue;
    const trips = Number(f.properties?.trip_count ?? 0);
    const cur = best.get(code);
    if (!cur || trips > cur.trips) best.set(code, { variantId, trips });
  }

  return {
    variantIds: [...best.values()].map((v) => v.variantId),
    missingCodes: codes.filter((c) => !best.has(c)),
  };
}

/** Human line name for a rail code, e.g. "Kitchener Line". */
export function railLineName(code: string): string {
  return GO_RAIL_LINES[code]?.name ?? code;
}
