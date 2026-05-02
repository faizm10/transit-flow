/** Equirectangular projection to local metres (fine for GTA-scale polylines). */
function coordsToMeterPoints(coords: [number, number][]): [number, number][] {
  if (coords.length === 0) return [];
  const latRefDeg =
    coords.reduce((s, c) => s + c[1], 0) / coords.length;
  const R = 6371000;
  const cosPhi = Math.cos((latRefDeg * Math.PI) / 180);
  const mx = R * cosPhi * (Math.PI / 180);
  const my = R * (Math.PI / 180);
  const ox = coords[0]![0];
  const oy = coords[0]![1];
  return coords.map((c): [number, number] => [
    (c[0] - ox) * mx,
    (c[1] - oy) * my,
  ]);
}

/** Perpendicular distance from P to infinite line through A–B, clamped to the segment AB. */
function perpDistToSegment(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const vx = bx - ax;
  const vy = by - ay;
  const wx = px - ax;
  const wy = py - ay;
  const len2 = vx * vx + vy * vy;
  if (len2 <= 1e-18) return Math.hypot(px - ax, py - ay);
  let t = (wx * vx + wy * vy) / len2;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + t * vx;
  const cy = ay + t * vy;
  return Math.hypot(px - cx, py - cy);
}

function douglasPeuckerRetain(
  pts: [number, number][],
  epsilonM: number,
  startIdx: number,
  endIdx: number,
  out: Set<number>,
): void {
  out.add(startIdx);
  out.add(endIdx);
  if (endIdx - startIdx <= 1) return;

  let maxD = -1;
  let argMax = startIdx + 1;
  const ax = pts[startIdx]![0];
  const ay = pts[startIdx]![1];
  const bx = pts[endIdx]![0];
  const by = pts[endIdx]![1];

  for (let i = startIdx + 1; i < endIdx; i++) {
    const p = pts[i]!;
    const d = perpDistToSegment(p[0], p[1], ax, ay, bx, by);
    if (d > maxD) {
      maxD = d;
      argMax = i;
    }
  }

  if (maxD > epsilonM) {
    douglasPeuckerRetain(pts, epsilonM, startIdx, argMax, out);
    douglasPeuckerRetain(pts, epsilonM, argMax, endIdx, out);
  }
}

/**
 * Reduces vertices so Mapbox Draw shows one handle roughly per bend
 * (Douglas–Peucker in approximate metres). Keeps shape for typical road corridors.
 *
 * Applied when entering vertex-edit mode, not during freehand draw.
 */
export function simplifyPolylineForVertexEdit(
  coords: [number, number][],
  toleranceM = 115,
): [number, number][] {
  const n = coords.length;
  if (n <= 2) return coords.slice();

  const xy = coordsToMeterPoints(coords);
  const keep = new Set<number>();
  douglasPeuckerRetain(xy, toleranceM, 0, n - 1, keep);

  const sorted = [...keep].sort((a, b) => a - b);
  const simplified = sorted.map((i) => coords[i]);
  return simplified.length >= 2 ? simplified : coords.slice(0, 2);
}
