import type { DirectionsResult } from "@/lib/mapboxDirections";
import type { Stop } from "@/hooks/useRouteBuilder";

export type RouteGeometrySource = "road" | "rail-network" | "manual-rail";

export type RailRouteResult = DirectionsResult & {
  geometrySource: Extract<RouteGeometrySource, "rail-network" | "manual-rail">;
};

type GraphNode = {
  id: string;
  lng: number;
  lat: number;
  neighbors: Map<string, number>;
};

type RailGraph = {
  nodes: Map<string, GraphNode>;
};

const COORD_PRECISION = 4;
const MAX_SNAP_DISTANCE_KM = 3.5;
const DEFAULT_TRAIN_SPEED_KMH = 70;

let railGraphPromise: Promise<RailGraph> | null = null;

function toRad(value: number): number {
  return (value * Math.PI) / 180;
}

function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const radiusKm = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * radiusKm * Math.asin(Math.sqrt(h));
}

function coordKey(lng: number, lat: number): string {
  return `${lng.toFixed(COORD_PRECISION)},${lat.toFixed(COORD_PRECISION)}`;
}

function lineDistanceKm(coords: [number, number][]): number {
  let total = 0;
  for (let index = 0; index < coords.length - 1; index += 1) {
    const [lngA, latA] = coords[index];
    const [lngB, latB] = coords[index + 1];
    total += haversineKm({ lng: lngA, lat: latA }, { lng: lngB, lat: latB });
  }
  return total;
}

function estimateDurationSeconds(distanceKm: number): number {
  return Math.max(60, Math.round((distanceKm / DEFAULT_TRAIN_SPEED_KMH) * 3600));
}

function getOrCreateNode(graph: RailGraph, lng: number, lat: number): GraphNode {
  const key = coordKey(lng, lat);
  const existing = graph.nodes.get(key);
  if (existing) return existing;
  const next: GraphNode = { id: key, lng, lat, neighbors: new Map() };
  graph.nodes.set(key, next);
  return next;
}

function addEdge(graph: RailGraph, from: [number, number], to: [number, number]) {
  const fromNode = getOrCreateNode(graph, from[0], from[1]);
  const toNode = getOrCreateNode(graph, to[0], to[1]);
  const distanceKm = haversineKm(
    { lng: fromNode.lng, lat: fromNode.lat },
    { lng: toNode.lng, lat: toNode.lat },
  );

  const existingForward = fromNode.neighbors.get(toNode.id);
  if (existingForward == null || distanceKm < existingForward) {
    fromNode.neighbors.set(toNode.id, distanceKm);
  }
  const existingBackward = toNode.neighbors.get(fromNode.id);
  if (existingBackward == null || distanceKm < existingBackward) {
    toNode.neighbors.set(fromNode.id, distanceKm);
  }
}

function appendLine(graph: RailGraph, coords: [number, number][]) {
  if (coords.length < 2) return;
  for (let index = 0; index < coords.length - 1; index += 1) {
    addEdge(graph, coords[index], coords[index + 1]);
  }
}

async function loadGoRailLines(signal?: AbortSignal): Promise<[number, number][][]> {
  const response = await fetch("/gotransit/derived/variant_lines.geojson", { signal });
  if (!response.ok) {
    throw new Error("Failed to load GO train shapes");
  }
  const data = (await response.json()) as GeoJSON.FeatureCollection;
  return (data.features ?? [])
    .filter((feature) => String(feature.properties?.route_type ?? "") === "2")
    .map((feature) => feature.geometry)
    .filter((geometry): geometry is GeoJSON.LineString => geometry?.type === "LineString")
    .map((geometry) => geometry.coordinates as [number, number][]);
}

async function loadUpxRailLines(signal?: AbortSignal): Promise<[number, number][][]> {
  const response = await fetch("/api/union-pearson", { signal });
  if (!response.ok) {
    throw new Error("Failed to load UP Express shapes");
  }
  const data = (await response.json()) as GeoJSON.FeatureCollection;
  return (data.features ?? [])
    .map((feature) => feature.geometry)
    .filter((geometry): geometry is GeoJSON.LineString => geometry?.type === "LineString")
    .map((geometry) => geometry.coordinates as [number, number][]);
}

