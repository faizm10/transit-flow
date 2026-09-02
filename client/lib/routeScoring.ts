import type { CustomRoute, CustomStop, CustomSchedule } from "@/lib/gtfs";

// ─── Public types ──────────────────────────────────────────────────────────

export type ScoreGrade = "A+" | "A" | "B" | "C" | "D" | "F";

export interface RouteScore {
  grade: ScoreGrade;
  scorePercent: number;
  corridorKm: number;
  stopCount: number;
  frequencyMins: number | null; // null = no schedule / fixed departures
  frequencyGrade: ScoreGrade;
  serviceHours: number;
  serviceHoursGrade: ScoreGrade;
  stopCountGrade: ScoreGrade;
  corridorGrade: ScoreGrade;
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function haversineM(
  lat1: number, lon1: number,
  lat2: number, lon2: number
): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Total corridor length in km from a list of [lon, lat] coordinates. */
function geometryLengthKm(coords: [number, number][]): number {
  let total = 0;
  for (let i = 1; i < coords.length; i++) {
    const [lon1, lat1] = coords[i - 1];
    const [lon2, lat2] = coords[i];
    total += haversineM(lat1, lon1, lat2, lon2);
  }
  return total / 1000;
}

/** Total corridor length in km from stop lat/lon pairs. */
function stopsLengthKm(stops: CustomStop[]): number {
  let total = 0;
  for (let i = 1; i < stops.length; i++) {
    total += haversineM(stops[i - 1].lat, stops[i - 1].lon, stops[i].lat, stops[i].lon);
  }
  return total / 1000;
}

/** Parse "HH:MM" → fractional hours. */
function timeToH(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return (h ?? 0) + (m ?? 0) / 60;
}

/**
 * Best (minimum) headway in minutes extracted from a schedule.
 * Returns null when the schedule is fixed (no headway concept).
 */
function bestHeadwayMins(schedule: CustomSchedule | undefined): number | null {
  if (!schedule) return null;

  if (schedule.type === "frequency" && schedule.frequency?.weekday) {
    return schedule.frequency.weekday.interval;
  }

  if (schedule.type === "banded" && schedule.weekday?.active) {
    const mins = schedule.weekday.bands
      .map((b) => b.headwayMins)
      .filter((m) => m > 0);
    return mins.length > 0 ? Math.min(...mins) : null;
  }

  return null; // fixed or timetable
}

/**
 * Daily service window in hours.
 * For frequency mode: end − start.
 * For banded mode: sum of band durations on weekday.
 */
function serviceHours(schedule: CustomSchedule | undefined): number {
  if (!schedule) return 0;

  if (schedule.type === "frequency" && schedule.frequency?.weekday) {
    const { start, end } = schedule.frequency.weekday;
    return Math.max(0, timeToH(end) - timeToH(start));
  }

  if (schedule.type === "banded" && schedule.weekday?.active) {
    return schedule.weekday.bands.reduce((sum, b) => {
      const bandH =
        b.endHour + b.endMin / 60 - (b.startHour + b.startMin / 60);
      return sum + Math.max(0, bandH);
    }, 0);
  }

  if (schedule.type === "fixed" && schedule.fixedDepartures?.length) {
    // Approximate: time between first and last departure
    const sorted = [...schedule.fixedDepartures].sort();
    return Math.max(0, timeToH(sorted[sorted.length - 1]) - timeToH(sorted[0]));
  }

  return 0;
}

// ─── Scoring tables ────────────────────────────────────────────────────────

function gradeFromScore(pct: number): ScoreGrade {
  if (pct >= 90) return "A+";
  if (pct >= 80) return "A";
  if (pct >= 70) return "B";
  if (pct >= 55) return "C";
  if (pct >= 40) return "D";
  return "F";
}

function frequencyScore(headwayMins: number | null): number {
  if (headwayMins === null) return 55; // fixed schedule — treat as neutral C
  if (headwayMins <= 10) return 100;
  if (headwayMins <= 15) return 85;
  if (headwayMins <= 20) return 70;
  if (headwayMins <= 30) return 55;
  if (headwayMins <= 60) return 35;
  return 10;
}

function serviceHoursScore(hours: number): number {
  if (hours >= 18) return 100;
  if (hours >= 16) return 85;
  if (hours >= 14) return 70;
  if (hours >= 12) return 55;
  if (hours >= 8) return 35;
  return 10;
}

function stopCountScore(count: number): number {
  if (count >= 12) return 100;
  if (count >= 8) return 80;
  if (count >= 5) return 60;
  if (count >= 3) return 40;
  return 20;
}

/** Cap at 50 km → 100 points; short routes still get partial credit. */
function corridorScore(km: number): number {
  return Math.min(100, Math.round((km / 50) * 100));
}

// ─── Main export ───────────────────────────────────────────────────────────

export function computeRouteScore(route: CustomRoute): RouteScore {
  const stops = route.stops ?? [];

  // Corridor length: prefer geometry (more accurate for drawn train routes)
  const corridorKm =
    route.geometry && route.geometry.length >= 2
      ? geometryLengthKm(route.geometry)
      : stopsLengthKm(stops);

  const headway = bestHeadwayMins(route.schedule);
  const svcHours = serviceHours(route.schedule);

  const freqPct = frequencyScore(headway);
  const svcHoursPct = serviceHoursScore(svcHours);
  const stopPct = stopCountScore(stops.length);
  const corridorPct = corridorScore(corridorKm);

  // Weighted average
  const scorePercent = Math.round(
    freqPct * 0.40 +
    corridorPct * 0.25 +
    svcHoursPct * 0.20 +
    stopPct * 0.15
  );

  return {
    grade: gradeFromScore(scorePercent),
    scorePercent,
    corridorKm: Math.round(corridorKm * 10) / 10,
    stopCount: stops.length,
    frequencyMins: headway,
    frequencyGrade: gradeFromScore(freqPct),
    serviceHours: Math.round(svcHours * 10) / 10,
    serviceHoursGrade: gradeFromScore(svcHoursPct),
    stopCountGrade: gradeFromScore(stopPct),
    corridorGrade: gradeFromScore(corridorPct),
  };
}
