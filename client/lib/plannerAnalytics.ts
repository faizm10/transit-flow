import type { CustomRoute, Stop } from "@/hooks/useRouteBuilder";
import { getScheduleDirection, supportsBidirectionalSchedule } from "@/hooks/useRouteBuilder";
import {
  POPULATION_CENTERS,
  type PopulationCenter,
} from "@/lib/populationCenters";

export type FrequencyWarning = {
  routeId: string;
  routeName: string;
  message: string;
  severity: "info" | "warning";
};

export type CorridorDiagnostic = {
  label: string;
  routeCount: number;
};

export type NodeDiagnostic = {
  nodeName: string;
  routeCount: number;
  averageHeadwayMinutes: number | null;
  directDestinations: number;
};

export type PopulationCoverageItem = {
  id: string;
  name: string;
  population: number;
  serviceRadiusKm: number;
  served: boolean;
};

export type ScenarioSummary = {
  routeCount: number;
  stopCount: number;
  totalServiceHours: number;
  averageHeadwayMinutes: number | null;
  directConnections: number;
  trackedPopulation: number;
  citiesServed: number;
  populationServed: number;
  populationCoveragePercent: number;
  topServedCities: PopulationCoverageItem[];
  topUnservedCities: PopulationCoverageItem[];
  frequentRouteCount: number;
  warnings: FrequencyWarning[];
  topCorridors: CorridorDiagnostic[];
  topNodes: NodeDiagnostic[];
};

function toRad(value: number): number {
  return (value * Math.PI) / 180;
}

function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const radiusKm = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * radiusKm * Math.asin(Math.sqrt(h));
}

