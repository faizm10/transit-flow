/**
 * City GTFS overlays — shared types + helpers.
 *
 * A user uploads another city's GTFS zip; a web worker parses it in the
 * browser (the raw zip never leaves the machine — Vercel caps request bodies
 * at ~4.5MB) and reduces it to this compact payload: stops, routes, and trip
 * *patterns* (unique stop sequences) with timing summaries. The payload is
 * gzipped client-side and chunk-uploaded to the user's account.
 */

import { gzipSync, gunzipSync, strToU8, strFromU8 } from "fflate";

// ── Compact payload ─────────────────────────────────────────────────────────

/** stop_id → [lon, lat, name] (tuple keeps the JSON small) */
export type CityStops = Record<string, [number, number, string]>;

export interface CityPattern {
  /** Ordered stop_ids for this unique stop sequence */
  stopIds: string[];
  /** Trips using this pattern (each trip counted once) */
  tripCount: number;
  /** Trips per week = Σ trips × operating days/week of their service */
  weeklyTrips: number;
  /** First/last first-stop departure, "HH:MM" (may exceed 24h per GTFS) */
  firstDeparture: string;
  lastDeparture: string;
  /** Departures from the first stop bucketed by hour (0–23, 24h+ wraps) */
  hourly: number[];
  /** Most common headsign among trips on this pattern */
  headsign: string;
  /** Simplified shape polyline [lon, lat][]; null → draw stop-to-stop */
  shape: [number, number][] | null;
}

export interface CityRoute {
  id: string;
  shortName: string;
  longName: string;
  /** GTFS route_type (0 tram, 1 subway, 2 rail, 3 bus, …) */
  type: number;
  /** From routes.txt route_color, or assigned from a palette */
  color: string;
  patterns: CityPattern[];
}

export interface CityFeedPayload {
  version: 1;
  stops: CityStops;
  routes: CityRoute[];
}

// ── Metadata (stored as its own DB columns / jsonb, listed without payload) ─

export interface CityFeedStats {
  stops: number;
  routes: number;
  trips: number;
  patterns: number;
  /** [west, south, east, north] */
  bbox: [number, number, number, number];
  /** Service date range from calendar(_dates), "YYYY-MM-DD" (if present) */
  serviceStart?: string;
  serviceEnd?: string;
}

export interface CityFeedMeta {
  id: string;
  name: string;
  agency: string | null;
  color: string;
  stats: CityFeedStats;
  byteSize: number;
  createdAt: string;
}

// ── Worker messages ─────────────────────────────────────────────────────────

export interface ParseProgress {
  type: "progress";
  /** e.g. "Reading stops", "Processing stop times" */
  phase: string;
  /** 0–1 across the whole parse */
  pct: number;
}

export interface ParseResult {
  type: "result";
  agency: string | null;
  stats: CityFeedStats;
  /** gzipped JSON of CityFeedPayload (transferred, not copied) */
  gzipped: ArrayBuffer;
}

export interface ParseError {
  type: "error";
  message: string;
}

export type ParserMessage = ParseProgress | ParseResult | ParseError;

// ── (De)compression ─────────────────────────────────────────────────────────

export function compressPayload(payload: CityFeedPayload): Uint8Array {
  return gzipSync(strToU8(JSON.stringify(payload)), { level: 7 });
}

export function decompressPayload(gzipped: Uint8Array): CityFeedPayload {
  return JSON.parse(strFromU8(gunzipSync(gzipped))) as CityFeedPayload;
}

/** Binary chunk size for uploads — well under Vercel's ~4.5MB body cap. */
export const UPLOAD_CHUNK_BYTES = 2 * 1024 * 1024;

// ── GeoJSON for the map overlay ─────────────────────────────────────────────

/**
 * Build line + stop FeatureCollections for every visible loaded feed.
 * Line features carry feedId/routeShort/color; stop features feedId/name.
 */
export function buildCityFeedGeoJSON(
  feeds: { meta: CityFeedMeta; payload: CityFeedPayload }[]
): {
  lines: GeoJSON.FeatureCollection;
  stops: GeoJSON.FeatureCollection;
} {
  const lineFeatures: GeoJSON.Feature[] = [];
  const stopFeatures: GeoJSON.Feature[] = [];

  for (const { meta, payload } of feeds) {
    for (const route of payload.routes) {
      for (const pattern of route.patterns) {
        const coords =
          pattern.shape ??
          pattern.stopIds
            .map((sid) => payload.stops[sid])
            .filter((s): s is [number, number, string] => !!s)
            .map(([lon, lat]) => [lon, lat] as [number, number]);
        if (coords.length < 2) continue;
        lineFeatures.push({
          type: "Feature",
          geometry: { type: "LineString", coordinates: coords },
          properties: {
            feedId: meta.id,
            feedName: meta.name,
            routeShort: route.shortName || route.longName,
            routeType: route.type,
            color: route.color || meta.color,
            weeklyTrips: pattern.weeklyTrips,
          },
        });
      }
    }
    for (const [stopId, [lon, lat, name]] of Object.entries(payload.stops)) {
      stopFeatures.push({
        type: "Feature",
        geometry: { type: "Point", coordinates: [lon, lat] },
        properties: { feedId: meta.id, stopId, name, color: meta.color },
      });
    }
  }

  return {
    lines: { type: "FeatureCollection", features: lineFeatures },
    stops: { type: "FeatureCollection", features: stopFeatures },
  };
}

/** Fallback palette when routes.txt has no route_color. */
export const CITY_FEED_COLORS = [
  "#d946ef", "#f59e0b", "#10b981", "#6366f1", "#ef4444",
  "#06b6d4", "#84cc16", "#f97316", "#a855f7", "#14b8a6",
];

export function pickFeedColor(index: number): string {
  return CITY_FEED_COLORS[index % CITY_FEED_COLORS.length];
}