async function buildRailGraph(signal?: AbortSignal): Promise<RailGraph> {
  const graph: RailGraph = { nodes: new Map() };
  const [goLines, upxLines] = await Promise.all([
    loadGoRailLines(signal),
    loadUpxRailLines(signal).catch(() => []),
  ]);

  [...goLines, ...upxLines].forEach((coords) => appendLine(graph, coords));
  return graph;
}

async function getRailGraph(signal?: AbortSignal): Promise<RailGraph> {
  if (!railGraphPromise) {
    railGraphPromise = buildRailGraph(signal).catch((error) => {
      railGraphPromise = null;
      throw error;
    });
  }
  return railGraphPromise;
}

function snapStopToNode(stop: Stop, graph: RailGraph): GraphNode | null {
  let bestNode: GraphNode | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const node of graph.nodes.values()) {
    const distance = haversineKm(stop, node);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestNode = node;
    }
  }

  if (!bestNode || bestDistance > MAX_SNAP_DISTANCE_KM) {
    return null;
  }

  return bestNode;
}

function buildPathCoords(
  graph: RailGraph,
  pathIds: string[],
  startStop: Stop,
  endStop: Stop,
): [number, number][] {
  const coords: [number, number][] = [[startStop.lng, startStop.lat]];

  pathIds.forEach((id) => {
    const node = graph.nodes.get(id);
    if (!node) return;
    const nextCoord: [number, number] = [node.lng, node.lat];
    const last = coords[coords.length - 1];
    if (!last || last[0] !== nextCoord[0] || last[1] !== nextCoord[1]) {
      coords.push(nextCoord);
    }
  });

  const endCoord: [number, number] = [endStop.lng, endStop.lat];
  const last = coords[coords.length - 1];
  if (!last || last[0] !== endCoord[0] || last[1] !== endCoord[1]) {
    coords.push(endCoord);
  }

  return coords;
}

function findShortestPath(graph: RailGraph, startId: string, endId: string): string[] | null {
  if (startId === endId) return [startId];

  const distances = new Map<string, number>();
  const previous = new Map<string, string | null>();
  const unvisited = new Set<string>();

  graph.nodes.forEach((_, id) => {
    distances.set(id, id === startId ? 0 : Number.POSITIVE_INFINITY);
    previous.set(id, null);
    unvisited.add(id);
  });

  while (unvisited.size > 0) {
    let currentId: string | null = null;
    let currentDistance = Number.POSITIVE_INFINITY;

    unvisited.forEach((id) => {
      const distance = distances.get(id) ?? Number.POSITIVE_INFINITY;
      if (distance < currentDistance) {
        currentDistance = distance;
        currentId = id;
      }
    });

    if (!currentId || currentDistance === Number.POSITIVE_INFINITY) {
      return null;
    }

    if (currentId === endId) {
      const path: string[] = [];
      let cursor: string | null = endId;
      while (cursor) {
        path.unshift(cursor);
        cursor = previous.get(cursor) ?? null;
      }
      return path;
    }

    unvisited.delete(currentId);
    const node = graph.nodes.get(currentId);
    if (!node) continue;

    node.neighbors.forEach((weight, neighborId) => {
      if (!unvisited.has(neighborId)) return;
      const alt = currentDistance + weight;
      if (alt < (distances.get(neighborId) ?? Number.POSITIVE_INFINITY)) {
        distances.set(neighborId, alt);
        previous.set(neighborId, currentId);
      }
    });
  }

  return null;
}

type ProjectedPoint = {
  alongKm: number;
};

function projectPointToLine(stop: Stop, coords: [number, number][]): ProjectedPoint {
  if (coords.length < 2) return { alongKm: 0 };

  let bestDistance = Number.POSITIVE_INFINITY;
  let bestAlongKm = 0;
  let cumulativeKm = 0;

  for (let index = 0; index < coords.length - 1; index += 1) {
    const [lngA, latA] = coords[index];
    const [lngB, latB] = coords[index + 1];
    const segLengthKm = haversineKm({ lng: lngA, lat: latA }, { lng: lngB, lat: latB });
    const latRad = toRad((latA + latB) / 2);
    const ax = lngA * Math.cos(latRad);
    const ay = latA;
    const bx = lngB * Math.cos(latRad);
    const by = latB;
    const px = stop.lng * Math.cos(latRad);
    const py = stop.lat;
    const abx = bx - ax;
    const aby = by - ay;
    const apx = px - ax;
    const apy = py - ay;
    const ab2 = abx * abx + aby * aby;
    const t = ab2 === 0 ? 0 : Math.max(0, Math.min(1, (apx * abx + apy * aby) / ab2));
    const cx = ax + abx * t;
    const cy = ay + aby * t;
    const distanceKm = Math.sqrt((px - cx) ** 2 + (py - cy) ** 2) * 111.32;

    if (distanceKm < bestDistance) {
      bestDistance = distanceKm;
      bestAlongKm = cumulativeKm + segLengthKm * t;
    }

    cumulativeKm += segLengthKm;
  }

  return { alongKm: bestAlongKm };
}

