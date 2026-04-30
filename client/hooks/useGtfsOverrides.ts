"use client";

import { useCallback, useEffect, useState } from "react";
import {
  type GtfsOverrides,
  type VariantStopTimesOverride,
  buildDeparturesKey,
  defaultGtfsOverrides,
  getDepartureOverridesForRouteDay,
  getStopTimesOverride,
  loadGtfsOverrides,
  normalizeTimes,
  saveGtfsOverrides,
} from "@/lib/gtfsOverrides";

export function useGtfsOverrides() {
  const [overrides, setOverrides] = useState<GtfsOverrides>(() => defaultGtfsOverrides());

  useEffect(() => {
    setOverrides(loadGtfsOverrides());
  }, []);

  const persist = useCallback((next: GtfsOverrides) => {
    setOverrides(next);
    saveGtfsOverrides(next);
  }, []);

  const setVariantStopTimesOverride = useCallback(
    (variantId: string, nextOverride: VariantStopTimesOverride | null) => {
      const next: GtfsOverrides = {
        ...overrides,
        stopTimesByVariantId: { ...overrides.stopTimesByVariantId },
      };
      if (!nextOverride) {
        delete next.stopTimesByVariantId[variantId];
      } else {
        next.stopTimesByVariantId[variantId] = nextOverride;
      }
      persist(next);
    },
    [overrides, persist],
  );

  const setDepartureOverride = useCallback(
    (args: { routeShortName: string; dayOfWeek: number; directionId: number; headsign: string }, times: string[]) => {
      const key = buildDeparturesKey(args);
      const next: GtfsOverrides = {
        ...overrides,
        departuresByKey: {
          ...overrides.departuresByKey,
          [key]: normalizeTimes(times),
        },
      };
      persist(next);
    },
    [overrides, persist],
  );

  const clearDepartureOverride = useCallback(
    (args: { routeShortName: string; dayOfWeek: number; directionId: number; headsign: string }) => {
      const key = buildDeparturesKey(args);
      const next: GtfsOverrides = {
        ...overrides,
        departuresByKey: { ...overrides.departuresByKey },
      };
      delete next.departuresByKey[key];
      persist(next);
    },
    [overrides, persist],
  );

  return {
    overrides,
    getStopTimesOverride: (variantId: string) => getStopTimesOverride(overrides, variantId),
    getDepartureOverridesForRouteDay: (routeShortName: string, dayOfWeek: number) =>
      getDepartureOverridesForRouteDay(overrides, routeShortName, dayOfWeek),
    setVariantStopTimesOverride,
    setDepartureOverride,
    clearDepartureOverride,
  };
}

