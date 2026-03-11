export type LatLng = { lat: number; lng: number };

function toRad(d: number) {
  return (d * Math.PI) / 180;
}

export function haversineKm(a: LatLng, b: LatLng): number {
  const R = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// Distance from point P to segment A-B; returns { distKm, t } where t is 0–1 along segment
export function pointToSegmentKm(
  p: LatLng,
  a: LatLng,
  b: LatLng
): { distKm: number; t: number } {
  const latRef = toRad((a.lat + b.lat) / 2);
  const cosLat = Math.cos(latRef);
  // Project into flat space (degrees scaled by cosLat for lng)
  const ax = a.lng * cosLat,
    ay = a.lat;
  const bx = b.lng * cosLat,
    by = b.lat;
  const px = p.lng * cosLat,
    py = p.lat;
  const abx = bx - ax,
    aby = by - ay;
  const ab2 = abx * abx + aby * aby;
  const t =
    ab2 === 0
      ? 0
      : Math.max(0, Math.min(1, ((px - ax) * abx + (py - ay) * aby) / ab2));
  const cx = ax + abx * t;
  const cy = ay + aby * t;
  const distDeg = Math.sqrt((px - cx) ** 2 + (py - cy) ** 2);
  return { distKm: distDeg * 111.32, t };
}

export type StopCandidate = {
  id: string;
  name: string;
  lat: number;
  lng: number;
};

/**
 * Snaps GO Transit stops to a drawn LineString.
 * Returns stops within maxDistKm of the line, sorted by position along the line.
 */
export function snapStopsToLine(
  lineCoords: [number, number][], // [lng, lat] pairs (GeoJSON order)
  goStops: StopCandidate[],
  maxDistKm = 0.5
): Array<StopCandidate & { alongKm: number }> {
  const coords = lineCoords.map(([lng, lat]) => ({ lng, lat }));

  // Cumulative distances along the line
  const cumulative: number[] = [0];
  for (let i = 1; i < coords.length; i++) {
    cumulative.push(cumulative[i - 1] + haversineKm(coords[i - 1], coords[i]));
  }

  const results: Array<StopCandidate & { alongKm: number }> = [];

  for (const stop of goStops) {
    let bestDistKm = Infinity;
    let bestAlong = 0;

    for (let i = 0; i < coords.length - 1; i++) {
      const { distKm, t } = pointToSegmentKm(stop, coords[i], coords[i + 1]);
      const segLen = haversineKm(coords[i], coords[i + 1]);
      const along = cumulative[i] + segLen * t;
      if (distKm < bestDistKm) {
        bestDistKm = distKm;
        bestAlong = along;
      }
    }

    if (bestDistKm <= maxDistKm) {
      results.push({ ...stop, alongKm: bestAlong });
    }
  }

  // Sort by position along the line
  return results.sort((a, b) => a.alongKm - b.alongKm);
}
