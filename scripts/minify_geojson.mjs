#!/usr/bin/env node
/**
 * Shrink a GeoJSON line layer for map rendering.
 *
 * `variant_lines.geojson` is 59 MB and is registered as a Mapbox source in
 * components/Map.tsx, which means every visitor to /map downloads all of it
 * before seeing a single line. It is the dominant cost of the product's main
 * screen.
 *
 * Almost all of that is precision nobody can see:
 *
 *  - Coordinates carry six decimal places (~10 cm). A transit map does not
 *    resolve below a metre, and five decimals is a metre.
 *  - 832,207 points describe 587 lines — an average of 1,418 points each,
 *    far more than a screen can distinguish at regional zoom.
 *
 * So this rounds coordinates and runs Douglas–Peucker at a tolerance well
 * under what a viewer can perceive. The full-precision file stays on disk for
 * anything that needs exact geometry.
 *
 * Usage:
 *   node scripts/minify_geojson.mjs <input> <output> [toleranceDegrees]
 */

import { readFileSync, writeFileSync, statSync } from "node:fs";

/** ~5.5 m at these latitudes — below one screen pixel until deep zoom. */
const DEFAULT_TOLERANCE = 0.00005;
const COORD_DECIMALS = 5;

/**
 * Douglas–Peucker, iterative.
 *
 * Recursive is the textbook form and blows the stack here: the longest GO rail
 * shape is 4,600 points.
 */
function simplify(points, tolerance) {
  if (points.length <= 2) return points;

  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;

  const stack = [[0, points.length - 1]];
  while (stack.length > 0) {
    const [first, last] = stack.pop();
    if (last <= first + 1) continue;

    let maxDistance = 0;
    let index = first;
    for (let i = first + 1; i < last; i++) {
      const d = perpendicularDistance(points[i], points[first], points[last]);
      if (d > maxDistance) {
        maxDistance = d;
        index = i;
      }
    }

    if (maxDistance > tolerance) {
      keep[index] = 1;
      stack.push([first, index], [index, last]);
    }
  }

  const out = [];
  for (let i = 0; i < points.length; i++) if (keep[i]) out.push(points[i]);
  return out;
}

function perpendicularDistance(point, start, end) {
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  if (dx === 0 && dy === 0) {
    return Math.hypot(point[0] - start[0], point[1] - start[1]);
  }
  const numerator = Math.abs(
    dy * point[0] - dx * point[1] + end[0] * start[1] - end[1] * start[0]
  );
  return numerator / Math.hypot(dx, dy);
}

const round = (n) => Math.round(n * 10 ** COORD_DECIMALS) / 10 ** COORD_DECIMALS;

function processGeometry(geometry, tolerance, stats) {
  if (!geometry) return geometry;

  if (geometry.type === "LineString") {
    stats.before += geometry.coordinates.length;
    const simplified = simplify(geometry.coordinates, tolerance).map(([x, y]) => [
      round(x),
      round(y),
    ]);
    stats.after += simplified.length;
    return { ...geometry, coordinates: simplified };
  }

  if (geometry.type === "MultiLineString") {
    return {
      ...geometry,
      coordinates: geometry.coordinates.map((line) => {
        stats.before += line.length;
        const simplified = simplify(line, tolerance).map(([x, y]) => [
          round(x),
          round(y),
        ]);
        stats.after += simplified.length;
        return simplified;
      }),
    };
  }

  return geometry;
}

const [input, output, toleranceArg] = process.argv.slice(2);
if (!input || !output) {
  console.error(
    "usage: node scripts/minify_geojson.mjs <input> <output> [toleranceDegrees]"
  );
  process.exit(1);
}

const tolerance = toleranceArg ? Number(toleranceArg) : DEFAULT_TOLERANCE;
const stats = { before: 0, after: 0 };

const source = JSON.parse(readFileSync(input, "utf-8"));
const result = {
  type: "FeatureCollection",
  features: source.features.map((feature) => ({
    type: "Feature",
    // Properties are kept as-is: the map styles and filters read them.
    properties: feature.properties,
    geometry: processGeometry(feature.geometry, tolerance, stats),
  })),
};

// No pretty-printing. Indentation is roughly a third of the original file.
writeFileSync(output, JSON.stringify(result));

const before = statSync(input).size;
const after = statSync(output).size;
console.log(
  [
    `${input} -> ${output}`,
    `  size:        ${(before / 1e6).toFixed(1)} MB -> ${(after / 1e6).toFixed(1)} MB` +
      `  (${(before / after).toFixed(1)}x smaller)`,
    `  coordinates: ${stats.before.toLocaleString()} -> ${stats.after.toLocaleString()}` +
      `  (${((1 - stats.after / stats.before) * 100).toFixed(1)}% removed)`,
    `  tolerance:   ${tolerance} degrees (~${Math.round(tolerance * 111_000)} m)`,
  ].join("\n")
);
