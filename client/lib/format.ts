/**
 * Display formatting.
 *
 * One implementation each, shared by server and client, so a byte count or a
 * duration reads identically on the dataset list, the processing screen and the
 * overview panel. Every function here is pure and safe to call during render.
 */

const BYTE_UNITS = ["B", "KB", "MB", "GB", "TB"] as const;

/**
 * Human byte size. Decimal (1000-based) because that is what storage providers
 * and upload dialogs report — a 1.8 GB archive should not display as 1.68 GB.
 */
export function formatBytes(bytes: number, decimals = 1): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes === 0) return "0 B";

  const exponent = Math.min(
    Math.floor(Math.log10(bytes) / 3),
    BYTE_UNITS.length - 1
  );
  const value = bytes / 1000 ** exponent;
  // Whole bytes never need a decimal point.
  const places = exponent === 0 ? 0 : decimals;
  return `${value.toFixed(places)} ${BYTE_UNITS[exponent]}`;
}

/** Transfer rate, e.g. "12.4 MB/s". Returns null when there is no usable rate. */
export function formatBytesPerSecond(bytesPerSecond: number): string | null {
  if (!Number.isFinite(bytesPerSecond) || bytesPerSecond <= 0) return null;
  return `${formatBytes(bytesPerSecond)}/s`;
}

/**
 * Compact duration: "820ms", "48s", "3m 12s", "1h 04m".
 * Used for processing durations and stage timings.
 */
export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "—";
  if (ms < 1000) return `${Math.round(ms)}ms`;

  const totalSeconds = Math.round(ms / 1000);
  if (totalSeconds < 60) return `${totalSeconds}s`;

  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes < 60) return seconds === 0 ? `${minutes}m` : `${minutes}m ${seconds}s`;

  const hours = Math.floor(minutes / 60);
  return `${hours}h ${String(minutes % 60).padStart(2, "0")}m`;
}

/**
 * Remaining time from bytes and a rate. Returns null rather than a guess when
 * the rate is not yet meaningful — an ETA that swings wildly in the first
 * seconds of an upload is worse than no ETA.
 */
export function formatEta(
  remainingBytes: number,
  bytesPerSecond: number
): string | null {
  if (!Number.isFinite(bytesPerSecond) || bytesPerSecond <= 0) return null;
  if (!Number.isFinite(remainingBytes) || remainingBytes <= 0) return null;
  return formatDuration((remainingBytes / bytesPerSecond) * 1000);
}

/** Thousands-separated integer. GTFS screens are full of large counts. */
export function formatCount(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return value.toLocaleString("en-US");
}

/**
 * Abbreviated count for dense surfaces: "1.2M", "48.3k".
 * Below 10,000 it falls through to the full number — abbreviating "9,412" to
 * "9.4k" costs precision and saves nothing.
 */
export function formatCompactCount(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  if (Math.abs(value) < 10_000) return formatCount(value);
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

/** Percentage with no decimals, clamped to 0–100. */
export function formatPercent(fraction: number): string {
  if (!Number.isFinite(fraction)) return "—";
  return `${Math.max(0, Math.min(100, Math.round(fraction * 100)))}%`;
}

const RELATIVE = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
const RELATIVE_STEPS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["second", 60],
  ["minute", 60],
  ["hour", 24],
  ["day", 7],
  ["week", 4.348],
  ["month", 12],
  ["year", Infinity],
];

/**
 * "3 minutes ago" / "in 2 days".
 *
 * Callers rendering this on the server must accept that it is computed at
 * response time; anything that needs to tick belongs in a client component.
 */
export function formatRelativeTime(
  value: Date | string | number,
  now: Date = new Date()
): string {
  const then = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(then.getTime())) return "—";

  let delta = (then.getTime() - now.getTime()) / 1000;
  for (const [unit, span] of RELATIVE_STEPS) {
    if (Math.abs(delta) < span) return RELATIVE.format(Math.round(delta), unit);
    delta /= span;
  }
  return RELATIVE.format(Math.round(delta), "year");
}

const ABSOLUTE = new Intl.DateTimeFormat("en-CA", {
  year: "numeric",
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

/** Absolute timestamp for tooltips and detail rows. */
export function formatTimestamp(value: Date | string | number): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return ABSOLUTE.format(date);
}

/** "2026-04-12" from a GTFS `YYYYMMDD` date, or null if unparseable. */
export function formatGtfsDate(raw: string | null | undefined): string | null {
  if (!raw || !/^\d{8}$/.test(raw)) return null;
  return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
}
