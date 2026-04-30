export type HHMM = string;

export interface VariantStopTimesOverride {
  byStopId: Record<string, HHMM>;
}

export interface GtfsOverrides {
  /** key: variant_id */
  stopTimesByVariantId: Record<string, VariantStopTimesOverride>;
  /** key: `${routeShortName}|${dayOfWeek}|${directionId}|${headsign}` */
  departuresByKey: Record<string, HHMM[]>;
}

const STORAGE_KEY = "transitflow.gtfsOverrides.v1";

export function defaultGtfsOverrides(): GtfsOverrides {
  return { stopTimesByVariantId: {}, departuresByKey: {} };
}

export function isHHMM(value: string): boolean {
  return /^\d{2}:\d{2}$/.test(value);
}

export function normalizeTimes(times: string[]): HHMM[] {
  const cleaned = times
    .map((t) => t.trim())
    .filter((t) => isHHMM(t));
  return Array.from(new Set(cleaned)).sort();
}

export function buildDeparturesKey(args: {
  routeShortName: string;
  dayOfWeek: number;
  directionId: number;
  headsign: string;
}): string {
  return `${args.routeShortName}|${args.dayOfWeek}|${args.directionId}|${args.headsign}`;
}

function safeJsonParse<T>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function loadGtfsOverrides(): GtfsOverrides {
  if (typeof window === "undefined") return defaultGtfsOverrides();
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return defaultGtfsOverrides();
  const parsed = safeJsonParse<Partial<GtfsOverrides>>(raw);
  if (!parsed) return defaultGtfsOverrides();
  return {
    stopTimesByVariantId: parsed.stopTimesByVariantId ?? {},
    departuresByKey: parsed.departuresByKey ?? {},
  };
}

export function saveGtfsOverrides(next: GtfsOverrides) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}

export function getStopTimesOverride(overrides: GtfsOverrides, variantId: string): VariantStopTimesOverride | null {
  return overrides.stopTimesByVariantId[variantId] ?? null;
}

export function getDepartureOverridesForRouteDay(
  overrides: GtfsOverrides,
  routeShortName: string,
  dayOfWeek: number,
): Record<string, HHMM[]> {
  const prefix = `${routeShortName}|${dayOfWeek}|`;
  const result: Record<string, HHMM[]> = {};
  for (const [k, v] of Object.entries(overrides.departuresByKey)) {
    if (k.startsWith(prefix)) result[k] = v;
  }
  return result;
}

// ── URL-safe encoding for API overrides param ────────────────────────────────
// We only ever send a small *slice* of overrides with each request.

function base64UrlEncode(bytes: Uint8Array): string {
  // Browser-safe base64url
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
  const b64 = btoa(binary);
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function encodeOverridesParam(payload: unknown): string {
  const json = JSON.stringify(payload);
  const bytes = new TextEncoder().encode(json);
  return base64UrlEncode(bytes);
}

