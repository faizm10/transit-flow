/**
 * GTFS specification constants.
 *
 * Dependency-free: the browser preflight, the API and the worker all import
 * this, and the worker must be able to without pulling in React or Next.
 *
 * The previous pipeline's required-file list was really "files our Python
 * scripts happened to read", which rejected valid feeds (a feed using
 * `calendar.txt` rather than `calendar_dates.txt`) and accepted invalid ones
 * (no `agency.txt`). This list is the specification's.
 */

/**
 * Required by the GTFS specification.
 *
 * `calendar.txt` is deliberately absent: the spec requires *either*
 * `calendar.txt` or `calendar_dates.txt`, which is checked separately by
 * `hasServiceCalendar` because "one of these two" is not expressible as a list.
 */
export const REQUIRED_GTFS_FILES = [
  "agency.txt",
  "stops.txt",
  "routes.txt",
  "trips.txt",
  "stop_times.txt",
] as const;

/** Either of these satisfies the service-calendar requirement. */
export const CALENDAR_FILES = ["calendar.txt", "calendar_dates.txt"] as const;

/** Read when present; their absence is never an error. */
export const OPTIONAL_GTFS_FILES = [
  "calendar.txt",
  "calendar_dates.txt",
  "shapes.txt",
  "feed_info.txt",
  "frequencies.txt",
  "transfers.txt",
  "fare_attributes.txt",
  "fare_rules.txt",
  "levels.txt",
  "pathways.txt",
] as const;

export function hasServiceCalendar(filenames: Iterable<string>): boolean {
  const present = new Set(filenames);
  return CALENDAR_FILES.some((f) => present.has(f));
}

// ── Safety limits ───────────────────────────────────────────────────────────
// A GTFS archive is untrusted input. These bound the two attacks that matter
// for a zip: a decompression bomb, and an archive whose entries are so
// numerous that merely enumerating them is the attack.

/** Largest archive we accept. Mirrored by MAX_ARCHIVE_BYTES in the store. */
export const MAX_ARCHIVE_BYTES = 8 * 1024 * 1024 * 1024;

/**
 * Largest total uncompressed size. A 1 MB zip can expand to terabytes; the
 * worker aborts once the running total of decompressed bytes passes this,
 * rather than trusting the sizes declared in the central directory.
 */
export const MAX_UNCOMPRESSED_BYTES = 64 * 1024 * 1024 * 1024;

/**
 * Largest ratio of uncompressed to compressed bytes before we call it a bomb.
 * Real GTFS text compresses around 5–10×; 200× is far outside that and well
 * inside what a crafted archive achieves.
 */
export const MAX_COMPRESSION_RATIO = 200;

/** Entry-count ceiling. A real feed has tens of files, not thousands. */
export const MAX_ARCHIVE_ENTRIES = 10_000;

// ── Route types ─────────────────────────────────────────────────────────────

/** GTFS `route_type`, for display. Extended types collapse to their base mode. */
export const ROUTE_TYPE_LABELS: Record<number, string> = {
  0: "Tram",
  1: "Subway",
  2: "Rail",
  3: "Bus",
  4: "Ferry",
  5: "Cable tram",
  6: "Aerial lift",
  7: "Funicular",
  11: "Trolleybus",
  12: "Monorail",
};

export function routeTypeLabel(type: number): string {
  if (ROUTE_TYPE_LABELS[type]) return ROUTE_TYPE_LABELS[type];
  // Extended route types (GTFS "Extended Route Types") are 3-4 digit codes
  // whose leading digits give the base mode.
  if (type >= 100 && type < 200) return "Rail";
  if (type >= 200 && type < 300) return "Coach";
  if (type >= 700 && type < 800) return "Bus";
  if (type >= 900 && type < 1000) return "Tram";
  if (type >= 1000 && type < 1100) return "Ferry";
  return "Other";
}

// ── Time ────────────────────────────────────────────────────────────────────

/**
 * Parse a GTFS `HH:MM:SS` into seconds after midnight.
 *
 * Hours may exceed 23 — a trip departing at 25:10:00 is 1:10am on the *service*
 * day that began the previous morning. That is why stop times are stored as an
 * integer rather than a `time` column, which cannot represent it.
 *
 * Returns null for blank or malformed values; GTFS permits empty arrival and
 * departure times at non-timepoint stops.
 */
export function parseGtfsTime(value: string): number | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (trimmed === "") return null;

  const parts = trimmed.split(":");
  if (parts.length < 2 || parts.length > 3) return null;

  const hours = Number(parts[0]);
  const minutes = Number(parts[1]);
  const seconds = parts.length === 3 ? Number(parts[2]) : 0;

  if (!Number.isInteger(hours) || hours < 0) return null;
  if (!Number.isInteger(minutes) || minutes < 0 || minutes > 59) return null;
  if (!Number.isInteger(seconds) || seconds < 0 || seconds > 59) return null;

  return hours * 3600 + minutes * 60 + seconds;
}

/** Inverse of `parseGtfsTime`, preserving hours past 24. */
export function formatGtfsTime(secondsAfterMidnight: number): string {
  const h = Math.floor(secondsAfterMidnight / 3600);
  const m = Math.floor((secondsAfterMidnight % 3600) / 60);
  const s = secondsAfterMidnight % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/** Clock time for display — drops seconds and wraps hours past midnight. */
export function displayGtfsTime(secondsAfterMidnight: number): string {
  const h = Math.floor(secondsAfterMidnight / 3600) % 24;
  const m = Math.floor((secondsAfterMidnight % 3600) / 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
