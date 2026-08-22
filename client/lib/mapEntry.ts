import type { RouteFilters } from "@/lib/gtfs";

/** Full GO network + custom routes (Explore filters apply). */
export function networkRouteFilters(): RouteFilters {
  return { goRouteShortNames: null, customRouteIds: null };
}
