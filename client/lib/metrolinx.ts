/**
 * Metrolinx Open Data API client
 * Docs: https://api.openmetrolinx.com/OpenDataAPI/Help/Index/en
 * Auth: server-side only (METROLINX_API_KEY env var)
 */

const BASE_URL = "https://api.openmetrolinx.com/OpenDataAPI/api/V1";

function apiKey(): string {
  const key = process.env.METROLINX_API_KEY;
  if (!key) throw new Error("METROLINX_API_KEY env var is not set");
  return key;
}

/**
 * Low-level fetch wrapper — appends the API key + timeout.
 *
 * The Open Data API authenticates via a `?key=` query-string parameter, NOT a
 * header. (A header-based request 404s, which used to fall the Service Updates
 * page silently through to the gotransit.com scrape.)
 */
async function metrolinxFetch<T>(
  path: string,
  opts: { revalidate?: number; tags?: string[] } = {}
): Promise<T> {
  const sep = path.includes("?") ? "&" : "?";
  const url = `${BASE_URL}${path}${sep}key=${encodeURIComponent(apiKey())}`;
  const res = await fetch(url, {
    headers: {
      Accept: "application/json",
    },
    next: {
      revalidate: opts.revalidate ?? 300,
      ...(opts.tags ? { tags: opts.tags } : {}),
    },
    signal: AbortSignal.timeout(10_000),
  });

  // Never interpolate `url` into the error — it carries the API key.
  if (!res.ok) {
    throw new Error(`Metrolinx API ${res.status} ${res.statusText} — ${path}`);
  }

  const json = (await res.json()) as T;

  // The API answers HTTP 200 even for auth failures — the real status is in
  // `Metadata.ErrorCode` ("401" for a bad/expired key, "404", …). Anything
  // other than "200"/"204" is an error so callers fall back cleanly.
  const meta = (json as { Metadata?: { ErrorCode?: string; ErrorMessage?: string } })
    .Metadata;
  if (meta?.ErrorCode && meta.ErrorCode !== "200" && meta.ErrorCode !== "204") {
    throw new Error(
      `Metrolinx API ${meta.ErrorCode} ${meta.ErrorMessage ?? ""} — ${path}`.trim()
    );
  }

  return json;
}

// ─── Service Alerts ────────────────────────────────────────────────────────

/**
 * A single message from `/ServiceUpdate/ServiceAlert/All`.
 * Verified shape (2026-09): bilingual subject/body, category strings, and a
 * `Lines` array whose `Code` is a GO rail short code ("LW", "ST", …) OR a bus
 * route number ("88", "32") OR a network code ("GT").
 */
export interface MetrolinxServiceAlert {
  Code: string;
  ParentCode: string | null;
  Status: string; // "INIT" | "UPD" | ...
  PostedDateTime: string; // "YYYY-MM-DD HH:MM:SS", America/Toronto local
  SubjectEnglish: string;
  SubjectFrench: string;
  BodyEnglish: string;
  BodyFrench: string;
  Category: string; // "Service Disruption" | "Amenity" | "Disruptions" | ...
  SubCategory: string; // "Train Delay" | "Elevator-Escalator Disruption" | ...
  Lines: Array<{ Code: string }>;
  Stops: Array<{ Name: string | null; Code: string | null }>;
  Trips: unknown[];
}

export interface MetrolinxServiceAlertsResponse {
  Metadata?: { TimeStamp: string; ErrorCode: string; ErrorMessage: string };
  Messages?: { Message: MetrolinxServiceAlert[] };
}

export async function getServiceAlerts(): Promise<MetrolinxServiceAlertsResponse> {
  return metrolinxFetch<MetrolinxServiceAlertsResponse>(
    "/ServiceUpdate/ServiceAlert/All",
    {
      revalidate: 300,
      tags: ["service-alerts"],
    }
  );
}

// ─── Stop Departures ───────────────────────────────────────────────────────

export interface MetrolinxDeparture {
  VehicleNumber?: string;
  RouteCode: string;
  RouteName?: string;
  ScheduledDepartureTime: string; // ISO datetime or HH:MM
  ActualDepartureTime?: string;
  Status?: string; // "ON_TIME", "DELAYED", "CANCELLED"
  Destination?: string;
  Platform?: string;
}

export interface MetrolinxStopDeparturesResponse {
  NextService?: MetrolinxDeparture[];
  Departures?: MetrolinxDeparture[];
}

/**
 * Get upcoming departures for a GO stop.
 * @param stopCode  numeric GO stop code (from `/Stop/All`, e.g. "02359")
 *
 * NOTE: not verified against the live API — no UI currently consumes this.
 * The Open Data API exposes this as `/Stop/NextService/{code}`; there is no
 * `/Stop/Departure/{code}` resource.
 */
export async function getStopDepartures(stopCode: string): Promise<MetrolinxStopDeparturesResponse> {
  return metrolinxFetch<MetrolinxStopDeparturesResponse>(
    `/Stop/NextService/${encodeURIComponent(stopCode)}`,
    { revalidate: 60, tags: [`departures-${stopCode}`] }
  );
}

/**
 * Get the next scheduled service at a stop.
 * @param stopCode  numeric GO stop code (from `/Stop/All`, e.g. "02359")
 */
export async function getNextService(stopCode: string): Promise<MetrolinxStopDeparturesResponse> {
  return metrolinxFetch<MetrolinxStopDeparturesResponse>(
    `/Stop/NextService/${encodeURIComponent(stopCode)}`,
    { revalidate: 60, tags: [`next-service-${stopCode}`] }
  );
}

// ─── Stop Details ──────────────────────────────────────────────────────────

export interface MetrolinxStop {
  StopCode: string;
  Name: string;
  Latitude: number;
  Longitude: number;
  Routes?: Array<{ Code: string; Name: string }>;
}

export interface MetrolinxStopDetailsResponse {
  Stops?: MetrolinxStop[];
  Stop?: MetrolinxStop;
}

export async function getStopDetails(stopCode: string): Promise<MetrolinxStopDetailsResponse> {
  return metrolinxFetch<MetrolinxStopDetailsResponse>(
    `/Stop/Details/${encodeURIComponent(stopCode)}`,
    { revalidate: 3600 }
  );
}
