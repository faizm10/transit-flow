"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import MapboxDraw from "@mapbox/mapbox-gl-draw";
import "@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css";
import { GitHubLogoIcon } from "@radix-ui/react-icons";
import { RouteBuilder } from "@/components/RouteBuilder";
import { RouteCommandBar } from "@/components/RouteCommandBar";
import { ScheduleModal } from "@/components/ScheduleModal";
import {
  getSavedCustomRoutes,
  buildSimulationTripsFromCustomRoute,
  type CustomRoute,
  type Schedule,
} from "@/hooks/useRouteBuilder";
import { Header } from "@/components/Header";
import { SidePanel } from "@/components/SidePanel";
import { NetworksPanel } from "@/components/NetworksPanel";
import { FiltersPanel } from "@/components/FiltersPanel";
import { ComparisonPanel } from "@/components/ComparisonPanel";
import { useDrawableLineBuilder } from "@/hooks/useDrawableLineBuilder";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

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
  const [showRouteBuilder, setShowRouteBuilder] = useState(false);
  const [showScheduleBuilder, setShowScheduleBuilder] = useState(false);
  const [showCustomNetwork, setShowCustomNetwork] = useState(true);
  const [savedCustomRoutes, setSavedCustomRoutes] = useState<CustomRoute[]>([]);
  const [selectedCustomRouteIds, setSelectedCustomRouteIds] = useState<string[]>([]);
  
  const drawRef = useRef<MapboxDraw | null>(null);
  const [showHeatmap, setShowHeatmap] = useState(false);
  const [showCoverage, setShowCoverage] = useState(false);
  const [showComparison, setShowComparison] = useState(false);
  const [activePanel, setActivePanel] = useState<string | null>(null);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [pendingScheduleRouteId, setPendingScheduleRouteId] = useState<string | null>(null);
  const [mapCenter, setMapCenter] = useState({ lat: 43.6532, lng: -79.3832 });

  const { isDrawing, startDraw, cancelDraw, handleDrawCreate } =
    useDrawableLineBuilder();

  const handlePanelToggle = (panel: string) => {
    setActivePanel((prev) => (prev === panel ? null : panel));
  };

  useEffect(() => {
    if (activePanel === "builder") {
      setShowRouteBuilder(true);
      setShowScheduleBuilder(false);
      return;
    }
    if (activePanel === "schedule") {
      setShowRouteBuilder(false);
      setShowScheduleBuilder(true);
      return;
    }
    setShowRouteBuilder(false);
    setShowScheduleBuilder(false);
  }, [activePanel]);

  useEffect(() => {
    setSavedCustomRoutes(getSavedCustomRoutes());
  }, []);

  useEffect(() => {
    const handleSaved = (e: Event) => {
      const detail = (e as CustomEvent<{ routeId?: string }>).detail;
      setSavedCustomRoutes(getSavedCustomRoutes());
      // Auto-add newly saved custom route to time simulation selection
      const routeId = detail?.routeId;
      if (routeId) {
        const customValue = `custom:${routeId}`;
        setSimulationRoutes((prev) =>
          prev.includes(customValue) ? prev : [...prev, customValue]
        );
        if (showCustomNetwork) {
          setSelectedCustomRouteIds((prev) =>
            prev.includes(routeId) ? prev : [...prev, routeId]
          );
        }
      }
    };
    const handleDeleted = (e: Event) => {
      const detail = (e as CustomEvent<{ routeId?: string }>).detail;
      setSavedCustomRoutes(getSavedCustomRoutes());
      const routeId = detail?.routeId;
      if (routeId) {
        const customValue = `custom:${routeId}`;
        setSelectedCustomRouteIds((prev) =>
          prev.filter((id) => id !== routeId)
        );
        setSimulationRoutes((prev) => prev.filter((id) => id !== customValue));
      }
    };
    window.addEventListener("route-builder-saved", handleSaved);
    window.addEventListener("route-builder-deleted", handleDeleted);
    return () => {
      window.removeEventListener("route-builder-saved", handleSaved);
      window.removeEventListener("route-builder-deleted", handleDeleted);
    };
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
  }, [showCustomNetwork, savedCustomRoutes, selectedCustomRouteIds.length]);
  const hasInitializedGoVariants = useRef(false);
  const [simulationDate, setSimulationDate] = useState(() => {
    const now = new Date();
    return now.toISOString().slice(0, 10);
  });
  const [simulationRoutes, setSimulationRoutes] = useState<string[]>([]);
  const [simulationStart, setSimulationStart] = useState("05:30");
  const [simulationEnd, setSimulationEnd] = useState("13:00");
  const [simulationCurrent, setSimulationCurrent] = useState(0);
  const [simulationTrips, setSimulationTrips] = useState<SimulationTrip[]>([]);
  const [simulationLoading, setSimulationLoading] = useState(false);
  const [simulationError, setSimulationError] = useState<string | null>(null);
  const [simulationPlaying, setSimulationPlaying] = useState(false);
  const [simulationSpeed, setSimulationSpeed] = useState(60);
  const [focusedSimulationTripId, setFocusedSimulationTripId] = useState<string | null>(null);
  const [includeUpxInSimulation, setIncludeUpxInSimulation] = useState(false);
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
        const cleaned = fullName
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
                  const cleaned = fullName
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

  const ensureHeatmapLayer = useCallback(() => {
    if (!map.current) return;
    if (!map.current.getSource("go-transit-heatmap")) {
      map.current.addSource("go-transit-heatmap", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
    }
    if (!map.current.getLayer("go-transit-heatmap-layer")) {
      map.current.addLayer({
        id: "go-transit-heatmap-layer",
        type: "heatmap",
        source: "go-transit-heatmap",
        paint: {
          "heatmap-weight": [
            "interpolate", ["linear"], ["get", "weight"],
            0, 0, 5000, 1,
          ],
          "heatmap-intensity": [
            "interpolate", ["linear"], ["zoom"],
            0, 1, 15, 3,
          ],
          "heatmap-radius": [
            "interpolate", ["linear"], ["zoom"],
            0, 2, 12, 20, 15, 30,
          ],
          "heatmap-color": [
            "interpolate", ["linear"], ["heatmap-density"],
            0, "rgba(33,102,172,0)",
            0.2, "rgb(103,169,207)",
            0.4, "rgb(209,229,240)",
            0.6, "rgb(253,219,199)",
            0.8, "rgb(239,138,98)",
            1, "rgb(178,24,43)",
          ],
          "heatmap-opacity": 0.8,
        },
        layout: { visibility: "none" },
      });
    }
  }, []);

  const ensureCoverageLayer = useCallback(() => {
    if (!map.current) return;
    if (!map.current.getSource("go-transit-coverage")) {
      map.current.addSource("go-transit-coverage", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
    }
    if (!map.current.getLayer("go-transit-coverage-layer")) {
      map.current.addLayer({
        id: "go-transit-coverage-layer",
        type: "circle",
        source: "go-transit-coverage",
        paint: {
          "circle-radius": [
            "interpolate", ["exponential", 2], ["zoom"],
            7, 3, 10, 20, 13, 120, 16, 800,
          ],
          "circle-color": "#22c55e",
          "circle-opacity": 0.06,
          "circle-stroke-color": "#22c55e",
          "circle-stroke-width": 0.5,
          "circle-stroke-opacity": 0.3,
        },
        layout: { visibility: "none" },
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
    const draw = new MapboxDraw({
      displayControlsDefault: false,
      controls: { polygon: true, trash: true },
    });
    map.current.addControl(draw, "top-left");
    drawRef.current = draw;

    const handleStyleLoad = () => {
      ensureUnionPearsonLayers();
      ensureGOTransitLayers();
      ensureCustomRoutesLayers();
      ensureSimulationLayer();
      ensureHeatmapLayer();
      ensureCoverageLayer();
      setMapReady(true);
    };

    map.current.on("style.load", handleStyleLoad);

    // Handle line drawing completion
    map.current.on("draw.create", async (e: { features: GeoJSON.Feature[] }) => {
      const snappedStops = await handleDrawCreate(e);
      if (snappedStops.length > 0) {
        // Clear the drawn geometry from the map
        drawRef.current?.deleteAll();
        drawRef.current?.changeMode("simple_select");
        // Dispatch stops to the route builder one by one
        snappedStops.forEach((stop) => {
          window.dispatchEvent(
            new CustomEvent("route-builder-add-stop", {
              detail: { name: stop.name, lat: stop.lat, lng: stop.lng },
            })
          );
        });
        setActivePanel("builder");
        window.dispatchEvent(new CustomEvent("route-builder-draw-complete"));
      }
    });

    return () => {
      map.current?.off("style.load", handleStyleLoad);
      map.current?.remove();
      map.current = null;
      drawRef.current = null;
      setMapReady(false);
    };
  }, [ensureUnionPearsonLayers, ensureGOTransitLayers, ensureCustomRoutesLayers, ensureSimulationLayer, ensureHeatmapLayer, ensureCoverageLayer, handleDrawCreate]);

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
  }, [showUnionPearson]);

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
  }, [showGoTransit]);

  // Update heatmap layer visibility and load data on first toggle
  useEffect(() => {
    if (!map.current || !map.current.isStyleLoaded()) return;
    if (map.current.getLayer("go-transit-heatmap-layer")) {
      map.current.setLayoutProperty(
        "go-transit-heatmap-layer",
        "visibility",
        showHeatmap ? "visible" : "none"
      );
    }
    if (showHeatmap) {
      const source = map.current.getSource("go-transit-heatmap") as mapboxgl.GeoJSONSource | undefined;
      if (source) {
        // Check if already loaded by checking features
        fetch("/api/gotransit/heatmap")
          .then((r) => r.json())
          .then((data: GeoJSON.FeatureCollection) => {
            source.setData(data);
          })
          .catch(console.error);
      }
    }
  }, [showHeatmap, mapReady]);

  // Update coverage layer visibility and load data on first toggle
  useEffect(() => {
    if (!map.current || !map.current.isStyleLoaded()) return;
    if (map.current.getLayer("go-transit-coverage-layer")) {
      map.current.setLayoutProperty(
        "go-transit-coverage-layer",
        "visibility",
        showCoverage ? "visible" : "none"
      );
    }
    if (showCoverage) {
      const source = map.current.getSource("go-transit-coverage") as mapboxgl.GeoJSONSource | undefined;
      if (source) {
        fetch("/api/gotransit/coverage")
          .then((r) => r.json())
          .then((data: GeoJSON.FeatureCollection) => {
            source.setData(data);
          })
          .catch(console.error);
      }
    }
  }, [showCoverage, mapReady]);

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

      const fetchChunkPayload = async (
        chunk: string[],
        includeUpxFlag: boolean,
        chunkIndex: number,
      ) => {
        const params = new URLSearchParams({
          date: simulationDate,
          start: simulationStart,
          end: simulationEnd,
          includeUpx: includeUpxFlag ? "true" : "false",
          routeShortNames: chunk.join(","),
          debug: "1",
        });
        if (routeTypes) {
          params.set("routeTypes", routeTypes);
        }
        const requestUrl = `/api/simulation?${params.toString()}`;
        console.log("[SIM] Request", {
          chunkIndex,
          chunkTotal: routeChunks.length,
          requestUrl,
          routes: chunk,
          date: simulationDate,
          start: simulationStart,
          end: simulationEnd,
          includeUpx: includeUpxFlag,
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
            chunkIndex,
            status: response.status,
            errorPayload,
          });
          const requestId = errorPayload?.requestId
            ? String(errorPayload.requestId)
            : "n/a";
          const apiError = errorPayload?.error ? String(errorPayload.error) : "";
          const apiDetails =
            errorPayload?.details &&
            typeof errorPayload.details === "object" &&
            "message" in errorPayload.details
              ? String((errorPayload.details as Record<string, unknown>).message)
              : "";
          throw new Error(
            `HTTP ${response.status} ${apiError}${
              apiDetails ? ` — ${apiDetails}` : ""
            } (chunk ${chunkIndex}/${routeChunks.length}, requestId: ${requestId})`,
          );
        }

        return (await response.json()) as {
          startSeconds: number;
          endSeconds: number;
          trips: SimulationTrip[];
          diagnostics?: Record<string, unknown>;
        };
      };

      for (let i = 0; i < routeChunks.length; i += 1) {
        const chunk = routeChunks[i];
        let payload: {
          startSeconds: number;
          endSeconds: number;
          trips: SimulationTrip[];
          diagnostics?: Record<string, unknown>;
        };
        try {
          payload = await fetchChunkPayload(
            chunk,
            includeUpxInSimulation,
            i + 1,
          );
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          const likelyFileMissing =
            /ENOENT|no such file|Failed to build simulation data/i.test(message);
          if (includeUpxInSimulation && likelyFileMissing) {
            console.warn(
              `[SIM] Chunk ${i + 1} failed with UPX enabled; retrying without UPX`,
            );
            payload = await fetchChunkPayload(chunk, false, i + 1);
          } else {
            throw error;
          }
        }

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

  const clearSimulationTrackers = useCallback(() => {
    setSimulationTrips([]);
    setSimulationPlaying(false);
    setFocusedSimulationTripId(null);
    setSimulationError(null);
    setSimulationCurrent(parseShortTime(simulationStart) ?? 0);
  }, [simulationStart]);

  

  const toggleSimulationRoute = useCallback(
    (routeId: string) => {
      setSimulationRoutes((prev) => {
        const next = prev.includes(routeId)
          ? prev.filter((id) => id !== routeId)
          : [...prev, routeId];
        return next;
      });
      clearSimulationTrackers();
    },
    [clearSimulationTrackers],
  );

  const resetSimulationInputs = () => {
    const today = new Date().toISOString().slice(0, 10);
    setSimulationDate(today);
    setSimulationRoutes([]);
    setSimulationStart("05:30");
    setSimulationEnd("13:00");
    setSimulationSpeed(60);
    setIncludeUpxInSimulation(false);
    clearSimulationTrackers();
  };

  const showAllNetworks = () => {
    setShowGoTransit(true);
    setShowUnionPearson(true);
    setShowCustomNetwork(true);
  };

  // Track map center for stop search
  useEffect(() => {
    if (!map.current) return;
    const updateCenter = () => {
      const center = map.current!.getCenter();
      setMapCenter({ lat: center.lat, lng: center.lng });
    };
    map.current.on("move", updateCenter);
    return () => {
      map.current?.off("move", updateCenter);
    };
  }, [mapReady]);

  // Command bar handlers
  const handleCreateRoute = () => {
    setActivePanel("builder");
  };

  const handleAddStopFromCommandBar = (stop: { name: string; lat: number; lng: number }) => {
    // Trigger route builder to add a stop
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("route-builder-add-stop", {
          detail: { name: stop.name, lat: stop.lat, lng: stop.lng },
        })
      );
    }
    setActivePanel("builder");
  };

  

  const handleAIRoute = (route: {
    name: string;
    stops: Array<{ name: string; lat: number; lng: number; reasoning?: string }>;
    reasoning: string;
  }) => {
    // Create stops array for the route builder
    const stops = route.stops.map((stop, index) => ({
      name: stop.name,
      lat: stop.lat,
      lng: stop.lng,
    }));

    // Dispatch event to route builder with AI-generated route
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("route-builder-ai-route", {
          detail: {
            name: route.name,
            stops,
            reasoning: route.reasoning,
          },
        })
      );
    }

    // Open route builder to show the generated route
    setActivePanel("builder");
  };

  useEffect(() => {
    if (typeof window === "undefined") return;
    const openBuilder = () => setActivePanel("builder");
    window.addEventListener("route-builder-open", openBuilder);
    return () => {
      window.removeEventListener("route-builder-open", openBuilder);
    };
  }, []);

  // Schedule modal handlers
  const handleSaveSchedule = (schedule: Schedule) => {
    if (pendingScheduleRouteId) {
      const route = savedCustomRoutes.find((r) => r.id === pendingScheduleRouteId);
      if (route) {
        // Update the route with schedule
        const updated = { ...route, schedule };
        const nextRoutes = savedCustomRoutes.map((r) =>
          r.id === pendingScheduleRouteId ? updated : r
        );
        setSavedCustomRoutes(nextRoutes);

        // Save to localStorage
        if (typeof window !== "undefined") {
          localStorage.setItem("route_builder_routes", JSON.stringify(nextRoutes));
          window.dispatchEvent(
            new CustomEvent("route-builder-saved", {
              detail: { routeId: pendingScheduleRouteId },
            })
          );
        }
      }
    }
    setShowScheduleModal(false);
    setPendingScheduleRouteId(null);
  };

  // Listen for route finalization event
  useEffect(() => {
    const handleRouteFinalized = (e: Event) => {
      const detail = (e as CustomEvent<{ routeId: string }>).detail;
      if (detail?.routeId) {
        setPendingScheduleRouteId(detail.routeId);
        setShowScheduleModal(true);
      }
    };
    window.addEventListener("route-builder-finalized", handleRouteFinalized);
    return () => {
      window.removeEventListener("route-builder-finalized", handleRouteFinalized);
    };
  }, []);

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

      <Header activePanel={activePanel} onPanelToggle={handlePanelToggle} />

      <SidePanel
        title="Networks"
        isOpen={activePanel === "networks"}
        onClose={() => setActivePanel(null)}
      >
        <NetworksPanel
          showGoTransit={showGoTransit}
          setShowGoTransit={setShowGoTransit}
          showUnionPearson={showUnionPearson}
          setShowUnionPearson={setShowUnionPearson}
          showCustomNetwork={showCustomNetwork}
          setShowCustomNetwork={setShowCustomNetwork}
          onShowAll={showAllNetworks}
          showHeatmap={showHeatmap}
          setShowHeatmap={setShowHeatmap}
          showCoverage={showCoverage}
          setShowCoverage={setShowCoverage}
        />
      </SidePanel>

      <SidePanel
        title="Route Filters"
        isOpen={activePanel === "filters"}
        onClose={() => setActivePanel(null)}
      >
        {showGoTransit || showCustomNetwork ? (
          <>
            <FiltersPanel
              goVariantFilterText={goVariantFilterText}
              setGoVariantFilterText={setGoVariantFilterText}
              showGoBuses={showGoBuses}
              setShowGoBuses={setShowGoBuses}
              showGoTrains={showGoTrains}
              setShowGoTrains={setShowGoTrains}
              groupedGoVariants={groupedGoVariants}
              selectedVariantIds={selectedVariantIds}
              allVariantIds={allVariantIds}
              setVariantGroup={setVariantGroup}
              setSelectedVariantIds={setSelectedVariantIds}
            />

            {showCustomNetwork && savedCustomRoutes.length > 0 && (
              <div className="mt-6 border-t border-white/10 pt-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="text-xs font-bold text-neutral-300 uppercase tracking-wider">
                    Custom Routes
                  </div>
                  <div className="flex gap-2">
                    <button
                      className="text-xs font-semibold text-blue-400 hover:text-blue-300 transition-colors"
                      onClick={() => setSelectedCustomRouteIds(savedCustomRoutes.map((r) => r.id))}
                    >
                      All
                    </button>
                    <button
                      className="text-xs font-semibold text-neutral-400 hover:text-white transition-colors"
                      onClick={() => setSelectedCustomRouteIds([])}
                    >
                      None
                    </button>
                  </div>
                </div>
                <div className="space-y-1.5">
                  {savedCustomRoutes
                    .filter((r) => r.stops.length >= 2 && r.geometry)
                    .map((r) => (
                      <label
                        key={r.id}
                        className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-white/5 transition-all cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          className="w-4 h-4 rounded accent-violet-400 cursor-pointer"
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
                        <span className="text-sm text-neutral-200 flex-1 truncate">
                          {r.name}
                        </span>
                      </label>
                    ))}
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="text-sm text-neutral-400">
            Enable a network to see filters.
          </div>
        )}
      </SidePanel>

      {activePanel === "simulation" && (
        <div className="absolute left-1/2 top-20 z-30 w-[720px] max-w-[92vw] -translate-x-1/2 rounded-2xl border border-white/10 bg-black/85 shadow-2xl">
          <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
            <div className="text-xs font-bold uppercase tracking-wider text-white">
              Simulation
            </div>
            <button
              onClick={() => setActivePanel(null)}
              className="text-xs text-white/60 hover:text-white transition-colors"
            >
              Close
            </button>
          </div>
          <div className="p-4 space-y-4">
            <div className="flex flex-wrap items-center gap-3 text-xs">
              <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                <span className="text-white/60">Date</span>
                <input
                  type="date"
                  value={simulationDate}
                  onChange={(e) => setSimulationDate(e.target.value)}
                  className="bg-transparent text-white/90 focus:outline-none"
                />
              </div>

              <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                <span className="text-white/60">Time</span>
                <input
                  type="time"
                  value={simulationStart}
                  onChange={(e) => setSimulationStart(e.target.value)}
                  className="bg-transparent text-white/90 focus:outline-none"
                />
                <span className="text-white/40">→</span>
                <input
                  type="time"
                  value={simulationEnd}
                  onChange={(e) => setSimulationEnd(e.target.value)}
                  className="bg-transparent text-white/90 focus:outline-none"
                />
              </div>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/80 hover:bg-white/10 transition-all">
                    Routes
                    <span className="text-white/50">({simulationRoutes.length})</span>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-64 bg-black/90 text-white">
                  <DropdownMenuLabel className="text-white/50">
                    Select routes
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator className="bg-white/10" />
                  {simulationRouteOptions.length === 0 ? (
                    <DropdownMenuCheckboxItem checked={false}>
                      21
                    </DropdownMenuCheckboxItem>
                  ) : (
                    simulationRouteOptions.map((opt) => (
                      <DropdownMenuCheckboxItem
                        key={opt.value}
                        checked={simulationRoutes.includes(opt.value)}
                        onCheckedChange={() => toggleSimulationRoute(opt.value)}
                      >
                        {opt.label}
                      </DropdownMenuCheckboxItem>
                    ))
                  )}
                  <DropdownMenuSeparator className="bg-white/10" />
                  <div className="px-2 py-2 text-[10px] text-white/40">
                    Multiple select enabled.
                  </div>
                </DropdownMenuContent>
              </DropdownMenu>

              <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                <span className="text-white/60">Speed</span>
                <select
                  value={simulationSpeed}
                  onChange={(e) => setSimulationSpeed(Number(e.target.value))}
                  className="bg-transparent text-white/90 focus:outline-none"
                >
                  <option value={1}>1x</option>
                  <option value={30}>30x</option>
                  <option value={60}>60x</option>
                  <option value={120}>120x</option>
                  <option value={300}>300x</option>
                  <option value={600}>600x</option>
                  <option value={1000}>1000x</option>
                </select>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={loadSimulation}
                  disabled={simulationLoading}
                  className="px-4 py-2 rounded-xl bg-gradient-to-r from-blue-600 to-purple-600 text-xs font-semibold text-white disabled:opacity-50"
                >
                  {simulationLoading ? "Loading..." : "Start"}
                </button>
                <button
                  onClick={() => setSimulationPlaying((prev) => !prev)}
                  disabled={!simulationTrips.length}
                  className="px-3 py-2 rounded-xl bg-white/5 text-xs font-semibold text-neutral-300 hover:bg-white/10 border border-white/10 disabled:opacity-40"
                >
                  {simulationPlaying ? "Pause" : "Play"}
                </button>
                <button
                  onClick={clearSimulationTrackers}
                  className="px-3 py-2 rounded-xl bg-white/5 text-xs font-semibold text-neutral-300 hover:bg-white/10 border border-white/10"
                >
                  Clear
                </button>
                <button
                  onClick={resetSimulationInputs}
                  className="px-3 py-2 rounded-xl bg-white/5 text-xs font-semibold text-neutral-300 hover:bg-white/10 border border-white/10"
                >
                  Reset
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-neutral-400">
                <span>{formatShortTime(parseShortTime(simulationStart) ?? 0)}</span>
                <span className="text-white font-semibold">
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
                className="w-full accent-blue-400"
              />
              <div className="text-xs text-neutral-500">
                {simulationTrips.length} trips loaded
              </div>
              {simulationError && (
                <div className="text-xs text-red-300">{simulationError}</div>
              )}
            </div>
          </div>
        </div>
      )}

      {(simulationTrips.length > 0 || simulationPlaying) && (
        <div className="absolute top-4 right-4 z-30 rounded-xl border border-white/10 bg-black/70 px-3 py-2 text-xs text-white/80 shadow-lg">
          <div className="flex items-center gap-2">
            <span className="text-white/60">Time</span>
            <span className="font-semibold text-white">
              {formatShortTime(simulationCurrent)}
            </span>
          </div>
          <div className="text-[10px] text-white/50">
            {simulationTrips.length} trips loaded
          </div>
        </div>
      )}

      {/* Panels - right side */}
      <div className="absolute top-4 right-4 bottom-4 z-10 flex max-w-[calc(100vw-1rem)] flex-col gap-3 overflow-y-auto pr-1">
        {/* Route Builder Panel - mount when building or when custom network on (to show building route) */}
        {(showRouteBuilder || showCustomNetwork || showScheduleBuilder) && (
          <RouteBuilder
            mapRef={map}
            mapReady={mapReady}
            enabled={showRouteBuilder}
            showPanel={showRouteBuilder}
            showSchedulePanel={showScheduleBuilder}
            onCloseSchedule={() => setActivePanel(null)}
            goVariantsIndex={goVariantsIndex}
            goVariantStops={goVariantStops}
            showCustomNetwork={showCustomNetwork}
            drawRef={drawRef}
            isDrawing={isDrawing}
            onStartDraw={() => startDraw(drawRef)}
            onCancelDraw={() => cancelDraw(drawRef)}
            onOpenComparison={() => setShowComparison((prev) => !prev)}
          />
        )}

      </div>

      {/* Route Command Bar */}
      <RouteCommandBar
        enabled={!simulationPlaying}
        onCreateRoute={handleCreateRoute}
        onAddStop={handleAddStopFromCommandBar}
        onAIRoute={handleAIRoute}
        mapCenter={mapCenter}
      />

      {/* Comparison Panel */}
      {showComparison && (
        <ComparisonPanel
          customRoute={
            savedCustomRoutes.find((r) => r.stops.length >= 2) ?? {
              id: "",
              name: "Custom Route",
              color: "#3b82f6",
              profile: "mapbox/driving" as const,
              stops: [],
            }
          }
          goRoutes={goRoutes}
          onClose={() => setShowComparison(false)}
        />
      )}

      {/* Schedule Modal */}
      <ScheduleModal
        isOpen={showScheduleModal}
        onClose={() => {
          setShowScheduleModal(false);
          setPendingScheduleRouteId(null);
        }}
        onSave={handleSaveSchedule}
        routeName={
          pendingScheduleRouteId
            ? savedCustomRoutes.find((r) => r.id === pendingScheduleRouteId)?.name
            : undefined
        }
      />

      <div ref={mapContainer} className="h-full w-full" />
    </div>
  );
}
