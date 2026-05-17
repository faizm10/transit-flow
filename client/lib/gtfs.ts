import { v4 as uuidv4 } from "uuid";

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
  /** Full-feed trip count from the source GTFS feed */
  trip_count: number;
  /** Trips active in the selected weekly count basis */
  weekly_trip_count?: number;
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

// ─── Route visibility filters ───────────────────────────────────────────────

export interface RouteFilters {
  goRouteShortNames: string[] | null;
  customRouteIds: string[] | null;
}

// ─── Enriched types used across the app ────────────────────────────────────

export interface EnrichedRoute {
  route_id: string;
  short_name: string;
  long_name: string;
  route_type: number;
  is_rail: boolean;
  color: string;
  variants: GTFSVariant[];
  /** Corridor end (Union when present); from longest variant, not necessarily the first variant */
  from_stop: string;
  /** Corridor end (outer terminal); from longest variant */
  to_stop: string;
  /** Total trips across all variants for this route */
  total_trips: number;
  /** Weekly trips across all variants for this route */
  weekly_trips: number;
}

export interface ExtensionMeta {
  parentRouteShortName: string;   // e.g. "30"
  parentRouteName: string;        // e.g. "Route 30 - Kitchener"
  parentRouteColor: string;
  parentWeeklyTrips: number;
  branchSuffix: string;           // e.g. "R" → displayed as "30R"
  scheduleMultiplier: number;     // 0.5 = half parent frequency
  keepOriginalRunning: boolean;   // whether original GO route runs concurrently in simulation
  extensionTravelTimeMins: number; // from Directions API
  baseStopCount: number;          // how many stops came from parent (first N stops)
  parentVariantId?: string;
  parentVariantLabel?: string;
  branchStopName?: string;
  branchStopSequence?: number;
  originalBaseStopCount?: number;
  skippedBaseStopCount?: number;
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
  extension?: ExtensionMeta;
}

export interface CustomStop {
  id: string;
  name: string;
  lat: number;
  lon: number;
  sequence: number;
}

/**
 * A user-created station that can be reused across multiple routes.
 * Independent of any specific route — acts as a named, typed waypoint.
 */
export interface CustomStation {
  id: string;
  name: string;
  lat: number;
  lon: number;
  /** Primary service at this station */
  type: "train" | "bus" | "mixed";
  /** Up to 4-letter display code, e.g. "UN" for Union Station */
  code?: string;
  notes?: string;
  createdAt: string;
}

// ─── Rich schedule types ───────────────────────────────────────────────────

/** A single contiguous service window within a day (e.g. "Morning peak 6–9 AM every 10 min") */
export interface ServiceBand {
  id: string;
  label: string;       // display name, e.g. "Morning peak"
  startHour: number;   // 0–23
  startMin: number;    // 0 or 30
  endHour: number;
  endMin: number;
  headwayMins: number; // minutes between trips
}

/** Schedule for one day type (weekday / saturday / sunday) */
export interface DaySchedule {
  active: boolean;       // false = no service on this day type
  bands: ServiceBand[];
}

/** A single stop's scheduled arrival time (used by the timetable schedule type). */
export interface StopTimeEntry {
  stopId:     string;
  stopName:   string;
  /** Seconds since midnight */
  arrivalSec: number;
}

/** One scheduled custom-route trip with explicit per-stop times. */
export interface CustomTimetableTrip {
  id: string;
  /** Departure in seconds since midnight at the first stop. */
  departureSec: number;
  stopTimes: StopTimeEntry[];
}

export interface CustomSchedule {
  /** banded = frequency bands per day; fixed = explicit departure list; timetable = per-stop arrival times */
  type: "banded" | "frequency" | "fixed" | "timetable";
  // ── banded mode ───────────────────────────────────────────────────────────
  weekday?: DaySchedule;
  saturday?: DaySchedule;
  sunday?: DaySchedule;
  // ── legacy frequency mode (still accepted, migrated on read) ─────────────
  frequency?: {
    weekday: { start: string; end: string; interval: number } | null;
    weekend: { start: string; end: string; interval: number } | null;
  };
  // ── fixed mode ────────────────────────────────────────────────────────────
  fixedDepartures?: string[];       // HH:MM outbound
  returnDepartures?: string[];      // HH:MM return direction (optional)
  // ── return direction hours (frequency mode) ───────────────────────────────
  returnFrequency?: { start: string; end: string }; // same interval, different window
  // ── timetable mode ───────────────────────────────────────────────────────
  stopTimes?:         StopTimeEntry[];
  firstDepartureSec?: number; // seconds since midnight for simulation seed
  timetableTrips?:    CustomTimetableTrip[];
  direction: "one-way" | "two-way";
}

// ─── Schedule helpers ──────────────────────────────────────────────────────

function timeStringToHM(t: string): { h: number; m: number } {
  const [h, m] = t.split(":").map(Number);
  return { h: h ?? 0, m: m ?? 0 };
}

/** Convert a legacy `frequency` schedule to the richer `banded` format. */
export function migrateLegacySchedule(s: CustomSchedule): CustomSchedule {
  if (s.type === "banded") return s;
  if (s.type === "timetable") return s;
  if (s.type === "fixed") {
    return {
      ...s,
      type: "fixed",
      weekday: { active: true, bands: [] },
      saturday: { active: true, bands: [] },
      sunday: { active: true, bands: [] },
    };
  }
  // type === "frequency" → build one band per day type from the flat fields
  function freqToBands(
    entry: { start: string; end: string; interval: number } | null | undefined
  ): ServiceBand[] {
    if (!entry) return [];
    const { h: sh, m: sm } = timeStringToHM(entry.start);
    const { h: eh, m: em } = timeStringToHM(entry.end);
    return [
      {
        id: uuidv4(),
        label: "All day",
        startHour: sh, startMin: sm,
        endHour: eh, endMin: em,
        headwayMins: entry.interval,
      },
    ];
  }
  return {
    ...s,
    type: "banded",
    weekday: { active: true, bands: freqToBands(s.frequency?.weekday) },
    saturday: { active: true, bands: freqToBands(s.frequency?.weekend) },
    sunday: { active: true, bands: freqToBands(s.frequency?.weekend) },
  };
}

/** Create a blank banded schedule with sensible default bands. */
export function defaultBandedSchedule(): CustomSchedule {
  const makeBand = (label: string, sh: number, sm: number, eh: number, em: number, headway: number): ServiceBand => ({
    id: uuidv4(), label, startHour: sh, startMin: sm, endHour: eh, endMin: em, headwayMins: headway,
  });
  const weekdayBands: ServiceBand[] = [
    makeBand("Morning peak",   6,  0,  9,  0, 10),
    makeBand("Midday",         9,  0, 15,  0, 20),
    makeBand("Afternoon peak", 15, 0, 19,  0, 12),
    makeBand("Evening",        19, 0, 23,  0, 30),
  ];
  return {
    type: "banded",
    direction: "two-way",
    weekday:  { active: true,  bands: weekdayBands },
    saturday: { active: true,  bands: [makeBand("All day", 7, 0, 22, 0, 30)] },
    sunday:   { active: false, bands: [] },
  };
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
