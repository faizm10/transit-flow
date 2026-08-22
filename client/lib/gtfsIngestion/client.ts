/**
 * Browser seam for the official GO Transit ingestion API.
 *
 * Today these hit stub routes that return mock data.
 * Later: same paths, real job queue + artifact storage behind them.
 */

import type {
  GtfsAdminSnapshot,
  StartIngestionRequest,
  StartIngestionResponse,
} from "./types";

async function readError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: string };
    if (body.error) return body.error;
  } catch {
    // ignore non-JSON
  }
  return `Request failed (${res.status})`;
}

export async function getGtfsAdminSnapshot(): Promise<GtfsAdminSnapshot> {
  const res = await fetch("/api/admin/gtfs");
  if (!res.ok) throw new Error(await readError(res));
  return (await res.json()) as GtfsAdminSnapshot;
}

export async function startIngestion(
  req: StartIngestionRequest
): Promise<StartIngestionResponse> {
  const res = await fetch("/api/admin/gtfs/ingest", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });
  if (!res.ok) throw new Error(await readError(res));
  return (await res.json()) as StartIngestionResponse;
}
