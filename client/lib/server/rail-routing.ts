import { readFileSync } from "fs";
import { join } from "path";

export type LngLat = [number, number];

export interface RailNode {
  id: string;
  lon: number;
  lat: number;
}

export interface RailEdge {
  id: string;
  way_id: string;
  from: string;
  to: string;
  geometry: [LngLat, LngLat];
  distance_m: number;
  speed_kmh: number;
  duration_sec: number;
  tags?: Record<string, string>;
}

export interface RailNetwork {
  metadata: {
    source: string;
    generated_at: string;
    attribution: string;
    way_count: number;
    node_count: number;
    edge_count: number;
  };
  nodes: RailNode[];
  edges: RailEdge[];
}

export interface SnappedRailPoint {
  input: LngLat;
  snapped: LngLat;
  edgeId: string;
  wayId: string;
  distanceM: number;
  fraction: number;
}

export interface RailRouteResult {
  snappedPoints: SnappedRailPoint[];
  geometry: LngLat[];
  distanceM: number;
  durationSecs: number;
  travelSecs: number;
  dwellSecs: number;
  terminalBufferSecs: number;
  warnings: string[];
  metadata: RailNetwork["metadata"];
}

interface GraphStep {
  to: string;
  edgeId: string;
  distanceM: number;
  durationSec: number;
  geometry: LngLat[];
}

interface RoutingGraph {
  network: RailNetwork;
  nodesById: Map<string, RailNode>;
  edgesById: Map<string, RailEdge>;
  adjacency: Map<string, GraphStep[]>;
  grid: Map<string, RailEdge[]>;
  /** Node ID → component index. */
  nodeComponent: Map<string, number>;
  /** Index of the largest connected component (the main rail network). */
  mainComponent: number;
  /** Spatial grid restricted to edges inside mainComponent. */
  mainGrid: Map<string, RailEdge[]>;
}

interface SnapInternal extends SnappedRailPoint {
  edge: RailEdge;
}

const PUBLIC_DIR = join(process.cwd(), "public", "gotransit", "derived");
const NETWORK_PATH = join(PUBLIC_DIR, "rail_network.json");
const DEFAULT_MAX_SNAP_DISTANCE_M = 1200;
const DEFAULT_DWELL_SEC = 45;
const DEFAULT_TERMINAL_BUFFER_SEC = 60;
const GRID_DEG = 0.04;

let cachedGraph: RoutingGraph | null = null;

function loadNetwork(): RailNetwork {
  return JSON.parse(readFileSync(NETWORK_PATH, "utf-8")) as RailNetwork;
}

function reverseCoords(coords: LngLat[]): LngLat[] {
  return [...coords].reverse();
}

