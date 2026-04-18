export interface GTFSRoute {
  route_id: string;
  route_short_name: string;
  route_long_name: string;
  route_type: number;
}

export interface GTFSVariant {
  variant_id: string;
  label: string;
  route_id: string;
  direction_id: number;
  shape_id: string;
  trip_count: number;
  representative_trip_id: string;
  route_variant: string;
}

export interface GTFSStop {
  stop_id: string;
  stop_name: string;
  stop_lat: number;
  stop_lon: number;
  stop_sequence: number;
}

export type VariantsIndex = Record<string, GTFSVariant[]>;
export type VariantStops = Record<string, GTFSStop[]>;

// ─── Enriched types used across the app ────────────────────────────────────

export interface EnrichedRoute {
  route_id: string;
  short_name: string;
  long_name: string;
  route_type: number;
  is_rail: boolean;
  color: string;
  variants: GTFSVariant[];
  /** First stop name of the first variant */
  from_stop: string;
  /** Last stop name of the first variant */
  to_stop: string;
  /** Total trips across all variants for this route */
  total_trips: number;
}

export interface CustomRoute {
  id: string;
  name: string;
  color: string;
  type: "bus" | "train";
  description?: string;
  stops: CustomStop[];
  /** GeoJSON LineString coordinates [lon, lat][] */
  geometry?: [number, number][];
  schedule?: CustomSchedule;
  createdAt: string;
}

export interface CustomStop {
  id: string;
  name: string;
  lat: number;
  lon: number;
  sequence: number;
}

export interface CustomSchedule {
  type: "frequency" | "fixed";
  frequency?: {
    weekday: { start: string; end: string; interval: number } | null;
    weekend: { start: string; end: string; interval: number } | null;
  };
  fixedDepartures?: string[]; // HH:MM
  direction: "one-way" | "two-way";
}

// ─── Time helpers ───────────────────────────────────────────────────────────

/** "07:30" → seconds since midnight */
export function timeToSeconds(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 3600 + m * 60;
}

/** seconds since midnight → "07:30 AM" */
export function secondsToDisplayTime(s: number): string {
  const totalMinutes = Math.floor(s / 60) % (24 * 60);
  const hours24 = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const ampm = hours24 < 12 ? "AM" : "PM";
  const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12;
  return `${hours12}:${String(minutes).padStart(2, "0")} ${ampm}`;
}

/** Interpolate position along a list of stops at time t (seconds) */
export function interpolatePosition(
  stops: { t: number; lat: number; lon: number }[],
  t: number
): { lat: number; lon: number } | null {
  if (stops.length === 0) return null;
  if (t <= stops[0].t) return { lat: stops[0].lat, lon: stops[0].lon };
  if (t >= stops[stops.length - 1].t)
    return { lat: stops[stops.length - 1].lat, lon: stops[stops.length - 1].lon };

  for (let i = 0; i < stops.length - 1; i++) {
    const a = stops[i];
    const b = stops[i + 1];
    if (t >= a.t && t <= b.t) {
      const ratio = (t - a.t) / (b.t - a.t);
      return {
        lat: a.lat + (b.lat - a.lat) * ratio,
        lon: a.lon + (b.lon - a.lon) * ratio,
      };
    }
  }
  return null;
}

/** Parse a GTFS time string like "25:30:00" (can exceed 24h) → seconds */
export function gtfsTimeToSeconds(gtfsTime: string): number {
  const parts = gtfsTime.split(":").map(Number);
  return parts[0] * 3600 + parts[1] * 60 + (parts[2] ?? 0);
}
