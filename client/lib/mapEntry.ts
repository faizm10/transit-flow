import type { RouteFilters } from "@/lib/gtfs";

/** How the map should show GO/custom lines before user tweaks Explore filters */
export type MapSessionPreset = "pending" | "fresh" | "network";

/**
 * Landing gate: bare /map until the user commits.
 * Fresh: hide all GO routes; still show saved custom routes.
 * Network: full GO network + custom routes (Explore filters apply).
 */
export function routeVisibilityFromSearch(sp: Pick<URLSearchParams, "get">): MapSessionPreset {
  const entry = sp.get("entry");
  if (entry === "fresh") return "fresh";
  if (entry === "network") return "network";

  const m = sp.get("mode");
  if (m && ["browse", "schedule", "simulate"].includes(m)) return "network";

  if (m === "build") {
    const d = sp.get("design");
    if (d === "new" || d === "stations") return "fresh";
    if (d === "extend" || sp.get("goRoute")?.trim()) return "network";
  }

  return "pending";
}

/** Full-screen welcome: only when URL has no mode (bare /map). */
export function showMapEntryLanding(sp: Pick<URLSearchParams, "get">): boolean {
  if (sp.get("mode")) return false;
  return routeVisibilityFromSearch(sp) === "pending";
}

export function freshRouteFilters(): RouteFilters {
  return { goRouteShortNames: [], customRouteIds: null };
}

export function networkRouteFilters(): RouteFilters {
  return { goRouteShortNames: null, customRouteIds: null };
}

export function pendingRouteFilters(): RouteFilters {
  return { goRouteShortNames: [], customRouteIds: [] };
}
