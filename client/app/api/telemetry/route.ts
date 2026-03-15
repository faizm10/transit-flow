import { NextRequest } from "next/server";
import {
  applyRateLimit,
  jsonError,
  jsonOk,
  normalizeString,
  readJsonBody,
} from "@/lib/server/api";

type TelemetryRequest = {
  name?: unknown;
  path?: unknown;
  timestamp?: unknown;
  metadata?: unknown;
};

export async function POST(request: NextRequest) {
  const limited = applyRateLimit(request, {
    bucket: "telemetry",
    limit: 80,
    windowMs: 60_000,
  });
  if (limited) return limited;

  const body = await readJsonBody<TelemetryRequest>(request, {
    maxBytes: 4096,
  });
  if (!body.ok) return body.response;

  const name = normalizeString(body.data.name, { maxLength: 64 });
  if (!name) {
    return jsonError(400, "Telemetry event name is required");
  }

  const path = normalizeString(body.data.path, { maxLength: 120 }) ?? "unknown";
  const timestamp =
    normalizeString(body.data.timestamp, { maxLength: 64 }) ?? new Date().toISOString();
  const metadata =
    body.data.metadata && typeof body.data.metadata === "object" && !Array.isArray(body.data.metadata)
      ? body.data.metadata
      : undefined;

  console.info("[telemetry]", {
    name,
    path,
    timestamp,
    metadata,
  });

  return jsonOk({ ok: true });
}
