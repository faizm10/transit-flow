/**
 * GeoJSON for drawing a journey comparison on the map.
 *
 * Lines carry `scenario` ("base" | "with") and `kind` ("ride" | "walk") so the
 * map can style the existing-network journey as a muted underlay and the
 * custom-network journey in service colours on top. Ride lines join stops
 * with straight segments — the planner has no shapes.
 */

import type { Journey } from "./types";

export type JourneyScenario = "base" | "with";

export function journeyOverlay(
  journeys: { scenario: JourneyScenario; journey: Journey | null }[],
): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = [];
  for (const { scenario, journey } of journeys) {
    if (!journey) continue;
    journey.legs.forEach((leg, i) => {
      if (leg.path.length < 2) return;
      features.push({
        type: "Feature",
        geometry: { type: "LineString", coordinates: leg.path },
        properties: {
          scenario,
          kind: leg.kind,
          color: leg.kind === "ride" ? leg.color : "#555555",
          label: leg.kind === "ride" ? leg.routeName : "Walk",
        },
      });
      // Endpoints and every change point.
      const points: [number, number, string][] = [];
      if (i === 0) points.push([...leg.path[0], leg.fromName]);
      points.push([...leg.path[leg.path.length - 1], leg.toName]);
      for (const [lon, lat, name] of points) {
        features.push({
          type: "Feature",
          geometry: { type: "Point", coordinates: [lon, lat] },
          properties: { scenario, kind: "point", name },
        });
      }
    });
  }
  return { type: "FeatureCollection", features };
}

/** [[west, south], [east, north]] around every coordinate, or null when empty. */
export function overlayBounds(fc: GeoJSON.FeatureCollection): [[number, number], [number, number]] | null {
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
  for (const f of fc.features) {
    const coords =
      f.geometry.type === "LineString" ? f.geometry.coordinates
        : f.geometry.type === "Point" ? [f.geometry.coordinates]
          : [];
    for (const [lon, lat] of coords) {
      w = Math.min(w, lon); e = Math.max(e, lon);
      s = Math.min(s, lat); n = Math.max(n, lat);
    }
  }
  return Number.isFinite(w) ? [[w, s], [e, n]] : null;
}