function buildLegDurations(stops: Stop[], coords: [number, number][]): number[] {
  if (stops.length < 2) return [];

  const totalDistanceKm = lineDistanceKm(coords);
  if (totalDistanceKm <= 0) {
    return new Array(stops.length - 1).fill(60);
  }

  const projected = stops.map((stop) => projectPointToLine(stop, coords).alongKm);
  const monotonic = projected.map((along, index) => {
    if (index === 0) return along;
    return Math.max(projected[index - 1] ?? 0, along);
  });

  const durations: number[] = [];
  for (let index = 0; index < monotonic.length - 1; index += 1) {
    const legKm = Math.max(0.3, monotonic[index + 1] - monotonic[index]);
    durations.push(estimateDurationSeconds(legKm));
  }

  return durations;
}

export function buildManualRailRoute(
  stops: Stop[],
  geometry: GeoJSON.LineString,
): RailRouteResult {
  const coords = (geometry.coordinates ?? []) as [number, number][];
  const totalDistanceKm = lineDistanceKm(coords);
  const legDurations = buildLegDurations(stops, coords);
  const duration =
    legDurations.length > 0
      ? legDurations.reduce((sum, value) => sum + value, 0)
      : estimateDurationSeconds(totalDistanceKm);

  return {
    geometry,
    distance: totalDistanceKm * 1000,
    duration,
    legDurations: legDurations.length > 0 ? legDurations : [duration],
    geometrySource: "manual-rail",
  };
}

export async function fetchRailRoute(
  stops: Stop[],
  signal?: AbortSignal,
): Promise<{ ok: true; data: RailRouteResult } | { ok: false; error: { message: string } }> {
  if (stops.length < 2) {
    return { ok: false, error: { message: "At least 2 stops required" } };
  }

  try {
    const graph = await getRailGraph(signal);
    const snapped = stops.map((stop) => snapStopToNode(stop, graph));

    if (snapped.some((node) => !node)) {
      return {
        ok: false,
        error: { message: "No tracked rail path found — draw a rail corridor to continue." },
      };
    }

    const stitchedCoords: [number, number][] = [];
    const legDurations: number[] = [];

    for (let index = 0; index < stops.length - 1; index += 1) {
      const startStop = stops[index];
      const endStop = stops[index + 1];
      const startNode = snapped[index];
      const endNode = snapped[index + 1];
      if (!startNode || !endNode) {
        return {
          ok: false,
          error: { message: "No tracked rail path found — draw a rail corridor to continue." },
        };
      }

      const pathIds = findShortestPath(graph, startNode.id, endNode.id);
      if (!pathIds) {
        return {
          ok: false,
          error: { message: "No tracked rail path found — draw a rail corridor to continue." },
        };
      }

      const legCoords = buildPathCoords(graph, pathIds, startStop, endStop);
      const legDistanceKm = lineDistanceKm(legCoords);
      legDurations.push(estimateDurationSeconds(legDistanceKm));

      legCoords.forEach((coord) => {
        const last = stitchedCoords[stitchedCoords.length - 1];
        if (!last || last[0] !== coord[0] || last[1] !== coord[1]) {
          stitchedCoords.push(coord);
        }
      });
    }

    if (stitchedCoords.length < 2) {
      return {
        ok: false,
        error: { message: "No tracked rail path found — draw a rail corridor to continue." },
      };
    }

    const distanceKm = lineDistanceKm(stitchedCoords);
    return {
      ok: true,
      data: {
        geometry: {
          type: "LineString",
          coordinates: stitchedCoords,
        },
        distance: distanceKm * 1000,
        duration: legDurations.reduce((sum, value) => sum + value, 0),
        legDurations,
        geometrySource: "rail-network",
      },
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load rail network";
    return {
      ok: false,
      error: { message },
    };
  }
}
