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

/** Low-level fetch wrapper — adds API key header + timeout */
async function metrolinxFetch<T>(
  path: string,
  opts: { revalidate?: number; tags?: string[] } = {}
): Promise<T> {
  const url = `${BASE_URL}${path}`;
  const res = await fetch(url, {
    headers: {
      apiKey: apiKey(),
      Accept: "application/json",
    },
    next: {
      revalidate: opts.revalidate ?? 300,
      ...(opts.tags ? { tags: opts.tags } : {}),
    },
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    throw new Error(`Metrolinx API ${res.status} ${res.statusText} — ${url}`);
  }

  return res.json() as Promise<T>;
}

// ─── Service Alerts ────────────────────────────────────────────────────────

export interface MetrolinxServiceAlert {
  ID: string;
  Title: string;
  Description: string;
  StartDate: string;
  EndDate?: string;
  // Lines / affected routes — shape varies between API versions
  Lines?: Array<{ Code: string; Name: string }>;
  Line?: string;
  Type?: string; // "Delay", "Cancellation", "Information", etc.
}

export interface MetrolinxServiceAlertsResponse {
  Messages?: MetrolinxServiceAlert[];
  Alerts?: MetrolinxServiceAlert[];
  ServiceAlerts?: MetrolinxServiceAlert[];
}

export async function getServiceAlerts(): Promise<MetrolinxServiceAlertsResponse> {
  return metrolinxFetch<MetrolinxServiceAlertsResponse>("/ServiceAlert", {
    revalidate: 300,
    tags: ["service-alerts"],
  });
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
 * @param stopCode  5-digit GO stop code (e.g. "UN" for Union, "MI" for Mimico)
 */
export async function getStopDepartures(stopCode: string): Promise<MetrolinxStopDeparturesResponse> {
  return metrolinxFetch<MetrolinxStopDeparturesResponse>(
    `/Stop/Departure/${encodeURIComponent(stopCode)}`,
    { revalidate: 60, tags: [`departures-${stopCode}`] }
  );
}

/**
 * Get the next scheduled service at a stop.
 */
export async function getNextService(stopCode: string): Promise<MetrolinxStopDeparturesResponse> {
  return metrolinxFetch<MetrolinxStopDeparturesResponse>(
    `/Schedule/NextService/${encodeURIComponent(stopCode)}`,
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