function getGraph(): RoutingGraph {
  if (cachedGraph) return cachedGraph;

  const network = loadNetwork();
  const nodesById = new Map(network.nodes.map((node) => [node.id, node]));
  const edgesById = new Map(network.edges.map((edge) => [edge.id, edge]));
  const adjacency = new Map<string, GraphStep[]>();
  const grid = new Map<string, RailEdge[]>();

  function addStep(from: string, step: GraphStep) {
    const steps = adjacency.get(from);
    if (steps) steps.push(step);
    else adjacency.set(from, [step]);
  }

  for (const edge of network.edges) {
    addStep(edge.from, {
      to: edge.to,
      edgeId: edge.id,
      distanceM: edge.distance_m,
      durationSec: edge.duration_sec,
      geometry: edge.geometry,
    });
    addStep(edge.to, {
      to: edge.from,
      edgeId: edge.id,
      distanceM: edge.distance_m,
      durationSec: edge.duration_sec,
      geometry: reverseCoords(edge.geometry),
    });

    const minLon = Math.min(edge.geometry[0][0], edge.geometry[1][0]);
    const maxLon = Math.max(edge.geometry[0][0], edge.geometry[1][0]);
    const minLat = Math.min(edge.geometry[0][1], edge.geometry[1][1]);
    const maxLat = Math.max(edge.geometry[0][1], edge.geometry[1][1]);
    for (let x = Math.floor(minLon / GRID_DEG); x <= Math.floor(maxLon / GRID_DEG); x++) {
      for (let y = Math.floor(minLat / GRID_DEG); y <= Math.floor(maxLat / GRID_DEG); y++) {
        const key = `${x}:${y}`;
        const bucket = grid.get(key);
        if (bucket) bucket.push(edge);
        else grid.set(key, [edge]);
      }
    }
  }

  // ── Connected component analysis ─────────────────────────────────────────
  // Identify the largest connected component so snapping always lands in the
  // main rail network, not an isolated industrial spur or stub track.
  const nodeComponent = new Map<string, number>();
  const componentSize = new Map<number, number>();
  let nextComponentId = 0;

  for (const nodeId of adjacency.keys()) {
    if (nodeComponent.has(nodeId)) continue;
    const compId = nextComponentId++;
    const queue: string[] = [nodeId];
    nodeComponent.set(nodeId, compId);
    let head = 0;
    while (head < queue.length) {
      const cur = queue[head++];
      for (const step of adjacency.get(cur) ?? []) {
        if (!nodeComponent.has(step.to)) {
          nodeComponent.set(step.to, compId);
          queue.push(step.to);
        }
      }
    }
    componentSize.set(compId, queue.length);
  }

  let mainComponent = 0;
  let maxSize = 0;
  for (const [compId, size] of componentSize) {
    if (size > maxSize) { mainComponent = compId; maxSize = size; }
  }

  // Build a spatial grid containing only edges whose both endpoints are in the
  // main component — used by snapInternal so we never snap to orphaned spurs.
  const mainGrid = new Map<string, RailEdge[]>();
  for (const edge of network.edges) {
    if (nodeComponent.get(edge.from) !== mainComponent) continue;
    const minLon = Math.min(edge.geometry[0][0], edge.geometry[1][0]);
    const maxLon = Math.max(edge.geometry[0][0], edge.geometry[1][0]);
    const minLat = Math.min(edge.geometry[0][1], edge.geometry[1][1]);
    const maxLat = Math.max(edge.geometry[0][1], edge.geometry[1][1]);
    for (let x = Math.floor(minLon / GRID_DEG); x <= Math.floor(maxLon / GRID_DEG); x++) {
      for (let y = Math.floor(minLat / GRID_DEG); y <= Math.floor(maxLat / GRID_DEG); y++) {
        const key = `${x}:${y}`;
        const bucket = mainGrid.get(key);
        if (bucket) bucket.push(edge);
        else mainGrid.set(key, [edge]);
      }
    }
  }

  cachedGraph = { network, nodesById, edgesById, adjacency, grid, nodeComponent, mainComponent, mainGrid };
  return cachedGraph;
}

function candidateEdgesForPoint(graph: RoutingGraph, point: LngLat, gridOverride?: Map<string, RailEdge[]>): RailEdge[] {
  const sourceGrid = gridOverride ?? graph.grid;
  const cx = Math.floor(point[0] / GRID_DEG);
  const cy = Math.floor(point[1] / GRID_DEG);
  for (const radius of [1, 2, 4, 8, 16]) {
    const seen = new Set<string>();
    const candidates: RailEdge[] = [];
    for (let x = cx - radius; x <= cx + radius; x++) {
      for (let y = cy - radius; y <= cy + radius; y++) {
        for (const edge of sourceGrid.get(`${x}:${y}`) ?? []) {
          if (!seen.has(edge.id)) {
            seen.add(edge.id);
            candidates.push(edge);
          }
        }
      }
    }
    if (candidates.length > 0) return candidates;
  }
  // Last resort: all edges in whichever grid was requested (never returns
  // the full unfiltered edge list so callers using mainGrid stay clean).
  const fallbackGrid = gridOverride ?? graph.grid;
  const allFromGrid: RailEdge[] = [];
  for (const bucket of fallbackGrid.values()) allFromGrid.push(...bucket);
  return allFromGrid.length > 0 ? allFromGrid : [];
}