function normalizeStopName(value: string | undefined): string {
  return (value ?? "")
    .toUpperCase()
    .replace(/['.]/g, "")
    .replace(/[(),]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getEnabledFrequencyConfigs(route: CustomRoute) {
  return (["primary", "opposite"] as const).flatMap((direction) => {
    if (direction === "opposite" && !supportsBidirectionalSchedule(route)) return [];
    const directionSchedule = getScheduleDirection(route.schedule, direction);
    if (!directionSchedule || directionSchedule.type !== "frequency") return [];
    return Object.values(directionSchedule.dayConfigs ?? {}).filter((config) => config?.enabled);
  });
}

function getAverageHeadway(route: CustomRoute): number | null {
  const configs = getEnabledFrequencyConfigs(route);
  if (configs.length === 0) return null;
  const total = configs.reduce((sum, config) => sum + (config?.intervalMinutes ?? 0), 0);
  return Math.round(total / configs.length);
}

function getRepresentativeSpanMinutes(route: CustomRoute): number {
  if (!route.schedule) return 0;
  const fixedDepartures = (["primary", "opposite"] as const).flatMap((direction) => {
    if (direction === "opposite" && !supportsBidirectionalSchedule(route)) return [];
    const directionSchedule = getScheduleDirection(route.schedule, direction);
    return directionSchedule?.type === "fixed" ? directionSchedule.departures : [];
  });
  if (fixedDepartures.length > 0) {
    return fixedDepartures.length > 1 ? fixedDepartures.length * 15 : 0;
  }
  const configs = getEnabledFrequencyConfigs(route);
  if (configs.length === 0) return 0;
  const config = configs[0]!;
  const [startHours, startMinutes] = config.startTime.split(":").map(Number);
  const [endHours, endMinutes] = config.endTime.split(":").map(Number);
  return (endHours - startHours) * 60 + (endMinutes - startMinutes);
}

function getDailyTripEstimate(route: CustomRoute): number {
  if (!route.schedule) return 0;
  const fixedDepartures = (["primary", "opposite"] as const).flatMap((direction) => {
    if (direction === "opposite" && !supportsBidirectionalSchedule(route)) return [];
    const directionSchedule = getScheduleDirection(route.schedule, direction);
    return directionSchedule?.type === "fixed" ? directionSchedule.departures : [];
  });
  if (fixedDepartures.length > 0) return fixedDepartures.length;
  const configs = getEnabledFrequencyConfigs(route);
  if (configs.length === 0) return 0;
  const config = configs[0]!;
  const spanMinutes = getRepresentativeSpanMinutes(route);
  if (config.intervalMinutes <= 0) return 0;
  return Math.floor(spanMinutes / config.intervalMinutes);
}

function estimateRouteServiceHours(route: CustomRoute): number {
  const tripCount = getDailyTripEstimate(route);
  const tripDurationHours = (route.durationSeconds ?? 0) / 3600;
  return tripCount * tripDurationHours;
}

function buildWarnings(routes: CustomRoute[]): FrequencyWarning[] {
  const warnings: FrequencyWarning[] = [];

  routes.forEach((route) => {
    const averageHeadway = getAverageHeadway(route);
    if (averageHeadway && averageHeadway > 20) {
      warnings.push({
        routeId: route.id,
        routeName: route.name,
        message: `Average headway is ${averageHeadway} min.`,
        severity: "warning",
      });
    }

    const spanMinutes = getRepresentativeSpanMinutes(route);
    if (spanMinutes > 0 && spanMinutes < 12 * 60) {
      warnings.push({
        routeId: route.id,
        routeName: route.name,
        message: "Service span is short for an all-day corridor.",
        severity: "info",
      });
    }

    const weekendEnabled = (["primary", "opposite"] as const).some((direction) => {
      if (direction === "opposite" && !supportsBidirectionalSchedule(route)) return false;
      const directionSchedule = getScheduleDirection(route.schedule, direction);
      return (
        directionSchedule?.type === "frequency" &&
        (directionSchedule.dayConfigs?.saturday?.enabled || directionSchedule.dayConfigs?.sunday?.enabled)
      );
    });
    const hasFrequencyDirection = (["primary", "opposite"] as const).some((direction) => {
      if (direction === "opposite" && !supportsBidirectionalSchedule(route)) return false;
      const directionSchedule = getScheduleDirection(route.schedule, direction);
      return directionSchedule?.type === "frequency";
    });
    if (hasFrequencyDirection && !weekendEnabled) {
      warnings.push({
        routeId: route.id,
        routeName: route.name,
        message: "No weekend service configured.",
        severity: "warning",
      });
    }
  });

  return warnings.slice(0, 6);
}

function buildNodeDiagnostics(routes: CustomRoute[]): NodeDiagnostic[] {
  const nodeMap = new Map<
    string,
    {
      name: string;
      routeIds: Set<string>;
      destinations: Set<string>;
      headways: number[];
    }
  >();

  routes.forEach((route) => {
    const headway = getAverageHeadway(route);
    const destinationName = route.stops[route.stops.length - 1]?.name ?? route.name;
    route.stops.forEach((stop) => {
      const normalized = normalizeStopName(stop.name);
      if (!normalized) return;
      const existing = nodeMap.get(normalized) ?? {
        name: stop.name ?? normalized,
        routeIds: new Set<string>(),
        destinations: new Set<string>(),
        headways: [],
      };
      existing.routeIds.add(route.id);
      existing.destinations.add(destinationName);
      if (headway) existing.headways.push(headway);
      nodeMap.set(normalized, existing);
    });
  });

  return Array.from(nodeMap.values())
    .filter((node) => node.routeIds.size >= 2)
    .map((node) => ({
      nodeName: node.name,
      routeCount: node.routeIds.size,
      averageHeadwayMinutes:
        node.headways.length > 0
          ? Math.round(node.headways.reduce((sum, value) => sum + value, 0) / node.headways.length)
          : null,
      directDestinations: node.destinations.size,
    }))
    .sort((a, b) => b.routeCount - a.routeCount || b.directDestinations - a.directDestinations)
    .slice(0, 5);
}

function buildCorridorDiagnostics(routes: CustomRoute[]): CorridorDiagnostic[] {
  const corridorMap = new Map<string, Set<string>>();

  routes.forEach((route) => {
    for (let index = 0; index < route.stops.length - 1; index += 1) {
      const from = normalizeStopName(route.stops[index]?.name);
      const to = normalizeStopName(route.stops[index + 1]?.name);
      if (!from || !to) continue;
      const key = [from, to].sort().join(" ↔ ");
      const existing = corridorMap.get(key) ?? new Set<string>();
      existing.add(route.id);
      corridorMap.set(key, existing);
    }
  });

  return Array.from(corridorMap.entries())
    .filter(([, routeIds]) => routeIds.size >= 2)
    .map(([label, routeIds]) => ({
      label,
      routeCount: routeIds.size,
    }))
    .sort((a, b) => b.routeCount - a.routeCount)
    .slice(0, 5);
}

export function getPopulationCoverage(
  routes: CustomRoute[],
  populationCenters: PopulationCenter[] = POPULATION_CENTERS,
) {
  const servedCityIds = new Set<string>();

  routes.forEach((route) => {
    route.stops.forEach((stop: Stop) => {
      populationCenters.forEach((center) => {
        if (servedCityIds.has(center.id)) return;
        if (haversineKm(stop, center) <= center.serviceRadiusKm) {
          servedCityIds.add(center.id);
        }
      });
    });
  });

  const coverageByCity = populationCenters
    .map((center) => ({
      id: center.id,
      name: center.name,
      population: center.population,
      serviceRadiusKm: center.serviceRadiusKm,
      served: servedCityIds.has(center.id),
    }))
    .sort((a, b) => b.population - a.population);

  const populationServed = coverageByCity
    .filter((city) => city.served)
    .reduce((sum, city) => sum + city.population, 0);
  const trackedPopulation = populationCenters.reduce((sum, center) => sum + center.population, 0);

  return {
    trackedPopulation,
    citiesServed: servedCityIds.size,
    populationServed,
    populationCoveragePercent:
      trackedPopulation > 0
        ? Math.round((populationServed / trackedPopulation) * 1000) / 10
        : 0,
    topServedCities: coverageByCity.filter((city) => city.served).slice(0, 5),
    topUnservedCities: coverageByCity.filter((city) => !city.served).slice(0, 5),
    coverageByCity,
  };
}

export function summarizeScenario(
  routes: CustomRoute[],
  populationCenters: PopulationCenter[] = POPULATION_CENTERS,
): ScenarioSummary {
  const stopCount = routes.reduce((sum, route) => sum + route.stops.length, 0);
  const serviceHours = routes.reduce((sum, route) => sum + estimateRouteServiceHours(route), 0);
  const averageHeadways = routes
    .map((route) => getAverageHeadway(route))
    .filter((value): value is number => value != null);
  const directConnections = new Set(
    routes
      .filter((route) => route.stops.length >= 2)
      .map(
        (route) =>
          `${normalizeStopName(route.stops[0]?.name)}→${normalizeStopName(route.stops[route.stops.length - 1]?.name)}`,
      ),
  ).size;
  const populationCoverage = getPopulationCoverage(routes, populationCenters);

  return {
    routeCount: routes.length,
    stopCount,
    totalServiceHours: Math.round(serviceHours * 10) / 10,
    averageHeadwayMinutes:
      averageHeadways.length > 0
        ? Math.round(averageHeadways.reduce((sum, value) => sum + value, 0) / averageHeadways.length)
        : null,
    directConnections,
    trackedPopulation: populationCoverage.trackedPopulation,
    citiesServed: populationCoverage.citiesServed,
    populationServed: populationCoverage.populationServed,
    populationCoveragePercent: populationCoverage.populationCoveragePercent,
    topServedCities: populationCoverage.topServedCities,
    topUnservedCities: populationCoverage.topUnservedCities,
    frequentRouteCount: routes.filter((route) => {
      const headway = getAverageHeadway(route);
      return headway != null && headway <= 15;
    }).length,
    warnings: buildWarnings(routes),
    topCorridors: buildCorridorDiagnostics(routes),
    topNodes: buildNodeDiagnostics(routes),
  };
}

export function summarizeScenarioDelta(current: ScenarioSummary, baseline: ScenarioSummary | null) {
  if (!baseline) return null;
  return {
    routeDelta: current.routeCount - baseline.routeCount,
    serviceHourDelta: Math.round((current.totalServiceHours - baseline.totalServiceHours) * 10) / 10,
    populationServedDelta: current.populationServed - baseline.populationServed,
    directConnectionDelta: current.directConnections - baseline.directConnections,
  };
}
export { POPULATION_CENTERS } from "@/lib/populationCenters";
