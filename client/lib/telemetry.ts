export type TelemetryEventName =
  | "map_loaded"
  | "route_agent_requested"
  | "route_agent_completed"
  | "schedule_optimizer_requested"
  | "schedule_optimizer_completed"
  | "custom_route_saved";

type TelemetryPayload = {
  name: TelemetryEventName;
  metadata?: Record<string, unknown>;
};

export function trackEvent(name: TelemetryEventName, metadata?: Record<string, unknown>) {
  if (typeof window === "undefined") return;

  const body = JSON.stringify({
    name,
    metadata,
    path: window.location.pathname,
    timestamp: new Date().toISOString(),
  } satisfies TelemetryPayload & { path: string; timestamp: string });

  if (navigator.sendBeacon) {
    navigator.sendBeacon("/api/telemetry", body);
    return;
  }

  void fetch("/api/telemetry", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body,
    keepalive: true,
  }).catch(() => {
    // Telemetry should not block user flows.
  });
}
