"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import MapboxDraw from "@mapbox/mapbox-gl-draw";
import "@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css";
import { GitHubLogoIcon } from "@radix-ui/react-icons";
import { RouteBuilder } from "@/components/RouteBuilder";
import {
  getSavedCustomRoutes,
  buildSimulationTripsFromCustomRoute,
} from "@/hooks/useRouteBuilder";

type SimulationTrip = {
  trip_id: string;
  route_short_name: string;
  route_long_name: string;
  route_type: string;
  direction_id: number;
  source: "gotransit" | "union-pearson" | "custom";
  stops: Array<{ t: number; lat: number; lon: number; shapeIndex: number | null }>;
  shape: Array<{ lat: number; lon: number }>;
  start_stop_name: string;
  end_stop_name: string;
  start_time: number | null;
  end_time: number | null;
  color?: string;
};

function parseShortTime(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parts = trimmed.split(":");
  if (parts.length < 2) return null;
  const hours = Number(parts[0]);
  const minutes = Number(parts[1]);
  if ([hours, minutes].some((part) => Number.isNaN(part))) {
    return null;
  }
  return hours * 3600 + minutes * 60;
}

function formatShortTime(seconds: number): string {
  const totalMinutes = Math.floor(seconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function normalizeStopKey(value: string): string {
  return value
    .toUpperCase()
    .replace(/['.]/g, "")
    .replace(/[(),]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const MAJOR_STOP_NAME_FRAGMENTS = [
  "SPORTSWORLD DR @ HWY 8 PARK & RIDE",
  "CAMBRIDGE SMART CENTRE",
  "HESPELER RD @ PINEBUSH RD",
  "BROCK RD @ MCLEAN RD ABERFOYLE PARK & RIDE",
  "REGIONAL RD 25 @ HWY 401 PARK & RIDE",
  "WINSTON CHURCHILL TRANSITWAY STATION",
  "ERIN MILLS TRANSITWAY STATION",
  "SQUARE ONE",
  "MILTON GO BUS",
  "FINCH BUS TERMINAL",
  "MEADOWVALE BUS TERMINAL",
  "MOUNT PLEASANT GO BUS",
  "GEORGETOWN GO BUS",
  "RAILWAY ST @ ALBERT ST",
  "OLD ELM GO BUS",
  "UNION STATION",
  "SHOPPERS WORLD",
];

function shouldShowMajorStop(
  stopName: string,
  routeShortName: string,
  routeType: string,
): boolean {
  const normalizedName = normalizeStopKey(stopName);
  const routeNumber = routeShortName.trim().match(/\d{1,3}/)?.[0] ?? "";

  if (routeType === "2") return true; // Show all GO train stations.
  if (["94", "52", "12", "11"].includes(routeNumber)) return true;
  if (normalizedName.includes("UNIVERSITY")) return true;
  if (normalizedName.includes("BUS STATION") || normalizedName.includes("BUS TERMINAL")) {
    return true;
  }
  if (normalizedName.includes(" GO ") && normalizedName.includes(" STATION")) return true;

  return MAJOR_STOP_NAME_FRAGMENTS.some((fragment) =>
    normalizedName.includes(fragment),
  );
}

export default function MapPage() {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const [unionPearsonShapes, setUnionPearsonShapes] =
    useState<GeoJSON.FeatureCollection | null>(null);
  const [showUnionPearson, setShowUnionPearson] = useState(true);
  const hasFitUnionPearson = useRef(false);
  const [mapReady, setMapReady] = useState(false);
  const [goRoutes, setGoRoutes] = useState<
    Array<{
      route_id: string;
      route_short_name: string;
      route_long_name: string;
      route_type: number | string;
    }>
  >([]);
  const [goVariantsIndex, setGoVariantsIndex] = useState<
    Record<
      string,
      Array<{
        variant_id: string;
        label: string;
        route_id: string;
        direction_id: number;
        shape_id: string | null;
        trip_count: number;
        representative_trip_id: string;
        route_variant: string;
      }>
    >
  >({});
  const [goVariantLines, setGoVariantLines] =
    useState<GeoJSON.FeatureCollection | null>(null);
  const [goVariantStops, setGoVariantStops] = useState<
    Record<
      string,
      Array<{
        stop_id: string;
        stop_name: string;
        stop_lat: number | null;
        stop_lon: number | null;
        stop_sequence: number;
      }>
    > | null
  >(null);
  const [showGoBuses, setShowGoBuses] = useState(true);
  const [showGoTrains, setShowGoTrains] = useState(true);
  const [showGoTransit, setShowGoTransit] = useState(true);
  const [selectedVariantIds, setSelectedVariantIds] = useState<string[]>([]);
  const [goVariantFilterText, setGoVariantFilterText] = useState("");
  const [showRouteFilters, setShowRouteFilters] = useState(false);
  const [showTimeSimulation, setShowTimeSimulation] = useState(false);
  const [showRouteBuilder, setShowRouteBuilder] = useState(false);
  const [showCustomNetwork, setShowCustomNetwork] = useState(true);
  const [savedCustomRoutes, setSavedCustomRoutes] = useState(() =>
    typeof window !== "undefined" ? getSavedCustomRoutes() : []
  );
  const [selectedCustomRouteIds, setSelectedCustomRouteIds] = useState<string[]>([]);
  const [buildingRouteGeometry, setBuildingRouteGeometry] = useState<GeoJSON.LineString | null>(null);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ routeId?: string }>).detail;
      setSavedCustomRoutes(getSavedCustomRoutes());
      // Auto-add newly saved custom route to time simulation selection
      if (detail?.routeId) {
        const customValue = `custom:${detail.routeId}`;
        setSimulationRoutes((prev) =>
          prev.includes(customValue) ? prev : [...prev, customValue]
        );
        if (showCustomNetwork) {
          setSelectedCustomRouteIds((prev) =>
            prev.includes(detail.routeId!) ? prev : [...prev, detail.routeId!]
          );
        }
      }
    };
    window.addEventListener("route-builder-saved", handler);
    return () => window.removeEventListener("route-builder-saved", handler);
  }, [showCustomNetwork]);

  // When custom network is on and we have saved routes but none selected, default to all
  useEffect(() => {
    if (
      showCustomNetwork &&
      selectedCustomRouteIds.length === 0 &&
      savedCustomRoutes.length > 0
    ) {
      const withGeometry = savedCustomRoutes.filter(
        (r) => r.stops.length >= 2 && r.geometry
      );
      if (withGeometry.length > 0) {
        setSelectedCustomRouteIds(withGeometry.map((r) => r.id));
      }
    }
  }, [showCustomNetwork, savedCustomRoutes]);
  const hasInitializedGoVariants = useRef(false);
  const [simulationDate, setSimulationDate] = useState(() => {
    const now = new Date();
    return now.toISOString().slice(0, 10);
  });
  const [simulationRoutes, setSimulationRoutes] = useState<string[]>(["21"]);
  const [simulationStart, setSimulationStart] = useState("04:00");
  const [simulationEnd, setSimulationEnd] = useState("08:00");
  const [simulationCurrent, setSimulationCurrent] = useState(0);
  const [simulationTrips, setSimulationTrips] = useState<SimulationTrip[]>([]);
  const [simulationLoading, setSimulationLoading] = useState(false);
  const [simulationError, setSimulationError] = useState<string | null>(null);
  const [simulationPlaying, setSimulationPlaying] = useState(false);
  const [simulationSpeed, setSimulationSpeed] = useState(60);
  const [focusedSimulationTripId, setFocusedSimulationTripId] = useState<string | null>(null);
  const [includeUpxInSimulation, setIncludeUpxInSimulation] = useState(true);
  const animationFrame = useRef<number | null>(null);
  const lastFrameTime = useRef<number | null>(null);
  const lastFollowCameraUpdate = useRef<number>(0);

  // Update GO Transit layer visibility and filters
  useEffect(() => {
    if (!map.current || !map.current.isStyleLoaded()) return;

    const visibleRouteTypes = [];
    if (showGoBuses) visibleRouteTypes.push("3");
    if (showGoTrains) visibleRouteTypes.push("2");

    const routeTypeFilter: mapboxgl.Expression =
      visibleRouteTypes.length > 0
        ? ["in", ["get", "route_type"], ["literal", visibleRouteTypes]]
        : ["in", ["get", "route_type"], ""];

    const hasVariantSelection = hasInitializedGoVariants.current;
    const variantFilter: mapboxgl.Expression = [
      "all",
      routeTypeFilter,
      hasVariantSelection
        ? selectedVariantIds.length > 0
          ? ["in", ["get", "variant_id"], ["literal", selectedVariantIds]]
          : ["in", ["get", "variant_id"], ""]
        : ["has", "variant_id"],
    ];

    const routesLayer = "go-transit-routes-layer";
    if (map.current.getLayer(routesLayer)) {
      map.current.setFilter(routesLayer, variantFilter);
    }

    if (map.current.getLayer("go-transit-stops-layer")) {
      map.current.setFilter("go-transit-stops-layer", variantFilter);
    }
  }, [showGoBuses, showGoTrains, selectedVariantIds]);

  // Fetch Union Pearson Express shapes
  useEffect(() => {
    const fetchUnionPearsonShapes = async () => {
      try {
        const response = await fetch("/api/union-pearson");
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data: GeoJSON.FeatureCollection = await response.json();
        setUnionPearsonShapes(data);
      } catch (error) {
        console.error("Failed to fetch Union Pearson shapes:", error);
      }
    };
    fetchUnionPearsonShapes();
  }, []);

  useEffect(() => {
    const fetchRoutes = async () => {
      try {
        const response = await fetch("/gotransit/derived/routes_index.json");
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        setGoRoutes(data);
      } catch (error) {
        console.error("Failed to fetch GO routes index:", error);
      }
    };
    fetchRoutes();
  }, []);

  useEffect(() => {
    const fetchVariants = async () => {
      try {
        const response = await fetch("/gotransit/derived/variants_index.json");
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        setGoVariantsIndex(data);
      } catch (error) {
        console.error("Failed to fetch GO variants index:", error);
      }
    };
    fetchVariants();
  }, []);

  useEffect(() => {
    const fetchVariantLines = async () => {
      try {
        const response = await fetch("/gotransit/derived/variant_lines.geojson");
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data: GeoJSON.FeatureCollection = await response.json();
        setGoVariantLines(data);
      } catch (error) {
        console.error("Failed to fetch GO variant lines:", error);
      }
    };
    fetchVariantLines();
  }, []);

  useEffect(() => {
    const fetchVariantStops = async () => {
      try {
        const response = await fetch("/gotransit/derived/variant_stops.json");
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        setGoVariantStops(data);
      } catch (error) {
        console.error("Failed to fetch GO variant stops:", error);
      }
    };
    fetchVariantStops();
  }, []);

  const routeById = useMemo(() => {
    const map = new Map<string, (typeof goRoutes)[number]>();
    goRoutes.forEach((route) => map.set(route.route_id, route));
    return map;
  }, [goRoutes]);

  const routeByShortName = useMemo(() => {
    const map = new Map<string, (typeof goRoutes)[number]>();
    goRoutes.forEach((route) => {
      if (!map.has(route.route_short_name)) {
        map.set(route.route_short_name, route);
      }
    });
    return map;
  }, [goRoutes]);

  const busRoutes = useMemo(() => {
    return goRoutes
      .filter((route) => String(route.route_type) === "3")
      .map((route) => route.route_short_name)
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b));
  }, [goRoutes]);

  const simulationRouteOptions = useMemo(() => {
    const trainCodes = goRoutes
      .filter((route) => String(route.route_type) === "2")
      .map((route) => route.route_short_name)
      .filter(Boolean);
    const requestedTrainCodes = ["KI", "LW", "LE", "BR", "ST", "RH", "MI"];
    const goOptions = Array.from(
      new Set([...busRoutes, ...trainCodes, ...requestedTrainCodes]),
    )
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
      .map((v) => ({ value: v, label: v }));
    const customOptions = savedCustomRoutes
      .filter((r) => r.stops.length >= 2 && r.geometry && r.durationSeconds)
      .map((r) => ({ value: `custom:${r.id}`, label: `★ ${r.name}` }));
    return [...customOptions, ...goOptions].sort((a, b) => {
      const aCustom = a.value.startsWith("custom:");
      const bCustom = b.value.startsWith("custom:");
      if (aCustom && !bCustom) return -1;
      if (!aCustom && bCustom) return 1;
      return a.label.localeCompare(b.label, undefined, { numeric: true });
    });
  }, [busRoutes, goRoutes, savedCustomRoutes]);

  const variantLookup = useMemo(() => {
    const map = new Map<
      string,
      {
        route_short_name: string;
        route_id: string;
        label: string;
        route_variant: string;
      }
    >();
    Object.entries(goVariantsIndex).forEach(([routeShortName, variants]) => {
      variants.forEach((variant) => {
        map.set(variant.variant_id, {
          route_short_name: routeShortName,
          route_id: variant.route_id,
          label: variant.label,
          route_variant: variant.route_variant,
        });
      });
    });
    return map;
  }, [goVariantsIndex]);

  const colorForRoute = useCallback((routeShortName: string) => {
    const normalized = routeShortName.trim().toUpperCase();
    const routeColors: Record<string, string> = {
      "LAKESHORE WEST": "#991b1b",
      LW: "#991b1b",
      "01": "#991b1b",
      "11": "#991b1b",
      "15": "#991b1b",
      "16": "#991b1b",
      "18": "#991b1b",
      "LAKESHORE EAST": "#ef4444",
      LE: "#ef4444",
      "09": "#ef4444",
      "88": "#ef4444",
      "90": "#ef4444",
      "92": "#ef4444",
      "96": "#ef4444",
      KITCHENER: "#16a34a",
      "KITCHENER LINE": "#16a34a",
      "31": "#16a34a",
      "32": "#16a34a",
      "33": "#16a34a",
      "30": "#16a34a",
      "36": "#16a34a",
      "37": "#16a34a",
      "38": "#16a34a",
      "29": "#16a34a",
      "40": "#a855f7",
      "41": "#a855f7",
      "47": "#a855f7",
      "94": "#a855f7",
      "48": "#ec4899",
      "50": "#a855f7",
      "51": "#a855f7",
      "52": "#a855f7",
      "53": "#a855f7",
      "54": "#a855f7",
      "55": "#a855f7",
      "56": "#a855f7",
      "57": "#a855f7",
      "58": "#a855f7",
      "59": "#a855f7",
      "61": "#0ea5e9",
      "RICHMOND HILL": "#0ea5e9",
      BARRIE: "#2563eb",
      "BARRIE LINE": "#2563eb",
      "65": "#2563eb",
      "68": "#2563eb",
      "22": "#f59e0b",
      "17": "#f59e0b",
      "25": "#f59e0b",
      "27": "#f59e0b",
      MILTON: "#f59e0b",
      "21": "#f59e0b",
      STOUFFVILLE: "#8b5a2b",
      "STOUFFVILLE LINE": "#8b5a2b",
      "70": "#8b5a2b",
      "71": "#8b5a2b",
    };

    if (routeColors[normalized]) {
      return routeColors[normalized];
    }

    // Handle variant labels like "31A", "31 KITCHENER", or "KI - ..."
    if (normalized.includes("KITCHENER") || normalized === "KI" || normalized.startsWith("31")) {
      return "#16a34a";
    }
    if (normalized.includes("MILTON") || normalized === "MI" || normalized.startsWith("21")) {
      return "#f59e0b";
    }
    const routeNumberMatch = normalized.match(/\d{1,3}/);
    if (routeNumberMatch && routeColors[routeNumberMatch[0]]) {
      return routeColors[routeNumberMatch[0]];
    }

    let hash = 0;
    for (let i = 0; i < normalized.length; i += 1) {
      hash = (hash * 31 + normalized.charCodeAt(i)) % 360;
    }
    return `hsl(${hash}, 70%, 45%)`;
  }, []);

  const displayVariantLines = useMemo(() => {
    if (!goVariantLines) return null;
    return {
      type: "FeatureCollection",
      features: goVariantLines.features.map((feature) => {
        const props = feature.properties as Record<string, string>;
        const routeId = props.route_id || "";
        const routeShortName = props.route_short_name || "";
        const routeInfo = routeById.get(routeId);
        const routeType = routeInfo ? String(routeInfo.route_type) : "";
        const routeColor = colorForRoute(routeShortName || routeId);
        return {
          ...feature,
          properties: {
            ...props,
            route_type: routeType,
            route_color: routeColor,
          },
        } as GeoJSON.Feature;
      }),
    } as GeoJSON.FeatureCollection;
  }, [goVariantLines, routeById, colorForRoute]);

  const allVariantIds = useMemo(() => {
    const ids: string[] = [];
    Object.values(goVariantsIndex).forEach((variants) => {
      variants.forEach((variant) => ids.push(variant.variant_id));
    });
    return ids;
  }, [goVariantsIndex]);

  useEffect(() => {
    if (!hasInitializedGoVariants.current && allVariantIds.length > 0) {
      setSelectedVariantIds(allVariantIds);
      hasInitializedGoVariants.current = true;
    }
  }, [allVariantIds]);

  useEffect(() => {
    const selectedRoutes = simulationRoutes.map((route) => route.trim()).filter(Boolean);
    if (selectedRoutes.length === 0) {
      setSelectedVariantIds([]);
      return;
    }

    const goRoutesOnly = selectedRoutes.filter((r) => !r.startsWith("custom:"));
    const variantIds = goRoutesOnly.flatMap(
      (route) => (goVariantsIndex[route] || []).map((variant) => variant.variant_id),
    );
    const uniqueVariantIds = Array.from(new Set(variantIds));
    setSelectedVariantIds((prev) => {
      if (
        prev.length === uniqueVariantIds.length &&
        prev.every((id, index) => id === uniqueVariantIds[index])
      ) {
        return prev;
      }
      return uniqueVariantIds;
    });
  }, [simulationRoutes, goVariantsIndex]);

  // Helper function to check if two stop sequences are reversed
  const areStopsReversed = useCallback(
    (stops1: Array<{ stop_id: string }>, stops2: Array<{ stop_id: string }>) => {
      if (!stops1 || !stops2 || stops1.length === 0 || stops2.length === 0) {
        return false;
      }
      
      // If lengths don't match, they can't be exact reverses, but check if one is contained in the reverse of the other
      if (stops1.length !== stops2.length) {
        // Check if the shorter sequence matches the reverse of the longer one
        const shorter = stops1.length < stops2.length ? stops1 : stops2;
        const longer = stops1.length >= stops2.length ? stops1 : stops2;
        const reversedLonger = [...longer].reverse();
        
        // Check if shorter sequence matches the start or end of reversed longer sequence
        let matchesStart = true;
        let matchesEnd = true;
        for (let i = 0; i < shorter.length; i += 1) {
          if (shorter[i].stop_id !== reversedLonger[i]?.stop_id) {
            matchesStart = false;
          }
          if (shorter[i].stop_id !== reversedLonger[reversedLonger.length - shorter.length + i]?.stop_id) {
            matchesEnd = false;
          }
        }
        return matchesStart || matchesEnd;
      }
      
      // Check if stops1 reversed equals stops2 (exact match)
      for (let i = 0; i < stops1.length; i += 1) {
        if (stops1[i]?.stop_id !== stops2[stops2.length - 1 - i]?.stop_id) {
          return false;
        }
      }
      return true;
    },
    [],
  );

  // Helper function to create a better name for merged bidirectional routes
  const createMergedRouteName = useCallback(
    (
      stops1: Array<{ stop_name: string }>,
      stops2: Array<{ stop_name: string }>,
    ) => {
      if (!stops1 || !stops2 || stops1.length === 0 || stops2.length === 0) {
        return "";
      }

      const getStopShortName = (fullName: string): string => {
        if (!fullName) return "";
        // Extract key parts of stop names
        // e.g., "Union Station" -> "Union", "Mount Pleasant GO" -> "Mount Pleasant"
        const name = fullName.toLowerCase().trim();
        
        // Common stop name patterns
        if (name.includes("union")) return "Union";
        if (name.includes("mount pleasant")) return "Mount Pleasant";
        if (name.includes("bramalea")) return "Bramalea";
        if (name.includes("brampton")) return "Brampton";
        if (name.includes("kitchener")) return "Kitchener";
        if (name.includes("guelph")) return "Guelph";
        if (name.includes("georgetown")) return "Georgetown";
        if (name.includes("acton")) return "Acton";
        if (name.includes("milton")) return "Milton";
        if (name.includes("oakville")) return "Oakville";
        if (name.includes("burlington")) return "Burlington";
        if (name.includes("hamilton")) return "Hamilton";
        if (name.includes("stouffville")) return "Stouffville";
        if (name.includes("richmond hill")) return "Richmond Hill";
        if (name.includes("barrie")) return "Barrie";
        if (name.includes("allandale")) return "Allandale";
        
        // Remove common suffixes
        let cleaned = fullName
          .replace(/\s+GO\s*$/i, "")
          .replace(/\s+Station\s*$/i, "")
          .replace(/\s+Stop\s*$/i, "")
          .trim();
        
        // If still long, take first 2 words max
        const words = cleaned.split(/\s+/);
        if (words.length > 2) {
          return words.slice(0, 2).join(" ");
        }
        return cleaned || fullName;
      };

      const start1 = getStopShortName(stops1[0]?.stop_name || "");
      const end1 = getStopShortName(stops1[stops1.length - 1]?.stop_name || "");
      const start2 = getStopShortName(stops2[0]?.stop_name || "");
      const end2 = getStopShortName(stops2[stops2.length - 1]?.stop_name || "");

      // Use the first direction's stops for naming (stops1)
      // Format: "Start - End"
      const name = `${start1} - ${end1}`;

      // Check if it's an express route (fewer stops than typical)
      // Typical routes have 6+ stops, express routes have 5 or fewer
      const isExpress = stops1.length <= 5 || stops2.length <= 5;
      const expressSuffix = isExpress ? " (Express)" : "";

      return name + expressSuffix;
    },
    [],
  );

  const groupedGoVariants = useMemo(() => {
    const term = goVariantFilterText.trim().toLowerCase();
    return Object.entries(goVariantsIndex)
      .map(([routeShortName, variants]) => {
        const routeInfo = routeByShortName.get(routeShortName);
        const isTrain = routeInfo && String(routeInfo.route_type) === "2";

        // For trains, try to merge bidirectional routes
        if (isTrain && goVariantStops) {
          const merged = new Map<
            string,
            {
              displayKey: string;
              variantIds: string[];
              labels: string[];
            }
          >();
          const processed = new Set<string>();

          // Try to find and merge bidirectional pairs across all variants
          // Look for pairs with different direction_ids that have reversed stops
          const dir0 = variants.filter((v) => v.direction_id === 0);
          const dir1 = variants.filter((v) => v.direction_id === 1);

          // Try to find matching pairs
          for (const v0 of dir0) {
            if (processed.has(v0.variant_id)) continue;

            for (const v1 of dir1) {
              if (processed.has(v1.variant_id)) continue;

              const stops0 = goVariantStops[v0.variant_id] || [];
              const stops1 = goVariantStops[v1.variant_id] || [];

              if (areStopsReversed(stops0, stops1)) {
                // Found a bidirectional match - merge them
                const mergedName = createMergedRouteName(stops0, stops1);
                const displayKey = mergedName || routeShortName;

                const haystack = `${routeShortName} ${displayKey} ${v0.label} ${v1.label}`
                  .trim()
                  .toLowerCase();
                if (term && !haystack.includes(term)) {
                  processed.add(v0.variant_id);
                  processed.add(v1.variant_id);
                  continue;
                }

                merged.set(displayKey, {
                  displayKey,
                  variantIds: [v0.variant_id, v1.variant_id],
                  labels: [v0.label, v1.label].filter(Boolean),
                });
                processed.add(v0.variant_id);
                processed.add(v1.variant_id);
                break; // Found a match for v0, move to next
              }
            }
          }

          // Add unmerged variants
          variants.forEach((variant) => {
            if (processed.has(variant.variant_id)) return;

            // For unmerged variants, create a display key based on stops if available
            let displayKey = variant.route_variant || variant.variant_id || routeShortName;
            
            // Try to create a better name from stops if available
            const stops = goVariantStops[variant.variant_id];
            if (stops && stops.length > 0) {
              const firstStop = stops[0]?.stop_name || "";
              const lastStop = stops[stops.length - 1]?.stop_name || "";
              if (firstStop && lastStop) {
                const getStopShortName = (fullName: string): string => {
                  if (!fullName) return "";
                  const name = fullName.toLowerCase().trim();
                  if (name.includes("union")) return "Union";
                  if (name.includes("mount pleasant")) return "Mount Pleasant";
                  if (name.includes("bramalea")) return "Bramalea";
                  if (name.includes("brampton")) return "Brampton";
                  if (name.includes("kitchener")) return "Kitchener";
                  if (name.includes("guelph")) return "Guelph";
                  if (name.includes("georgetown")) return "Georgetown";
                  if (name.includes("acton")) return "Acton";
                  if (name.includes("milton")) return "Milton";
                  if (name.includes("oakville")) return "Oakville";
                  if (name.includes("burlington")) return "Burlington";
                  if (name.includes("hamilton")) return "Hamilton";
                  if (name.includes("stouffville")) return "Stouffville";
                  if (name.includes("richmond hill")) return "Richmond Hill";
                  if (name.includes("barrie")) return "Barrie";
                  if (name.includes("allandale")) return "Allandale";
                  let cleaned = fullName
                    .replace(/\s+GO\s*$/i, "")
                    .replace(/\s+Station\s*$/i, "")
                    .replace(/\s+Stop\s*$/i, "")
                    .trim();
                  const words = cleaned.split(/\s+/);
                  if (words.length > 2) {
                    return words.slice(0, 2).join(" ");
                  }
                  return cleaned || fullName;
                };
                const start = getStopShortName(firstStop);
                const end = getStopShortName(lastStop);
                if (start && end) {
                  const isExpress = stops.length <= 5;
                  displayKey = `${start} - ${end}${isExpress ? " (Express)" : ""}`;
                }
              }
            }
            
            const haystack = `${routeShortName} ${displayKey} ${variant.label}`
              .trim()
              .toLowerCase();
            if (term && !haystack.includes(term)) return;

            if (!merged.has(displayKey)) {
              merged.set(displayKey, {
                displayKey,
                variantIds: [],
                labels: [],
              });
            }
            const entry = merged.get(displayKey)!;
            entry.variantIds.push(variant.variant_id);
            if (variant.label) {
              entry.labels.push(variant.label);
            }
          });

          const items = Array.from(merged.values()).sort((a, b) =>
            a.displayKey.localeCompare(b.displayKey),
          );
          return { routeShortName, items };
        }

        // For non-trains or when stops data isn't available, use original logic
        const grouped = new Map<
          string,
          {
            displayKey: string;
            variantIds: string[];
            labels: string[];
          }
        >();

        variants.forEach((variant) => {
          const displayKey =
            variant.route_variant || variant.variant_id || routeShortName;
          const haystack = `${routeShortName} ${displayKey} ${variant.label}`
            .trim()
            .toLowerCase();
          if (term && !haystack.includes(term)) return;

          if (!grouped.has(displayKey)) {
            grouped.set(displayKey, {
              displayKey,
              variantIds: [],
              labels: [],
            });
          }
          const entry = grouped.get(displayKey)!;
          entry.variantIds.push(variant.variant_id);
          if (variant.label) {
            entry.labels.push(variant.label);
          }
        });

        const items = Array.from(grouped.values()).sort((a, b) =>
          a.displayKey.localeCompare(b.displayKey),
        );
        return { routeShortName, items };
      })
      .filter((group) => group.items.length > 0)
      .sort((a, b) => a.routeShortName.localeCompare(b.routeShortName));
  }, [
    goVariantsIndex,
    goVariantFilterText,
    goVariantStops,
    routeByShortName,
    areStopsReversed,
    createMergedRouteName,
  ]);

  const toggleVariant = (variantId: string) => {
    setSelectedVariantIds((prev) =>
      prev.includes(variantId)
        ? prev.filter((id) => id !== variantId)
        : [...prev, variantId],
    );
  };

  const setVariantGroup = (variantIds: string[], enabled: boolean) => {
    setSelectedVariantIds((prev) => {
      if (enabled) {
        return Array.from(new Set([...prev, ...variantIds]));
      }
      return prev.filter((id) => !variantIds.includes(id));
    });
  };

  const ensureUnionPearsonLayers = useCallback(() => {
    if (!map.current) return;

    // Add source for Union Pearson Express route line
    if (!map.current.getSource("union-pearson-express")) {
      map.current.addSource("union-pearson-express", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      console.log("[UPX] Route line source added");
    }

    // Add layer for Union Pearson Express route line
    if (!map.current.getLayer("union-pearson-express-layer")) {
      map.current.addLayer({
        id: "union-pearson-express-layer",
        type: "line",
        source: "union-pearson-express",
        paint: {
          "line-color": "#0ea5e9",
          "line-width": [
            "interpolate",
            ["linear"],
            ["zoom"],
            8,
            2,
            12,
            4,
            15,
            6,
          ],
          "line-opacity": 0.8,
        },
      });
      console.log("[UPX] Route line layer added");
    }

  }, []);

  const ensureGOTransitLayers = useCallback(() => {
    if (!map.current) return;

    // Add source for GO Transit routes
    if (!map.current.getSource("go-transit-routes")) {
      map.current.addSource("go-transit-routes", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      console.log("[GO] Routes source added");
    }

    // Add layer for GO Transit routes
    if (!map.current.getLayer("go-transit-routes-layer")) {
      map.current.addLayer({
        id: "go-transit-routes-layer",
        type: "line",
        source: "go-transit-routes",
        paint: {
          "line-color": ["get", "route_color"],
          "line-width": [
            "interpolate",
            ["linear"],
            ["zoom"],
            8,
            2,
            12,
            4,
            15,
            6,
          ],
          "line-opacity": 0.85,
        },
      });
      console.log("[GO] Routes layer added");
    }

    if (!map.current.getSource("go-transit-stops")) {
      map.current.addSource("go-transit-stops", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
    }

    if (!map.current.getLayer("go-transit-stops-layer")) {
      map.current.addLayer({
        id: "go-transit-stops-layer",
        type: "circle",
        source: "go-transit-stops",
        paint: {
          "circle-radius": [
            "interpolate",
            ["linear"],
            ["zoom"],
            8,
            3,
            12,
            6,
            15,
            8,
          ],
          "circle-color": "#0f172a",
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 1.5,
          "circle-opacity": 0.9,
        },
      });
    }

  }, []);

  const ensureCustomRoutesLayers = useCallback(() => {
    if (!map.current) return;
    if (!map.current.getSource("custom-routes")) {
      map.current.addSource("custom-routes", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
    }
    if (!map.current.getLayer("custom-routes-layer")) {
      map.current.addLayer({
        id: "custom-routes-layer",
        type: "line",
        source: "custom-routes",
        paint: {
          "line-color": ["get", "route_color"],
          "line-width": 4,
          "line-opacity": 0.9,
        },
      });
    }
  }, []);

  const ensureSimulationLayer = useCallback(() => {
    if (!map.current) return;
    if (!map.current.getSource("simulation-vehicles")) {
      map.current.addSource("simulation-vehicles", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
    }
    if (!map.current.getLayer("simulation-vehicles-layer")) {
      map.current.addLayer({
        id: "simulation-vehicles-layer",
        type: "circle",
        source: "simulation-vehicles",
        paint: {
          "circle-radius": [
            "interpolate",
            ["linear"],
            ["zoom"],
            8,
            4,
            12,
            7,
            15,
            10,
          ],
          "circle-color": ["get", "color"],
          "circle-stroke-color": "#0b0f19",
          "circle-stroke-width": 1,
          "circle-opacity": 0.95,
        },
      });
    }
  }, []);

  useEffect(() => {
    if (map.current || !mapContainer.current) return;

    const token = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;
    if (!token) {
      console.error("Missing NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN for Mapbox");
      return;
    }

    mapboxgl.accessToken = token;
    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: "mapbox://styles/mapbox/streets-v12",
      center: [-79.3832, 43.6532],
      zoom: 10,
    });

    map.current.addControl(new mapboxgl.NavigationControl(), "bottom-right");
    map.current.addControl(
      new MapboxDraw({
        displayControlsDefault: false,
        controls: { polygon: true, trash: true },
      }),
      "top-left",
    );

    const handleStyleLoad = () => {
      ensureUnionPearsonLayers();
      ensureGOTransitLayers();
      ensureCustomRoutesLayers();
      ensureSimulationLayer();
      setMapReady(true);
    };

    map.current.on("style.load", handleStyleLoad);

    return () => {
      map.current?.off("style.load", handleStyleLoad);
      map.current?.remove();
      map.current = null;
      setMapReady(false);
    };
  }, [ensureUnionPearsonLayers, ensureGOTransitLayers, ensureCustomRoutesLayers, ensureSimulationLayer]);

  // Update Union Pearson Express layer visibility
  useEffect(() => {
    if (map.current && map.current.isStyleLoaded()) {
      if (map.current.getLayer("union-pearson-express-layer")) {
        map.current.setLayoutProperty(
          "union-pearson-express-layer",
          "visibility",
          showUnionPearson ? "visible" : "none",
        );
      }

    }
  }, [showUnionPearson, map.current]);

  // Update GO Transit layer visibility
  useEffect(() => {
    if (map.current && map.current.isStyleLoaded()) {
      const visibility = showGoTransit ? "visible" : "none";
      if (map.current.getLayer("go-transit-routes-layer")) {
        map.current.setLayoutProperty(
          "go-transit-routes-layer",
          "visibility",
          visibility,
        );
      }
      if (map.current.getLayer("go-transit-stops-layer")) {
        map.current.setLayoutProperty(
          "go-transit-stops-layer",
          "visibility",
          showGoTransit ? "visible" : "none",
        );
      }
    }
  }, [showGoTransit, map.current]);

  // Update Union Pearson Express route line data
  useEffect(() => {
    if (!mapReady || !map.current || !unionPearsonShapes) {
      console.log(
        "[UPX] Route line update blocked - mapReady:",
        mapReady,
        "map.current:",
        !!map.current,
        "unionPearsonShapes:",
        !!unionPearsonShapes,
      );
      return;
    }

    console.log("[UPX] Updating route line with shapes data");

    // Ensure the source exists
    ensureUnionPearsonLayers();

    const source = map.current.getSource("union-pearson-express");
    if (source) {
      (source as mapboxgl.GeoJSONSource).setData(unionPearsonShapes);
      console.log(
        "[UPX] Route line updated with",
        unionPearsonShapes.features.length,
        "features",
      );
    } else {
      console.warn("[UPX] Route line source not found");
    }
  }, [mapReady, unionPearsonShapes, ensureUnionPearsonLayers]);

  // Update GO Transit variant lines data
  useEffect(() => {
    if (!mapReady || !map.current || !displayVariantLines) {
      return;
    }
    ensureGOTransitLayers();
    const source = map.current.getSource(
      "go-transit-routes",
    ) as mapboxgl.GeoJSONSource;
    if (source) {
      source.setData(displayVariantLines);
    }
  }, [mapReady, displayVariantLines, ensureGOTransitLayers]);

  useEffect(() => {
    if (!mapReady || !map.current) return;
    ensureSimulationLayer();
  }, [mapReady, ensureSimulationLayer]);

  const selectedVariantStops = useMemo(() => {
    if (!goVariantStops) return null;
    const features: GeoJSON.Feature[] = [];
    selectedVariantIds.forEach((variantId) => {
      const stops = goVariantStops[variantId] || [];
      const lookup = variantLookup.get(variantId);
      const routeInfo = lookup ? routeById.get(lookup.route_id) : null;
      const routeType = routeInfo ? String(routeInfo.route_type) : "";
      const routeShortName = lookup?.route_short_name || "";

      stops.forEach((stop) => {
        if (
          stop.stop_lat === null ||
          stop.stop_lon === null ||
          Number.isNaN(stop.stop_lat) ||
          Number.isNaN(stop.stop_lon)
        ) {
          return;
        }
        if (!shouldShowMajorStop(stop.stop_name, routeShortName, routeType)) {
          return;
        }
        features.push({
          type: "Feature",
          geometry: {
            type: "Point",
            coordinates: [stop.stop_lon, stop.stop_lat],
          },
          properties: {
            variant_id: variantId,
            stop_id: stop.stop_id,
            stop_name: stop.stop_name,
            stop_sequence: stop.stop_sequence,
            route_short_name: routeShortName,
            route_type: routeType,
          },
        });
      });
    });
    return {
      type: "FeatureCollection",
      features,
    } as GeoJSON.FeatureCollection;
  }, [goVariantStops, selectedVariantIds, variantLookup, routeById]);

  const customRoutesGeoJSON = useMemo(() => {
    const features: GeoJSON.Feature<GeoJSON.LineString>[] = [];
    savedCustomRoutes.forEach((r) => {
      if (!selectedCustomRouteIds.includes(r.id)) return;
      if (!r.geometry?.coordinates?.length) return;
      features.push({
        type: "Feature",
        geometry: r.geometry,
        properties: { route_color: r.color || "#8b5cf6" },
      });
    });
    return { type: "FeatureCollection" as const, features };
  }, [savedCustomRoutes, selectedCustomRouteIds]);

  useEffect(() => {
    if (!mapReady || !map.current) return;
    ensureCustomRoutesLayers();
    const source = map.current.getSource("custom-routes") as mapboxgl.GeoJSONSource;
    if (source && showCustomNetwork) {
      source.setData(customRoutesGeoJSON);
    }
    const layer = map.current.getLayer("custom-routes-layer");
    if (layer) {
      map.current.setLayoutProperty(
        "custom-routes-layer",
        "visibility",
        showCustomNetwork ? "visible" : "none"
      );
    }
  }, [mapReady, showCustomNetwork, customRoutesGeoJSON, ensureCustomRoutesLayers]);

  useEffect(() => {
    if (!mapReady || !map.current || !selectedVariantStops) {
      return;
    }
    ensureGOTransitLayers();
    const source = map.current.getSource(
      "go-transit-stops",
    ) as mapboxgl.GeoJSONSource;
    if (source) {
      source.setData(selectedVariantStops);
    }
  }, [mapReady, selectedVariantStops, ensureGOTransitLayers]);

  useEffect(() => {
    if (!map.current || !unionPearsonShapes || hasFitUnionPearson.current)
      return;
    if (!map.current.isStyleLoaded()) return;

    const bounds = new mapboxgl.LngLatBounds();
    for (const feature of unionPearsonShapes.features) {
      if (feature.geometry.type !== "LineString") continue;
      for (const coord of feature.geometry.coordinates) {
        bounds.extend(coord as [number, number]);
      }
    }

    if (!bounds.isEmpty()) {
      map.current.fitBounds(bounds, { padding: 80, maxZoom: 13, duration: 0 });
      hasFitUnionPearson.current = true;
    }
  }, [unionPearsonShapes]);

  useEffect(() => {
    if (!mapReady || !map.current) return;
    if (!simulationTrips.length) {
      const empty: GeoJSON.FeatureCollection = {
        type: "FeatureCollection",
        features: [],
      };
      const source = map.current.getSource(
        "simulation-vehicles",
      ) as mapboxgl.GeoJSONSource;
      source?.setData(empty);
      return;
    }

    const features: GeoJSON.Feature[] = [];
    const currentTime = simulationCurrent;

    simulationTrips.forEach((trip) => {
      if (!trip.stops.length) return;
      const first = trip.stops[0];
      const last = trip.stops[trip.stops.length - 1];
      if (currentTime < first.t || currentTime > last.t) return;

      // Pin at exact trip boundaries to avoid spawn/jump artifacts.
      if (currentTime <= first.t) {
        features.push({
          type: "Feature",
          geometry: {
            type: "Point",
            coordinates: [first.lon, first.lat],
          },
          properties: {
            trip_id: trip.trip_id,
            route_short_name: trip.route_short_name,
            route_long_name: trip.route_long_name,
            route_type: trip.route_type,
            direction_id: trip.direction_id,
            source: trip.source,
            color:
              trip.color ??
              (trip.source === "union-pearson"
                ? "#0ea5e9"
                : trip.route_type === "2"
                  ? "#22c55e"
                  : "#f97316"),
            start_stop_name: trip.start_stop_name,
            end_stop_name: trip.end_stop_name,
            start_time: trip.start_time ?? "",
            end_time: trip.end_time ?? "",
          },
        });
        return;
      }
      if (currentTime >= last.t) {
        features.push({
          type: "Feature",
          geometry: {
            type: "Point",
            coordinates: [last.lon, last.lat],
          },
          properties: {
            trip_id: trip.trip_id,
            route_short_name: trip.route_short_name,
            route_long_name: trip.route_long_name,
            route_type: trip.route_type,
            direction_id: trip.direction_id,
            source: trip.source,
            color:
              trip.color ??
              (trip.source === "union-pearson"
                ? "#0ea5e9"
                : trip.route_type === "2"
                  ? "#22c55e"
                  : "#f97316"),
            start_stop_name: trip.start_stop_name,
            end_stop_name: trip.end_stop_name,
            start_time: trip.start_time ?? "",
            end_time: trip.end_time ?? "",
          },
        });
        return;
      }

      let position = null as { lat: number; lon: number } | null;
      for (let i = 0; i < trip.stops.length - 1; i += 1) {
        const a = trip.stops[i];
        const b = trip.stops[i + 1];
        if (currentTime < a.t) {
          position = { lat: a.lat, lon: a.lon };
          break;
        }
        if (currentTime > b.t) continue;
        if (b.t <= a.t) {
          position = { lat: a.lat, lon: a.lon };
          break;
        }
        const ratio = Math.max(0, Math.min(1, (currentTime - a.t) / (b.t - a.t)));
        const hasShape =
          trip.shape &&
          trip.shape.length > 1 &&
          a.shapeIndex !== null &&
          b.shapeIndex !== null;
        if (hasShape) {
          const maxShapeIndex = trip.shape.length - 1;
          const safeA = Math.max(0, Math.min(maxShapeIndex, a.shapeIndex!));
          const safeB = Math.max(0, Math.min(maxShapeIndex, b.shapeIndex!));
          const startIndex = Math.min(safeA, safeB);
          const endIndex = Math.max(safeA, safeB);
          const span = Math.max(1, endIndex - startIndex);
          const rawIndex = startIndex + ratio * span;
          const lowerIndex = Math.max(
            0,
            Math.min(maxShapeIndex, Math.floor(rawIndex)),
          );
          const upperIndex = Math.min(trip.shape.length - 1, lowerIndex + 1);
          const segmentRatio = rawIndex - lowerIndex;
          const p0 = trip.shape[lowerIndex];
          const p1 = trip.shape[upperIndex];
          if (p0 && p1) {
            position = {
              lat: p0.lat + (p1.lat - p0.lat) * segmentRatio,
              lon: p0.lon + (p1.lon - p0.lon) * segmentRatio,
            };
          } else {
            position = {
              lat: a.lat + (b.lat - a.lat) * ratio,
              lon: a.lon + (b.lon - a.lon) * ratio,
            };
          }
        } else {
          position = {
            lat: a.lat + (b.lat - a.lat) * ratio,
            lon: a.lon + (b.lon - a.lon) * ratio,
          };
        }
        break;
      }
      if (!position) return;

      const color =
        trip.color ??
        (trip.source === "union-pearson"
          ? "#0ea5e9"
          : trip.route_type === "2"
            ? "#22c55e"
            : "#f97316");

      features.push({
        type: "Feature",
        geometry: {
          type: "Point",
          coordinates: [position.lon, position.lat],
        },
        properties: {
          trip_id: trip.trip_id,
          route_short_name: trip.route_short_name,
          route_long_name: trip.route_long_name,
          route_type: trip.route_type,
          direction_id: trip.direction_id,
          source: trip.source,
          color,
          start_stop_name: trip.start_stop_name,
          end_stop_name: trip.end_stop_name,
          start_time: trip.start_time ?? "",
          end_time: trip.end_time ?? "",
        },
      });
    });

    const collection: GeoJSON.FeatureCollection = {
      type: "FeatureCollection",
      features,
    };
    const source = map.current.getSource(
      "simulation-vehicles",
    ) as mapboxgl.GeoJSONSource;
    source?.setData(collection);

    if (focusedSimulationTripId) {
      const focusedFeature = features.find((feature) => {
        const props = feature.properties as Record<string, unknown>;
        return String(props.trip_id || "") === focusedSimulationTripId;
      });
      if (focusedFeature) {
        const now = Date.now();
        if (now - lastFollowCameraUpdate.current > 350) {
          lastFollowCameraUpdate.current = now;
          const coords = (focusedFeature.geometry as GeoJSON.Point)
            .coordinates as [number, number];
          map.current.easeTo({
            center: coords,
            duration: 320,
            essential: true,
          });
        }
      }
    }
  }, [
    mapReady,
    simulationTrips,
    simulationCurrent,
    ensureSimulationLayer,
    focusedSimulationTripId,
  ]);

  useEffect(() => {
    if (!mapReady || !map.current) return;
    ensureSimulationLayer();

    const popup = new mapboxgl.Popup({
      closeButton: false,
      closeOnClick: false,
      offset: 12,
      className: "simulation-popup",
    });

    const handleMove = (event: mapboxgl.MapLayerMouseEvent) => {
      if (!event.features || event.features.length === 0) return;
      const feature = event.features[0];
      const props = feature.properties || {};
      const route = props.route_short_name || "";
      const routeLongName = props.route_long_name || "";
      const startName = props.start_stop_name || "";
      const endName = props.end_stop_name || "";
      const source =
        props.source === "union-pearson"
          ? "UP Express"
          : props.source === "custom"
            ? "Custom"
            : "GO Transit";
      const directionLabel =
        props.direction_id === "1" || props.direction_id === 1
          ? "Direction 1"
          : "Direction 0";
      const startTime = props.start_time ? formatShortTime(Number(props.start_time)) : "--:--";
      const endTime = props.end_time ? formatShortTime(Number(props.end_time)) : "--:--";

      popup
        .setLngLat((feature.geometry as GeoJSON.Point).coordinates as [number, number])
        .setHTML(
          `<div style="font-size:11px;line-height:1.3;min-width:220px;padding:8px 10px;">
            <div style="display:flex;justify-content:space-between;gap:10px;align-items:center;margin-bottom:6px;">
              <div style="font-weight:700;">Route ${route}</div>
              <div style="font-size:10px;color:#93c5fd;">${source}</div>
            </div>
            ${routeLongName ? `<div style="color:#cbd5e1;margin-bottom:6px;">${routeLongName}</div>` : ""}
            <div style="color:#cbd5f5;">${startName} → ${endName}</div>
            <div style="color:#94a3b8;margin-top:4px;">${startTime} → ${endTime}</div>
            <div style="color:#64748b;margin-top:4px;font-size:10px;">${directionLabel}</div>
          </div>`,
        )
        .addTo(map.current!);
      map.current!.getCanvas().style.cursor = "pointer";
    };

    const handleLeave = () => {
      if (map.current) {
        map.current.getCanvas().style.cursor = "";
      }
      popup.remove();
    };

    const handleClick = (event: mapboxgl.MapLayerMouseEvent) => {
      if (!event.features || event.features.length === 0 || !map.current) return;
      const feature = event.features[0];
      const props = feature.properties || {};
      const tripId = String(props.trip_id || "");
      if (!tripId) return;

      setFocusedSimulationTripId(tripId);
      const coords = (feature.geometry as GeoJSON.Point).coordinates as [number, number];
      map.current.easeTo({
        center: coords,
        zoom: Math.max(map.current.getZoom(), 11.5),
        duration: 450,
        essential: true,
      });
    };

    map.current.on("mousemove", "simulation-vehicles-layer", handleMove);
    map.current.on("mouseleave", "simulation-vehicles-layer", handleLeave);
    map.current.on("click", "simulation-vehicles-layer", handleClick);

    return () => {
      map.current?.off("mousemove", "simulation-vehicles-layer", handleMove);
      map.current?.off("mouseleave", "simulation-vehicles-layer", handleLeave);
      map.current?.off("click", "simulation-vehicles-layer", handleClick);
      popup.remove();
    };
  }, [mapReady, ensureSimulationLayer]);

  useEffect(() => {
    if (!simulationPlaying) {
      if (animationFrame.current) {
        cancelAnimationFrame(animationFrame.current);
      }
      animationFrame.current = null;
      lastFrameTime.current = null;
      return;
    }

    const startSeconds = parseShortTime(simulationStart) ?? 0;
    const endSeconds = parseShortTime(simulationEnd) ?? startSeconds;

    const tick = (timestamp: number) => {
      if (!lastFrameTime.current) {
        lastFrameTime.current = timestamp;
        animationFrame.current = requestAnimationFrame(tick);
        return;
      }

      const delta = (timestamp - lastFrameTime.current) / 1000;
      lastFrameTime.current = timestamp;

      setSimulationCurrent((prev) => {
        const next = prev + delta * simulationSpeed;
        if (next >= endSeconds) {
          setSimulationPlaying(false);
          return endSeconds;
        }
        if (next < startSeconds) {
          return startSeconds;
        }
        return next;
      });

      animationFrame.current = requestAnimationFrame(tick);
    };

    animationFrame.current = requestAnimationFrame(tick);
    return () => {
      if (animationFrame.current) {
        cancelAnimationFrame(animationFrame.current);
      }
      animationFrame.current = null;
      lastFrameTime.current = null;
    };
  }, [
    simulationPlaying,
    simulationSpeed,
    simulationStart,
    simulationEnd,
  ]);

  const loadSimulation = async () => {
    const startSeconds = parseShortTime(simulationStart);
    const endSeconds = parseShortTime(simulationEnd);
    if (simulationRoutes.length === 0) {
      setSimulationError("Select at least one route.");
      return;
    }
    if (startSeconds === null || endSeconds === null) {
      setSimulationError("Enter a valid start and end time (HH:MM).");
      return;
    }
    if (endSeconds <= startSeconds) {
      setSimulationError("End time must be after start time.");
      return;
    }

    setSimulationLoading(true);
    setSimulationError(null);
    setSimulationPlaying(false);

    try {
      const goRouteNames = simulationRoutes.filter((r) => !r.startsWith("custom:"));
      const customRouteIds = simulationRoutes
        .filter((r) => r.startsWith("custom:"))
        .map((r) => r.replace(/^custom:/, ""));

      const allTrips: SimulationTrip[] = [];

      for (const customId of customRouteIds) {
        const customRoute = savedCustomRoutes.find((r) => r.id === customId);
        if (customRoute) {
          const trips = buildSimulationTripsFromCustomRoute(
            customRoute,
            startSeconds,
            endSeconds,
            simulationDate,
          );
          allTrips.push(...trips);
        }
      }

      const routeTypes = [
        showGoTrains ? "2" : null,
        showGoBuses ? "3" : null,
      ]
        .filter(Boolean)
        .join(",");
      const chunkSize = 8;
      const routeChunks: string[][] = [];
      for (let i = 0; i < goRouteNames.length; i += chunkSize) {
        routeChunks.push(goRouteNames.slice(i, i + chunkSize));
      }

      let effectiveStartSeconds = startSeconds;
      let effectiveEndSeconds = endSeconds;

      for (let i = 0; i < routeChunks.length; i += 1) {
        const chunk = routeChunks[i];
        const params = new URLSearchParams({
          date: simulationDate,
          start: simulationStart,
          end: simulationEnd,
          includeUpx: includeUpxInSimulation ? "true" : "false",
          routeShortNames: chunk.join(","),
          debug: "1",
        });
        if (routeTypes) {
          params.set("routeTypes", routeTypes);
        }
        const requestUrl = `/api/simulation?${params.toString()}`;
        console.log("[SIM] Request", {
          chunkIndex: i + 1,
          chunkTotal: routeChunks.length,
          requestUrl,
          routes: chunk,
          date: simulationDate,
          start: simulationStart,
          end: simulationEnd,
        });

        const response = await fetch(requestUrl);
        if (!response.ok) {
          let errorPayload: Record<string, unknown> | null = null;
          try {
            errorPayload = (await response.json()) as Record<string, unknown>;
          } catch {
            errorPayload = null;
          }
          console.error("[SIM] API error response", {
            chunkIndex: i + 1,
            status: response.status,
            errorPayload,
          });
          const requestId = errorPayload?.requestId
            ? String(errorPayload.requestId)
            : "n/a";
          const apiError = errorPayload?.error ? String(errorPayload.error) : "";
          throw new Error(
            `HTTP ${response.status} ${apiError} (chunk ${i + 1}/${routeChunks.length}, requestId: ${requestId})`,
          );
        }

        const payload = (await response.json()) as {
          startSeconds: number;
          endSeconds: number;
          trips: SimulationTrip[];
          diagnostics?: Record<string, unknown>;
        };
        if (payload.diagnostics) {
          console.log("[SIM] API diagnostics", {
            chunkIndex: i + 1,
            ...payload.diagnostics,
          });
        }

        allTrips.push(...(payload.trips || []));
        if (typeof payload.startSeconds === "number") {
          effectiveStartSeconds = Math.min(effectiveStartSeconds, payload.startSeconds);
        }
        if (typeof payload.endSeconds === "number") {
          effectiveEndSeconds = Math.max(effectiveEndSeconds, payload.endSeconds);
        }
      }

      setSimulationTrips(allTrips);
      setSimulationCurrent(effectiveStartSeconds || startSeconds);
      console.log("[SIM] Combined result", {
        routeCount: simulationRoutes.length,
        chunkCount: routeChunks.length,
        trips: allTrips.length,
        startSeconds: effectiveStartSeconds,
        endSeconds: effectiveEndSeconds,
      });
    } catch (error) {
      console.error("Simulation load failed:", error);
      setSimulationError(
        error instanceof Error ? error.message : "Failed to load simulation data.",
      );
    } finally {
      setSimulationLoading(false);
    }
  };

  useEffect(() => {
    const startSeconds = parseShortTime(simulationStart);
    const endSeconds = parseShortTime(simulationEnd);
    if (startSeconds === null || endSeconds === null) return;
    setSimulationCurrent((prev) => {
      if (prev < startSeconds) return startSeconds;
      if (prev > endSeconds) return endSeconds;
      return prev;
    });
  }, [simulationStart, simulationEnd]);

  const clearSimulationTrackers = () => {
    setSimulationTrips([]);
    setSimulationPlaying(false);
    setFocusedSimulationTripId(null);
    setSimulationError(null);
    setSimulationCurrent(parseShortTime(simulationStart) ?? 0);
  };

  const resetSimulationInputs = () => {
    const today = new Date().toISOString().slice(0, 10);
    setSimulationDate(today);
    setSimulationRoutes(["21"]);
    setSimulationStart("04:00");
    setSimulationEnd("08:00");
    setSimulationSpeed(60);
    setIncludeUpxInSimulation(true);
    clearSimulationTrackers();
  };

  const showAllNetworks = () => {
    setShowGoTransit(true);
    setShowUnionPearson(true);
    setShowCustomNetwork(true);
  };

  return (
    <div className="relative h-screen w-full overflow-hidden">
      {/* GitHub icon - bottom left */}
      <a
        href="https://github.com/faizm10/transit-flow"
        target="_blank"
        rel="noopener noreferrer"
        className="absolute bottom-4 left-4 z-10 p-2.5 rounded-lg bg-black/40 backdrop-blur-md border border-white/10 text-white/60 hover:text-white hover:bg-black/60 transition-all"
      >
        <GitHubLogoIcon width={18} height={18} />
      </a>

      {/* Vertical Sidebar Navbar - left */}
      <nav className="absolute left-4 top-4 bottom-4 z-10 flex flex-col gap-1 w-44">
        <div className="rounded-xl bg-black/60 backdrop-blur-md border border-white/20 shadow-xl overflow-hidden">
          <div className="px-2.5 py-2 border-b border-white/10">
            <span className="text-[10px] font-semibold text-white/60 uppercase tracking-wider">
              Networks
            </span>
          </div>
          <div className="p-2 space-y-1">
            <button
              onClick={() => setShowGoTransit((prev) => !prev)}
              className={`w-full px-3 py-2 rounded-lg text-left text-xs font-medium transition-all ${
                showGoTransit
                  ? "bg-emerald-500/60 border border-emerald-400/30 text-white"
                  : "bg-white/5 border border-transparent text-white/60 hover:bg-white/10 hover:text-white"
              }`}
            >
              {showGoTransit ? "✓ " : ""}GO Transit
            </button>
            <button
              onClick={() => setShowUnionPearson((prev) => !prev)}
              className={`w-full px-3 py-2 rounded-lg text-left text-xs font-medium transition-all ${
                showUnionPearson
                  ? "bg-blue-500/60 border border-blue-400/30 text-white"
                  : "bg-white/5 border border-transparent text-white/60 hover:bg-white/10 hover:text-white"
              }`}
            >
              {showUnionPearson ? "✓ " : ""}UPX
            </button>
            <button
              onClick={() => setShowCustomNetwork((prev) => !prev)}
              className={`w-full px-3 py-2 rounded-lg text-left text-xs font-medium transition-all ${
                showCustomNetwork
                  ? "bg-violet-500/60 border border-violet-400/30 text-white"
                  : "bg-white/5 border border-transparent text-white/60 hover:bg-white/10 hover:text-white"
              }`}
            >
              {showCustomNetwork ? "✓ " : ""}Custom
            </button>
            <button
              onClick={showAllNetworks}
              className="w-full px-3 py-2 rounded-lg text-left text-xs font-medium bg-white/5 border border-transparent text-white/70 hover:bg-white/10 hover:text-white transition-all"
            >
              Show all networks
            </button>
          </div>
        </div>
        <div className="rounded-xl bg-black/60 backdrop-blur-md border border-white/20 shadow-xl overflow-hidden">
          <div className="px-2.5 py-2 border-b border-white/10">
            <span className="text-[10px] font-semibold text-white/60 uppercase tracking-wider">
              Tools
            </span>
          </div>
          <div className="p-2 space-y-1">
            <button
              onClick={() => setShowRouteBuilder((prev) => !prev)}
              className={`w-full px-3 py-2 rounded-lg text-left text-xs font-medium transition-all ${
                showRouteBuilder
                  ? "bg-blue-500/60 border border-blue-400/30 text-white"
                  : "bg-white/5 border border-transparent text-white/60 hover:bg-white/10 hover:text-white"
              }`}
            >
              {showRouteBuilder ? "✓ " : ""}Route Builder
            </button>
            <button
              onClick={() => setShowTimeSimulation((prev) => !prev)}
              className={`w-full px-3 py-2 rounded-lg text-left text-xs font-medium transition-all ${
                showTimeSimulation
                  ? "bg-amber-500/60 border border-amber-400/30 text-white"
                  : "bg-white/5 border border-transparent text-white/60 hover:bg-white/10 hover:text-white"
              }`}
            >
              {showTimeSimulation ? "✓ " : ""}Time Simulation
            </button>
          </div>
        </div>
      </nav>

      {/* Panels - right side */}
      <div className="absolute top-4 right-4 bottom-4 z-10 flex max-w-[calc(100vw-1rem)] flex-col gap-3 overflow-y-auto pr-1">
        {/* Route Builder Panel - mount when building or when custom network on (to show building route) */}
        {(showRouteBuilder || showCustomNetwork) && (
          <RouteBuilder
            mapRef={map}
            mapReady={mapReady}
            enabled={showRouteBuilder}
            showPanel={showRouteBuilder}
            goVariantsIndex={goVariantsIndex}
            goVariantStops={goVariantStops}
            showCustomNetwork={showCustomNetwork}
          />
        )}

        {/* Filter Panel */}
        {(showGoTransit || showCustomNetwork) && (
          <div className="w-64 overflow-hidden rounded-xl bg-black/60 backdrop-blur-md border border-white/20 shadow-2xl">
            <button
              onClick={() => setShowRouteFilters((prev) => !prev)}
              className="w-full px-3 py-2.5 border-b border-white/10 bg-black/40 flex items-center justify-between hover:bg-black/55 transition-all"
            >
              <div className="flex items-center gap-2">
                <h3 className="text-xs font-semibold text-white">Route Filters</h3>
                <span className="text-[10px] text-white/50">
                  {selectedVariantIds.length}/{allVariantIds.length}
                  {showCustomNetwork && savedCustomRoutes.length > 0 && (
                    <> · {selectedCustomRouteIds.length}/{savedCustomRoutes.length} custom</>
                  )}
                </span>
              </div>
              <span className="text-xs text-white/60">
                {showRouteFilters ? "Hide" : "Show"}
              </span>
            </button>

            {showRouteFilters && (
              <div className="max-h-[48vh] overflow-hidden flex flex-col">
                <div className="px-3 py-2 border-b border-white/10 bg-black/30 space-y-2">
                  <div className="flex gap-1.5">
                    <button
                      className="flex-1 px-2 py-1 text-[11px] rounded-md bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/30 transition-all"
                      onClick={() => setSelectedVariantIds(allVariantIds)}
                    >
                      Select all
                    </button>
                    <button
                      className="px-2 py-1 text-[11px] rounded-md bg-white/10 hover:bg-white/20 text-white/80 border border-white/15 transition-all"
                      onClick={() => setSelectedVariantIds([])}
                    >
                      Clear
                    </button>
                  </div>

                  <input
                    type="text"
                    value={goVariantFilterText}
                    onChange={(event) => setGoVariantFilterText(event.target.value)}
                    placeholder="Search routes..."
                    className="w-full rounded-md bg-black/50 border border-white/10 px-2.5 py-1.5 text-xs text-white/90 placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500/40 transition-all"
                  />

                  <div className="flex items-center justify-between text-xs text-white/75">
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        className="w-3.5 h-3.5 rounded accent-emerald-400 cursor-pointer"
                        checked={showGoTrains}
                        onChange={() => setShowGoTrains((prev) => !prev)}
                      />
                      Trains
                    </label>
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        className="w-3.5 h-3.5 rounded accent-emerald-400 cursor-pointer"
                        checked={showGoBuses}
                        onChange={() => setShowGoBuses((prev) => !prev)}
                      />
                      Buses
                    </label>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto px-2.5 py-2">
                  {groupedGoVariants.length === 0 ? (
                    <div className="text-center py-6 text-[11px] text-white/45">
                      No routes found
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {groupedGoVariants.map((group) => {
                        const routeInfo = routeByShortName.get(group.routeShortName);
                        const variantIds = group.items.flatMap((item) => item.variantIds);
                        const selectedCount = variantIds.filter((id) =>
                          selectedVariantIds.includes(id),
                        ).length;
                        const isAllSelected = selectedCount === variantIds.length;

                        return (
                          <div
                            key={group.routeShortName}
                            className="border border-white/10 rounded-md p-2 bg-black/20"
                          >
                            <div className="flex items-center justify-between mb-1.5">
                              <div className="flex items-center gap-2 min-w-0">
                                <span
                                  className="h-2.5 w-2.5 rounded-full shrink-0"
                                  style={{
                                    backgroundColor: colorForRoute(group.routeShortName),
                                  }}
                                />
                                <span className="text-[11px] font-semibold text-white truncate">
                                  {group.routeShortName}
                                </span>
                              </div>
                              <div className="flex gap-1 shrink-0">
                                <button
                                  className={`px-1.5 py-0.5 text-[10px] rounded border transition-all ${
                                    isAllSelected
                                      ? "bg-emerald-500/20 border-emerald-500/30 text-emerald-300"
                                      : "bg-white/5 border-white/10 text-white/70 hover:bg-white/10"
                                  }`}
                                  onClick={() => setVariantGroup(variantIds, true)}
                                >
                                  All
                                </button>
                                <button
                                  className="px-1.5 py-0.5 text-[10px] rounded bg-white/5 border border-white/10 text-white/70 hover:bg-white/10 transition-all"
                                  onClick={() => setVariantGroup(variantIds, false)}
                                >
                                  None
                                </button>
                              </div>
                            </div>

                            {routeInfo?.route_long_name && (
                              <div className="text-[10px] text-white/45 truncate mb-1.5">
                                {routeInfo.route_long_name}
                              </div>
                            )}

                            <div className="space-y-1">
                              {group.items.map((item) => {
                                const isItemSelected = item.variantIds.every((id) =>
                                  selectedVariantIds.includes(id),
                                );
                                return (
                                  <label
                                    key={item.displayKey}
                                    className="flex items-center gap-1.5 cursor-pointer p-1 rounded hover:bg-white/5 transition-all"
                                  >
                                    <input
                                      type="checkbox"
                                      className="w-3 h-3 rounded accent-emerald-400 cursor-pointer"
                                      checked={isItemSelected}
                                      onChange={() => {
                                        const enabled = !isItemSelected;
                                        setVariantGroup(item.variantIds, enabled);
                                      }}
                                    />
                                    <span className="text-[11px] text-white/80 flex-1 truncate">
                                      {item.displayKey}
                                    </span>
                                  </label>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {showCustomNetwork && savedCustomRoutes.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-white/10">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[10px] font-semibold text-violet-300 uppercase tracking-wider">
                          Custom Routes
                        </span>
                        <div className="flex gap-1">
                          <button
                            className="px-1.5 py-0.5 text-[10px] rounded bg-violet-500/20 border border-violet-500/30 text-violet-300 hover:bg-violet-500/30"
                            onClick={() => setSelectedCustomRouteIds(savedCustomRoutes.map((r) => r.id))}
                          >
                            All
                          </button>
                          <button
                            className="px-1.5 py-0.5 text-[10px] rounded bg-white/5 border border-white/10 text-white/70 hover:bg-white/10"
                            onClick={() => setSelectedCustomRouteIds([])}
                          >
                            None
                          </button>
                        </div>
                      </div>
                      <div className="space-y-1">
                        {savedCustomRoutes
                          .filter((r) => r.stops.length >= 2 && r.geometry)
                          .map((r) => (
                            <label
                              key={r.id}
                              className="flex items-center gap-1.5 cursor-pointer p-1 rounded hover:bg-white/5 transition-all"
                            >
                              <input
                                type="checkbox"
                                className="w-3 h-3 rounded accent-violet-400 cursor-pointer"
                                checked={selectedCustomRouteIds.includes(r.id)}
                                onChange={() => {
                                  setSelectedCustomRouteIds((prev) =>
                                    prev.includes(r.id)
                                      ? prev.filter((id) => id !== r.id)
                                      : [...prev, r.id]
                                  );
                                }}
                              />
                              <span
                                className="h-2.5 w-2.5 rounded-full shrink-0"
                                style={{ backgroundColor: r.color }}
                              />
                              <span className="text-[11px] text-white/80 flex-1 truncate">
                                {r.name}
                              </span>
                            </label>
                          ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {showTimeSimulation && (
        <div className="w-64 rounded-xl bg-black/60 backdrop-blur-md border border-white/20 shadow-2xl text-white/80 overflow-hidden">
          <div
            className="w-full px-3 py-2.5 border-b border-white/10 bg-black/40 flex items-center justify-between hover:bg-black/55 transition-all"
          >
            <h3 className="text-xs font-semibold text-white">Time Simulation</h3>
            <span className="text-[10px] uppercase tracking-wide text-white/40">
              EST/ET
            </span>
          </div>

          <div className="p-3">
          <div className="grid grid-cols-2 gap-2 mb-2">
            <label className="text-[11px] text-white/60">
              Date
              <input
                type="date"
                value={simulationDate}
                onChange={(event) => setSimulationDate(event.target.value)}
                className="mt-1 w-full rounded-lg bg-black/50 border border-white/10 px-2 py-1.5 text-xs text-white/90 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50"
              />
            </label>
            <label className="text-[11px] text-white/60">
              Speed
              <select
                value={simulationSpeed}
                onChange={(event) => setSimulationSpeed(Number(event.target.value))}
                className="mt-1 w-full rounded-lg bg-black/50 border border-white/10 px-2 py-1.5 text-xs text-white/90 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50"
              >
                <option value={30}>30x</option>
                <option value={60}>60x</option>
                <option value={120}>120x</option>
                <option value={300}>300x</option>
              </select>
            </label>
          </div>

          <div className="grid grid-cols-2 gap-2 mb-2">
            <label className="text-[11px] text-white/60 col-span-2">
              Routes ({simulationRoutes.length} selected)
              <select
                multiple
                value={simulationRoutes}
                onChange={(event) => {
                  const selected = Array.from(event.target.selectedOptions).map(
                    (option) => option.value,
                  );
                  setSimulationRoutes(selected);
                  clearSimulationTrackers();
                }}
                className="mt-1 h-28 w-full rounded-lg bg-black/50 border border-white/10 px-2 py-1.5 text-xs text-white/90 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50"
              >
                {simulationRouteOptions.length === 0 ? (
                  <option value="21">21</option>
                ) : (
                  simulationRouteOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))
                )}
              </select>
              <div className="mt-1 text-[10px] text-white/45">
                Hold Cmd/Ctrl to select multiple. ★ = saved custom routes.
              </div>
            </label>
            <label className="text-[11px] text-white/60">
              Start
              <input
                type="time"
                value={simulationStart}
                onChange={(event) => setSimulationStart(event.target.value)}
                className="mt-1 w-full rounded-lg bg-black/50 border border-white/10 px-2 py-1.5 text-xs text-white/90 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50"
              />
            </label>
            <label className="text-[11px] text-white/60">
              End
              <input
                type="time"
                value={simulationEnd}
                onChange={(event) => setSimulationEnd(event.target.value)}
                className="mt-1 w-full rounded-lg bg-black/50 border border-white/10 px-2 py-1.5 text-xs text-white/90 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50"
              />
            </label>
          </div>

          <label className="flex items-center gap-2 text-[11px] text-white/60 mb-2">
            <input
              type="checkbox"
              checked={includeUpxInSimulation}
              onChange={() => setIncludeUpxInSimulation((prev) => !prev)}
              className="w-4 h-4 rounded accent-blue-400 cursor-pointer"
            />
            Include UP Express
          </label>

          <div className="flex gap-2 mb-2">
            <button
              onClick={loadSimulation}
              disabled={simulationLoading}
              className="flex-1 px-3 py-1.5 rounded-lg bg-blue-500/70 text-white text-xs font-medium hover:bg-blue-500/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {simulationLoading ? "Loading..." : "Load Trips"}
            </button>
            <button
              onClick={() => setSimulationPlaying((prev) => !prev)}
              disabled={!simulationTrips.length}
              className="px-3 py-1.5 rounded-lg bg-white/10 text-white/80 text-xs font-medium hover:bg-white/20 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            >
              {simulationPlaying ? "Pause" : "Play"}
            </button>
            <button
              onClick={clearSimulationTrackers}
              className="px-3 py-1.5 rounded-lg bg-white/10 text-white/80 text-xs font-medium hover:bg-white/20 transition-all"
            >
              Clear
            </button>
          </div>

          <button
            onClick={resetSimulationInputs}
            className="w-full mb-2 px-3 py-1.5 rounded-lg bg-white/5 text-white/70 text-xs font-medium hover:bg-white/10 transition-all border border-white/10"
          >
            Reset Simulation
          </button>

          <div className="mb-2">
            <div className="flex items-center justify-between text-[10px] text-white/50">
              <span>{formatShortTime(parseShortTime(simulationStart) ?? 0)}</span>
              <span className="text-white/80 font-medium">
                {formatShortTime(simulationCurrent)}
              </span>
              <span>{formatShortTime(parseShortTime(simulationEnd) ?? 0)}</span>
            </div>
            <input
              type="range"
              min={parseShortTime(simulationStart) ?? 0}
              max={parseShortTime(simulationEnd) ?? 0}
              value={simulationCurrent}
              onChange={(event) => setSimulationCurrent(Number(event.target.value))}
              className="w-full mt-2 accent-blue-400"
            />
          </div>

          <div className="text-[10px] text-white/50">
            {simulationTrips.length} trips loaded
          </div>
          {simulationError && (
            <div className="mt-2 text-[10px] text-red-300">{simulationError}</div>
          )}
          </div>
        </div>
        )}
      </div>

      <div ref={mapContainer} className="h-full w-full" />
    </div>
  );
}