function metresPerDegreeLon(lat: number) {
  return 111320 * Math.cos((lat * Math.PI) / 180);
}

function distanceM(a: LngLat, b: LngLat): number {
  const radius = 6371000;
  const dLat = ((b[1] - a[1]) * Math.PI) / 180;
  const dLon = ((b[0] - a[0]) * Math.PI) / 180;
  const lat1 = (a[1] * Math.PI) / 180;
  const lat2 = (b[1] * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * radius * Math.asin(Math.sqrt(h));
}

function projectPointToSegment(point: LngLat, a: LngLat, b: LngLat) {
  const midLat = (a[1] + b[1]) / 2;
  const xScale = metresPerDegreeLon(midLat);
  const yScale = 110540;
  const px = (point[0] - a[0]) * xScale;
  const py = (point[1] - a[1]) * yScale;
  const bx = (b[0] - a[0]) * xScale;
  const by = (b[1] - a[1]) * yScale;
  const denom = bx * bx + by * by;
  const rawT = denom === 0 ? 0 : (px * bx + py * by) / denom;
  const t = Math.max(0, Math.min(1, rawT));
  const snapped: LngLat = [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
  ];
  return { snapped, fraction: t, distanceM: distanceM(point, snapped) };
}

export function snapRailPoint(point: LngLat, maxDistanceM = DEFAULT_MAX_SNAP_DISTANCE_M): SnappedRailPoint & { warning?: string } {
  const graph = getGraph();
  let best: SnapInternal | null = null;

  for (const edge of candidateEdgesForPoint(graph, point, graph.mainGrid)) {
    const projection = projectPointToSegment(point, edge.geometry[0], edge.geometry[1]);
    if (!best || projection.distanceM < best.distanceM) {
      best = {
        input: point,
        snapped: projection.snapped,
        edgeId: edge.id,
        wayId: edge.way_id,
        distanceM: Math.round(projection.distanceM),
        fraction: projection.fraction,
        edge,
      };
    }
  }

  if (!best) {
    throw new Error("Rail network is empty.");
  }

  const { edge: _edge, ...snap } = best;
  return {
    ...snap,
    warning: snap.distanceM > maxDistanceM
      ? `Nearest rail is ${snap.distanceM}m away, outside the ${maxDistanceM}m snap limit.`
      : undefined,
  };
}

class MinHeap {
  private items: Array<{ node: string; score: number }> = [];

  push(item: { node: string; score: number }) {
    this.items.push(item);
    this.bubbleUp(this.items.length - 1);
  }

  pop(): { node: string; score: number } | undefined {
    const first = this.items[0];
    const last = this.items.pop();
    if (!first || !last) return first;
    if (this.items.length > 0) {
      this.items[0] = last;
      this.sinkDown(0);
    }
    return first;
  }

  get size() {
    return this.items.length;
  }

  private bubbleUp(index: number) {
    const item = this.items[index];
    while (index > 0) {
      const parentIndex = Math.floor((index - 1) / 2);
      const parent = this.items[parentIndex];
      if (item.score >= parent.score) break;
      this.items[parentIndex] = item;
      this.items[index] = parent;
      index = parentIndex;
    }
  }

  private sinkDown(index: number) {
    const length = this.items.length;
    const item = this.items[index];
    while (true) {
      const leftIndex = index * 2 + 1;
      const rightIndex = leftIndex + 1;
      let swapIndex = -1;

      if (leftIndex < length && this.items[leftIndex].score < item.score) {
        swapIndex = leftIndex;
      }
      if (
        rightIndex < length &&
        this.items[rightIndex].score < (swapIndex === -1 ? item.score : this.items[leftIndex].score)
      ) {
        swapIndex = rightIndex;
      }
      if (swapIndex === -1) break;

      this.items[index] = this.items[swapIndex];
      this.items[swapIndex] = item;
      index = swapIndex;
    }
  }
}

function addTempStep(map: Map<string, GraphStep[]>, from: string, step: GraphStep) {
  const existing = map.get(from);
  if (existing) existing.push(step);
  else map.set(from, [step]);
}

function addVirtualNode(temp: Map<string, GraphStep[]>, id: string, snap: SnapInternal) {
  const edge = snap.edge;
  const fromCoord = edge.geometry[0];
  const toCoord = edge.geometry[1];
  const toFromDistance = edge.distance_m * snap.fraction;
  const toToDistance = edge.distance_m * (1 - snap.fraction);
  const toFromDuration = edge.duration_sec * snap.fraction;
  const toToDuration = edge.duration_sec * (1 - snap.fraction);

  addTempStep(temp, id, {
    to: edge.from,
    edgeId: `${edge.id}:snap-from`,
    distanceM: toFromDistance,
    durationSec: toFromDuration,
    geometry: [snap.snapped, fromCoord],
  });
  addTempStep(temp, edge.from, {
    to: id,
    edgeId: `${edge.id}:snap-from`,
    distanceM: toFromDistance,
    durationSec: toFromDuration,
    geometry: [fromCoord, snap.snapped],
  });
  addTempStep(temp, id, {
    to: edge.to,
    edgeId: `${edge.id}:snap-to`,
    distanceM: toToDistance,
    durationSec: toToDuration,
    geometry: [snap.snapped, toCoord],
  });
  addTempStep(temp, edge.to, {
    to: id,
    edgeId: `${edge.id}:snap-to`,
    distanceM: toToDistance,
    durationSec: toToDuration,
    geometry: [toCoord, snap.snapped],
  });
}

function addDirectVirtualConnection(temp: Map<string, GraphStep[]>, aId: string, a: SnapInternal, bId: string, b: SnapInternal) {
  if (a.edge.id !== b.edge.id) return;
  const fractionDelta = Math.abs(a.fraction - b.fraction);
  const distance = a.edge.distance_m * fractionDelta;
  const duration = a.edge.duration_sec * fractionDelta;
  addTempStep(temp, aId, {
    to: bId,
    edgeId: `${a.edge.id}:snap-direct`,
    distanceM: distance,
    durationSec: duration,
    geometry: [a.snapped, b.snapped],
  });
  addTempStep(temp, bId, {
    to: aId,
    edgeId: `${a.edge.id}:snap-direct`,
    distanceM: distance,
    durationSec: duration,
    geometry: [b.snapped, a.snapped],
  });
}

function routeBetweenSnaps(graph: RoutingGraph, start: SnapInternal, end: SnapInternal, segmentIndex: number) {
  const startId = `__start_${segmentIndex}`;
  const endId = `__end_${segmentIndex}`;
  const temp = new Map<string, GraphStep[]>();
  addVirtualNode(temp, startId, start);
  addVirtualNode(temp, endId, end);
  addDirectVirtualConnection(temp, startId, start, endId, end);

  const distances = new Map<string, number>();
  const previous = new Map<string, { node: string; step: GraphStep }>();
  const heap = new MinHeap();

  distances.set(startId, 0);
  heap.push({ node: startId, score: 0 });

  while (heap.size > 0) {
    const current = heap.pop();
    if (!current) break;
    if (current.score !== distances.get(current.node)) continue;
    if (current.node === endId) break;

    const steps = [
      ...(graph.adjacency.get(current.node) ?? []),
      ...(temp.get(current.node) ?? []),
    ];
    for (const step of steps) {
      const nextScore = current.score + step.durationSec;
      if (nextScore < (distances.get(step.to) ?? Number.POSITIVE_INFINITY)) {
        distances.set(step.to, nextScore);
        previous.set(step.to, { node: current.node, step });
        heap.push({ node: step.to, score: nextScore });
      }
    }
  }

  if (!previous.has(endId)) return null;

  const steps: GraphStep[] = [];
  let cursor = endId;
  while (cursor !== startId) {
    const prev = previous.get(cursor);
    if (!prev) return null;
    steps.push(prev.step);
    cursor = prev.node;
  }
  steps.reverse();

  return {
    steps,
    distanceM: steps.reduce((sum, step) => sum + step.distanceM, 0),
    travelSecs: steps.reduce((sum, step) => sum + step.durationSec, 0),
  };
}

function snapInternal(point: LngLat): SnapInternal {
  const graph = getGraph();
  let best: SnapInternal | null = null;

  // Always snap to the main connected component only — this prevents an
  // isolated spur near the drawn point from blocking routing to the destination.
  for (const edge of candidateEdgesForPoint(graph, point, graph.mainGrid)) {
    const projection = projectPointToSegment(point, edge.geometry[0], edge.geometry[1]);
    if (!best || projection.distanceM < best.distanceM) {
      best = {
        input: point,
        snapped: projection.snapped,
        edgeId: edge.id,
        wayId: edge.way_id,
        distanceM: projection.distanceM,
        fraction: projection.fraction,
        edge,
      };
    }
  }

  if (!best) throw new Error("Rail network is empty.");
  return best;
}

function appendGeometry(target: LngLat[], next: LngLat[]) {
  for (const coord of next) {
    const last = target[target.length - 1];
    if (!last || distanceM(last, coord) > 0.5) target.push(coord);
  }
}

function simplifyCoords(coords: LngLat[], maxPoints = 1600): LngLat[] {
  if (coords.length <= maxPoints) return coords;
  const result: LngLat[] = [coords[0]];
  const step = (coords.length - 2) / (maxPoints - 2);
  for (let i = 1; i < maxPoints - 1; i++) {
    result.push(coords[Math.round(i * step)]);
  }
  result.push(coords[coords.length - 1]);
  return result;
}

export function routeRailPoints(
  points: LngLat[],
  options: {
    maxSnapDistanceM?: number;
    dwellStopCount?: number;
    dwellSec?: number;
    terminalBufferSec?: number;
  } = {}
): RailRouteResult {
  if (points.length < 2) {
    throw new Error("At least two rail route points are required.");
  }

  const graph = getGraph();
  const maxSnapDistanceM = options.maxSnapDistanceM ?? DEFAULT_MAX_SNAP_DISTANCE_M;
  const snapped = points.map(snapInternal);
  // Collect informational warnings but never block routing — always snap to
  // the nearest railway regardless of how far the original point is.
  const warnings: string[] = [];
  for (const snap of snapped) {
    if (snap.distanceM > maxSnapDistanceM) {
      warnings.push(
        `Route point snapped to nearest railway (${Math.round(snap.distanceM / 1000)}km away).`
      );
    }
  }

  const geometry: LngLat[] = [];
  let distanceTotal = 0;
  let travelTotal = 0;

  for (let index = 1; index < snapped.length; index++) {
    const segment = routeBetweenSnaps(graph, snapped[index - 1], snapped[index], index - 1);
    if (!segment) {
      throw new Error("No connected rail path was found between selected points.");
    }
    distanceTotal += segment.distanceM;
    travelTotal += segment.travelSecs;
    for (const step of segment.steps) appendGeometry(geometry, step.geometry);
  }

  const dwellStopCount = options.dwellStopCount ?? Math.max(0, points.length - 2);
  const dwellSecs = dwellStopCount * (options.dwellSec ?? DEFAULT_DWELL_SEC);
  const terminalBufferSecs = options.terminalBufferSec ?? DEFAULT_TERMINAL_BUFFER_SEC;

  return {
    snappedPoints: snapped.map((snap) => ({
      input: snap.input,
      snapped: [Number(snap.snapped[0].toFixed(7)), Number(snap.snapped[1].toFixed(7))],
      edgeId: snap.edgeId,
      wayId: snap.wayId,
      distanceM: Math.round(snap.distanceM),
      fraction: snap.fraction,
    })),
    geometry: simplifyCoords(geometry.map((coord) => [
      Number(coord[0].toFixed(7)),
      Number(coord[1].toFixed(7)),
    ])),
    distanceM: Math.round(distanceTotal),
    durationSecs: Math.round(travelTotal + dwellSecs + terminalBufferSecs),
    travelSecs: Math.round(travelTotal),
    dwellSecs,
    terminalBufferSecs,
    warnings,
    metadata: graph.network.metadata,
  };
}
