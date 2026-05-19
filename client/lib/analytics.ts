"use client";

/**
 * Thin wrapper around GA4 gtag() for custom event tracking.
 * Safe to call server-side — all functions are no-ops if window is undefined.
 */

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
  }
}

function gtag(...args: unknown[]) {
  if (typeof window !== "undefined" && typeof window.gtag === "function") {
    window.gtag(...args);
  }
}

// ── Map mode ───────────────────────────────────────────────────────────────

export type MapMode = "browse" | "design" | "schedule" | "simulate";

export function trackMapMode(mode: MapMode) {
  gtag("event", "map_mode_changed", { map_mode: mode });
}

// ── Simulation ─────────────────────────────────────────────────────────────

export function trackSimulationStart(params: {
  time: string;       // e.g. "05:00 AM"
  routeCount: number;
  tripCount: number;
}) {
  gtag("event", "simulation_started", {
    simulation_time: params.time,
    route_count: params.routeCount,
    trip_count: params.tripCount,
  });
}

// ── Route design ───────────────────────────────────────────────────────────

export function trackRouteSaved(params: {
  routeType: "bus" | "train";
  stopCount: number;
}) {
  gtag("event", "route_saved", {
    route_type: params.routeType,
    stop_count: params.stopCount,
  });
}

export function trackRouteShared(routeId: string) {
  gtag("event", "route_shared", { route_id: routeId });
}

// ── Community ──────────────────────────────────────────────────────────────

export function trackPostLiked(postId: string) {
  gtag("event", "post_liked", { post_id: postId });
}

export function trackRouteLoadedFromCommunity(postId: string) {
  gtag("event", "community_route_loaded", { post_id: postId });
}
