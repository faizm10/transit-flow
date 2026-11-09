"use client";

import { useState, useEffect, useCallback, useRef, Suspense } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import mapboxgl from "mapbox-gl";
import { Loader2, MapPinOff } from "lucide-react";
import { toast } from "sonner";
import { v4 as uuidv4 } from "uuid";
import { MapHandle } from "@/components/Map";
import BrowsePanel from "@/components/panels/BrowsePanel";
import DesignPanel, { type DesignTab } from "@/components/panels/DesignPanel";
import ScheduleModal from "@/components/panels/ScheduleModal";
import TestRouteModal from "@/components/panels/TestRouteModal";
import TestPanel from "@/components/panels/TestPanel";
import MapNav, { MOBILE_NAV_OFFSET, type MapStep } from "@/components/map/MapNav";
import NetworkImpactModal from "@/components/panels/NetworkImpactModal";
import JourneyTestMapBar from "@/components/overlays/JourneyTestMapBar";
import { journeyOverlay } from "@/lib/journey/mapOverlay";
import type { Journey } from "@/lib/journey/types";
import SimulationHUD from "@/components/panels/SimulationHUD";
import RouteTooltip from "@/components/overlays/RouteTooltip";
import RouteInfoCard from "@/components/overlays/RouteInfoCard";
import ShareModal from "@/components/community/ShareModal";
import VehicleInfoPopup from "@/components/overlays/VehicleInfoPopup";
import DrawGuide from "@/components/overlays/DrawGuide";
import ServiceStatusPill from "@/components/overlays/ServiceStatusPill";
import OpenRailwayMapOverlayControls from "@/components/overlays/OpenRailwayMapOverlayControls";
import { OPENRAILWAYMAP_OVERLAY_ENABLED, GAP_FINDER_BETA_ENABLED } from "@/lib/features";
import { useRoutes } from "@/hooks/useRoutes";
import { useStations } from "@/hooks/useStations";
import { useSimulation } from "@/hooks/useSimulation";
import { useCityFeeds } from "@/hooks/useCityFeeds";
import { useServiceAlerts } from "@/hooks/useServiceAlerts";
import { isRailCode } from "@/lib/mapServiceAlerts";
import GapFinderBeta from "@/components/overlays/GapFinderBeta";
import type { NetworkGap } from "@/lib/networkGaps";
import AddCityFeedModal from "@/components/panels/AddCityFeedModal";
import type { CityFeedMeta } from "@/lib/cityGtfs";
import { networkRouteFilters } from "@/lib/mapEntry";
import { type CustomRoute, type CustomSchedule, type CustomStop, type EnrichedRoute, type RouteFilters } from "@/lib/gtfs";
import { customRouteSelectionId, formatSimDate } from "@/lib/simulation";

// Dynamically import Map to avoid SSR issues with mapbox-gl
const Map = dynamic(() => import("@/components/Map"), { ssr: false });

type Mode = "browse" | "build" | "test" | "schedule" | "simulate" | null;

interface ClickedRoute {
  shortName: string;
  variantId: string;
  variantLabel?: string;
  fromStop?: string;
  toStop?: string;
  tripCount?: number;
  color?: string;
  routeType?: "bus" | "train";
  isCustom?: boolean;
}

/** Which step of Explore → Design → Test → Share a mode belongs to. */
function stepForMode(mode: Mode): MapStep | null {
  if (mode === "browse" || mode === "schedule") return "explore";
  if (mode === "build") return "design";
  if (mode === "test" || mode === "simulate") return "test";
  return null;
}

const VALID_MODES: Mode[] = ["browse", "build", "test", "schedule", "simulate"];

function designParamToTab(d: string | null): DesignTab | null {
  if (d === "new") return "new";
  if (d === "extend") return "existing";
  if (d === "stations") return "stations";
  return null;
}

function designTabToUrl(tab: DesignTab): "new" | "extend" | "stations" {
  if (tab === "existing") return "extend";
  if (tab === "new") return "new";
  return "stations";
}

/** Stable numeric id from a trip_id string (for Mapbox feature-state) */
function tripIdToNum(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) {
    h = ((h * 31) + id.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function customRouteMapGeometry(route: CustomRoute): [number, number][] | null {
  if (route.geometry && route.geometry.length >= 2) return route.geometry;
  const stopGeometry = route.stops.map((stop) => [stop.lon, stop.lat] as [number, number]);
  return stopGeometry.length >= 2 ? stopGeometry : null;
}

// Lookup enriched route data from the already-fetched routes cache
let routesCache: Record<string, { fromStop: string; toStop: string; totalTrips: number; variants: { variant_id: string; label: string }[] }> | null = null;

async function getRoutesCache() {
  if (routesCache) return routesCache;
  try {
    const res = await fetch("/api/routes");
    const data = await res.json();
    routesCache = {};
    for (const r of data.routes ?? []) {
      routesCache[r.short_name] = {
        fromStop: r.from_stop,
        toStop: r.to_stop,
        totalTrips: r.total_trips,
        variants: r.variants,
      };
    }
  } catch {
    routesCache = {};
  }
  return routesCache!;
}

function MapPageContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const mapRef = useRef<MapHandle | null>(null);
  /** After user turns off Explore/Design/etc., bare /map must not auto-reopen Explore. */
  const suppressBareMapExploreAutoRef = useRef(false);
  const [mode, setMode] = useState<Mode>(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [hoveredRoute, setHoveredRoute] = useState<{ shortName: string; variantId: string } | null>(null);
  const [clickedRoute, setClickedRoute] = useState<ClickedRoute | null>(null);
  const [shareTarget, setShareTarget] = useState<CustomRoute | null>(null);
  const [mapError, setMapError] = useState<"webgl" | "token" | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawnGeometry, setDrawnGeometry] = useState<[number, number][] | null>(null);
  const [editingRoute, setEditingRoute] = useState<CustomRoute | undefined>();
  /** Endpoints handed to the builder from Gap Finder. */
  const [gapSeed, setGapSeed] = useState<
    { stops: CustomStop[]; key: string; mode: "bus" | "train" } | null
  >(null);
  const [designTab, setDesignTab] = useState<DesignTab>(() => {
    if (typeof window === "undefined") return "new";
    const sp = new URLSearchParams(window.location.search);
    return (
      designParamToTab(sp.get("design"))
      ?? (sp.get("goRoute")?.trim() ? ("existing" as DesignTab) : null)
      ?? "new"
    );
  });
  const [extendSeedRoute, setExtendSeedRoute] = useState<EnrichedRoute | undefined>();
  /** Resolves GO line for Extend deep link (goRoute=) */
  const [extendSeedStatus, setExtendSeedStatus] = useState<"idle" | "loading" | "done" | "notfound">("idle");
  // true when one of the wizards signals a train route is being designed
  const [isTrainDesignMode, setIsTrainDesignMode] = useState(false);
  const [selectedVehicleTripId, setSelectedVehicleTripId] = useState<string | null>(null);
  const [routeFilters, setRouteFilters] = useState<RouteFilters>(networkRouteFilters());

  // ── Live GO service alerts ───────────────────────────────────────────────
  const { data: serviceAlerts, loaded: serviceAlertsLoaded } = useServiceAlerts();
  const [showAlertsOnMap, setShowAlertsOnMap] = useState(false);
  const railAlerts = (serviceAlerts?.alerts ?? []).filter((a) =>
    a.routes.some(isRailCode)
  );

  const { routes: customRoutes, saveRoute, deleteRoute } = useRoutes();
  const { stations: customStations, saveStation, deleteStation } = useStations();
  // ── "Test this route" journey comparison ─────────────────────────────────
  // The modal stays mounted (keeping its results) while the user looks at the
  // map: "picking" waits for one map click, "map" shows the drawn journeys.
  const [testRouteId, setTestRouteId] = useState<string | null>(null);
  const [testView, setTestView] = useState<"modal" | "picking" | "map">("modal");
  const testRoute = testRouteId ? customRoutes.find((r) => r.id === testRouteId) ?? null : null;

  const [impactRouteId, setImpactRouteId] = useState<string | null>(null);
  const impactRoute = impactRouteId ? customRoutes.find((r) => r.id === impactRouteId) ?? null : null;

  const openRouteTest = useCallback((routeId: string) => {
    mapRef.current?.setJourneyOverlay(null);
    setTestRouteId(routeId);
    setTestView("modal");
  }, []);

  const closeRouteTest = useCallback(() => {
    mapRef.current?.stopPinMode();
    mapRef.current?.setJourneyOverlay(null);
    setTestRouteId(null);
    setTestView("modal");
  }, []);

  const pickTestPlaceOnMap = useCallback((onPick: (lat: number, lon: number) => void) => {
    setTestView("picking");
    mapRef.current?.startPinMode((lat, lon) => {
      mapRef.current?.stopPinMode();
      onPick(lat, lon);
      setTestView("modal");
    });
  }, []);

  const showTestJourneysOnMap = useCallback((base: Journey | null, withRoute: Journey | null) => {
    mapRef.current?.setJourneyOverlay(
      journeyOverlay([
        { scenario: "base", journey: base },
        { scenario: "with", journey: withRoute },
      ]),
    );
    setTestView("map");
  }, []);

  // ── Uploaded city-GTFS overlays ──────────────────────────────────────────
  const {
    feeds: cityFeeds,
    visibleIds: visibleCityFeedIds,
    loadingIds: loadingCityFeedIds,
    parseProgress: cityFeedParseProgress,
    overlay: cityFeedsOverlay,
    isAuthenticated: cityFeedsAuthed,
    parseZip: parseCityFeedZip,
    cancelParse: cancelCityFeedParse,
    saveFeed: saveCityFeed,
    addLocalFeed: addLocalCityFeed,
    deleteFeed: deleteCityFeed,
    toggleFeed: toggleCityFeed,
  } = useCityFeeds();
  const [cityFeedModalOpen, setCityFeedModalOpen] = useState(false);

  const handleZoomCityFeed = useCallback((feed: CityFeedMeta) => {
    const [w, s, e, n] = feed.stats.bbox;
    if (![w, s, e, n].every(Number.isFinite)) return;
    mapRef.current?.getMap()?.fitBounds([[w, s], [e, n]], { padding: 80, maxZoom: 12 });
  }, []);

  const handleToggleCityFeed = useCallback(
    (id: string, visible: boolean) => {
      toggleCityFeed(id, visible).catch((err: unknown) => {
        toast.error(err instanceof Error ? err.message : "Could not load feed");
      });
    },
    [toggleCityFeed]
  );

  const requestDeleteCityFeed = useCallback(
    (id: string, name: string) => {
      toast.warning(`Delete "${name}"?`, {
        description: "This removes the saved city feed from your account.",
        action: {
          label: "Delete",
          onClick: () => {
            deleteCityFeed(id)
              .then(() => toast.success("City feed deleted"))
              .catch((err: unknown) =>
                toast.error(err instanceof Error ? err.message : "Could not delete feed")
              );
          },
        },
        cancel: { label: "Cancel", onClick: () => undefined },
      });
    },
    [deleteCityFeed]
  );

  // Patch just the schedule field of a custom route
  const handleSaveSchedule = useCallback((routeId: string, schedule: CustomSchedule) => {
    const route = customRoutes.find((r) => r.id === routeId);
    if (!route) return;
    saveRoute({ ...route, schedule });
    toast.success("Schedule saved");
  }, [customRoutes, saveRoute]);
  const sim = useSimulation(customRoutes);

  useEffect(() => {
    if (mode !== "simulate") setSelectedVehicleTripId(null);
  }, [mode]);

  useEffect(() => {
    if (!selectedVehicleTripId) return;
    if (!sim.trips.some((t) => t.trip_id === selectedVehicleTripId)) {
      setSelectedVehicleTripId(null);
    }
  }, [sim.trips, selectedVehicleTripId]);

  const patchSearch = useCallback(
    (updates: Record<string, string | null | undefined>) => {
      const p = new URLSearchParams(searchParams.toString());
      for (const [k, v] of Object.entries(updates)) {
        if (v === null || v === undefined || v === "") p.delete(k);
        else p.set(k, String(v));
      }
      const qs = p.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams]
  );


  // Import a shared community route when ?community_route=<id> is present
  useEffect(() => {
    const communityRouteId = searchParams.get("community_route");
    if (!communityRouteId) return;

    fetch(`/api/community/posts/${communityRouteId}`)
      .then((r) => r.json())
      .then((data: { post?: { routeData?: CustomRoute; title?: string } }) => {
        const routeData = data.post?.routeData;
        if (!routeData) return;
        const importedRoute: CustomRoute = {
          ...routeData,
          id: uuidv4(),
          createdAt: new Date().toISOString(),
        };
        saveRoute(importedRoute);
        toast.success(`"${data.post?.title ?? importedRoute.name}" loaded into your routes`);
        patchSearch({ community_route: null });
      })
      .catch(() => {
        toast.error("Could not load the shared route");
        patchSearch({ community_route: null });
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // First visit to bare /map: open Explore + network entry. After user dismisses a mode, do not snap back.
  useEffect(() => {
    const entry = searchParams.get("entry");
    const modeParam = searchParams.get("mode");
    if (modeParam) return;
    if (searchParams.toString() === "" && suppressBareMapExploreAutoRef.current) {
      return;
    }
    if (!entry || entry === "network") {
      patchSearch({ entry: "network", mode: "browse" });
    }
  }, [searchParams, patchSearch]);

  const fetchExtendSeedIfNeeded = useCallback(
    async (goShort: string | null | undefined, tabIsExtend: boolean) => {
      const trimmed = goShort?.trim();
      if (!tabIsExtend || !trimmed) {
        setExtendSeedRoute(undefined);
        setExtendSeedStatus("idle");
        return;
      }
      const keyUpper = trimmed.toUpperCase();
      setExtendSeedStatus("loading");
      try {
        const res = await fetch("/api/routes");
        const data = await res.json();
        const routes: EnrichedRoute[] = data.routes ?? [];
        const match = routes.find((r) => r.short_name.toUpperCase() === keyUpper);
        if (match) {
          setExtendSeedRoute(match);
          setExtendSeedStatus("done");
        } else {
          setExtendSeedRoute(undefined);
          setExtendSeedStatus("notfound");
          toast.error(`GO route "${trimmed}" was not found`);
        }
      } catch {
        setExtendSeedRoute(undefined);
        setExtendSeedStatus("notfound");
        toast.error("Could not load GO routes");
      }
    },
    []
  );

  // ── Mode mirrors URL ───────────────────────────────────────────────────
  useEffect(() => {
    const m = searchParams.get("mode") as Mode | null;
    if (!m || !VALID_MODES.includes(m)) {
      setMode(null);
      return;
    }
    setMode(m);
  }, [searchParams]);

  // ── Design tab + Extend seed when build is committed in URL ───────────────
  useEffect(() => {
    if (searchParams.get("mode") !== "build") {
      setExtendSeedRoute(undefined);
      setExtendSeedStatus("idle");
      return;
    }
    const parsedDesign =
      searchParams.get("design") ? designParamToTab(searchParams.get("design")) : null;
    const resolvedTab =
      parsedDesign
        ?? (searchParams.get("goRoute")?.trim() ? ("existing" as DesignTab) : null);

    if (!resolvedTab) {
      setExtendSeedRoute(undefined);
      setExtendSeedStatus("idle");
      patchSearch({
        mode: "build",
        entry: "fresh",
        design: "new",
        goRoute: null,
      });
      return;
    }

    setDesignTab(resolvedTab);
    const go = searchParams.get("goRoute");
    void fetchExtendSeedIfNeeded(go, resolvedTab === "existing");
  }, [searchParams, fetchExtendSeedIfNeeded, patchSearch]);

  // ── Sync simulation vehicles to map ────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current?.getMap();
    if (!map || !mapLoaded) return;
    const source = map.getSource("sim-vehicles") as mapboxgl.GeoJSONSource | undefined;
    if (!source) return;
    source.setData({
      type: "FeatureCollection",
      features: sim.activeVehicles.map((v) => ({
        type: "Feature",
        id: tripIdToNum(v.tripId),
        geometry: { type: "Point", coordinates: v.pos },
        properties: {
          color: v.color,
          routeName: v.routeName,
          lineName: v.lineName,
          tripId: v.tripId,
          destination: v.destination,
          startTime: v.startTime,
          endTime: v.endTime,
          nextStopName: v.nextStopName ?? "",
          secsToNextStop: Math.round(v.secsToNextStop),
          routeType: v.routeType,  // 2=rail, 3=bus
          serviceDate: formatSimDate(sim.date),
        },
      })),
    });
  }, [sim.activeVehicles, sim.date, mapLoaded]);

  // ── Sync custom routes to map ───────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current?.getMap();
    if (!map || !mapLoaded) return;
    const source = map.getSource("custom-routes") as mapboxgl.GeoJSONSource | undefined;
    if (!source) return;
    source.setData({
      type: "FeatureCollection",
      features: customRoutes
        .map((r) => {
          const geometry = customRouteMapGeometry(r);
          if (!geometry) return null;
          return {
            type: "Feature" as const,
            geometry: { type: "LineString" as const, coordinates: geometry },
            properties: {
              color: r.color,
              name: r.name || "Custom route",
              id: r.id,
              type: r.type,
              fromStop: r.stops[0]?.name ?? "",
              toStop: r.stops[r.stops.length - 1]?.name ?? "",
            },
          };
        })
        .filter((feature): feature is NonNullable<typeof feature> => feature !== null),
    });
  }, [customRoutes, mapLoaded]);

  // ── Sync custom stations to map ────────────────────────────────────────
  useEffect(() => {
    if (!mapLoaded) return;
    mapRef.current?.updateStations(customStations);
  }, [customStations, mapLoaded]);

  // ── Sync uploaded city-GTFS overlays to map ─────────────────────────────
  useEffect(() => {
    if (!mapLoaded) return;
    mapRef.current?.setCityFeedData(cityFeedsOverlay.lines, cityFeedsOverlay.stops);
  }, [cityFeedsOverlay, mapLoaded]);

  // ── Sync live service alerts to the map overlay ────────────────────────
  useEffect(() => {
    if (!mapLoaded) return;
    mapRef.current?.setServiceAlerts(showAlertsOnMap ? railAlerts : null);
    // railAlerts is a fresh array each render; key the effect on its contents
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapLoaded, showAlertsOnMap, JSON.stringify(railAlerts.map((a) => a.id))]);

  // Turn the overlay off if the alerts clear out from under it.
  useEffect(() => {
    if (showAlertsOnMap && railAlerts.length === 0 && serviceAlertsLoaded) {
      setShowAlertsOnMap(false);
    }
  }, [showAlertsOnMap, railAlerts.length, serviceAlertsLoaded]);

  // Drop the Gap Finder seed once we've actually left the builder (not before
  // build mode has had a chance to activate).
  const gapSeedConsumedRef = useRef(false);
  useEffect(() => {
    if (mode === "build" && gapSeed) gapSeedConsumedRef.current = true;
    else if (mode !== "build" && gapSeedConsumedRef.current) {
      gapSeedConsumedRef.current = false;
      setGapSeed(null);
    }
  }, [mode, gapSeed]);

  // ── Sync route visibility filters to map layers ─────────────────────────
  useEffect(() => {
    if (!mapLoaded) return;
    mapRef.current?.setVisibleRouteFilter(routeFilters.goRouteShortNames, routeFilters.customRouteIds);
  }, [mapLoaded, routeFilters]);

  // ── Map event handlers ──────────────────────────────────────────────────
  const handleMapLoad = useCallback((_map: mapboxgl.Map) => {
    setMapLoaded(true);
  }, []);

  const handleMapDestroy = useCallback(() => {
    setMapLoaded(false);
  }, []);

  // Click works in ALL modes — always highlights + shows info card
  const handleRouteClick = useCallback(async (variantId: string, shortName: string) => {
    setSelectedVehicleTripId(null);
    // Highlight just this variant
    mapRef.current?.setRouteHighlight([variantId]);

    // Look up enriched data from routes cache
    const cache = await getRoutesCache();
    const routeData = cache[shortName];
    const variant = routeData?.variants.find((v) => v.variant_id === variantId);

    setClickedRoute({
      shortName,
      variantId,
      variantLabel: variant?.label,
      fromStop: routeData?.fromStop,
      toStop: routeData?.toStop,
      tripCount: routeData?.totalTrips,
    });

    // If browse panel is open, keep it in sync
    if (routeData?.variants) {
      // Highlight all variants of this route in the browse panel selection
    }
  }, []);

  const handleCustomRouteClick = useCallback((route: {
    id: string;
    name: string;
    color: string;
    type: "bus" | "train";
    fromStop?: string;
    toStop?: string;
  }) => {
    setSelectedVehicleTripId(null);
    mapRef.current?.setRouteHighlight(null);
    setClickedRoute({
      shortName: route.name,
      variantId: route.id,
      variantLabel: route.type === "train" ? "Custom train route" : "Custom bus route",
      fromStop: route.fromStop,
      toStop: route.toStop,
      color: route.color,
      routeType: route.type,
      isCustom: true,
    });
  }, []);

  const handleRouteHover = useCallback((variantId: string | null, shortName: string | null) => {
    if (!variantId || !shortName) {
      setHoveredRoute(null);
    } else {
      setHoveredRoute({ shortName, variantId });
    }
  }, []);

  // ── Vehicle handlers ────────────────────────────────────────────────────
  const handleVehicleClick = useCallback((tripId: string) => {
    setClickedRoute(null);
    mapRef.current?.setRouteHighlight(null);
    setSelectedVehicleTripId((prev) => (prev === tripId ? null : tripId));
  }, []);

  const handleVehicleHover = useCallback((_tripId: string | null) => {
    // hover state is handled via Mapbox feature-state in Map.tsx
  }, []);

  // ── Browse panel handlers ───────────────────────────────────────────────
  const handleRouteSelect = useCallback((shortName: string, variantIds: string[]) => {
    mapRef.current?.setRouteHighlight(variantIds);
    setClickedRoute(null);
  }, []);

  const handleRouteClear = useCallback(() => {
    mapRef.current?.setRouteHighlight(null);
    setClickedRoute(null);
  }, []);

  const handleRouteFilterChange = useCallback((filters: RouteFilters) => {
    setRouteFilters(filters);
    mapRef.current?.setVisibleRouteFilter(filters.goRouteShortNames, filters.customRouteIds);
    mapRef.current?.setRouteHighlight(null);
    setHoveredRoute(null);
    setClickedRoute(null);
  }, []);

  // ── Draw mode handlers ──────────────────────────────────────────────────
  function startDrawing() {
    mapRef.current?.startDraw((coords) => {
      setDrawnGeometry(coords);
      setIsDrawing(false);
    });
    setIsDrawing(true);
  }

  function cancelDrawing() {
    mapRef.current?.stopDraw();
    setIsDrawing(false);
  }

  function finishDrawing() {
    mapRef.current?.finishDraw();
    setIsDrawing(false);
  }

  // ── Route edit / preview handlers (fed into BuilderWizard) ────────────────
  const handleEditRequest = useCallback(
    (coords: [number, number][], onChange: (coords: [number, number][]) => void) => {
      mapRef.current?.startEdit(coords, onChange);
    },
    []
  );

  const handleEditDone = useCallback(() => {
    mapRef.current?.stopEdit();
  }, []);

  const handlePreviewRoute = useCallback((coords: [number, number][], color: string) => {
    mapRef.current?.showPreviewRoute(coords, color);
  }, []);

  const handleClearPreview = useCallback(() => {
    mapRef.current?.clearPreviewRoute();
  }, []);

  // ── Builder handlers ────────────────────────────────────────────────────
  function handleSaveRoute(route: CustomRoute) {
    saveRoute(route);

    // ── Imperative map update ──────────────────────────────────────────────
    // React's useEffect fires asynchronously after commit, which creates a
    // visual gap: clearPreviewRoute() runs immediately (preview disappears)
    // but the custom-routes GeoJSON source isn't updated until the effect fires.
    // Fix: update both the GeoJSON source and the visibility filter right now,
    // before clearing the preview, so the route is always visible.
    const map = mapRef.current?.getMap();
    if (map && mapLoaded) {
      const existingIdx = customRoutes.findIndex((r) => r.id === route.id);
      const updatedRoutes =
        existingIdx >= 0
          ? customRoutes.map((r, i) => (i === existingIdx ? route : r))
          : [...customRoutes, route];

      const source = map.getSource("custom-routes") as mapboxgl.GeoJSONSource | undefined;
      if (source) {
        source.setData({
          type: "FeatureCollection",
          features: updatedRoutes
            .map((r) => {
              const geometry = customRouteMapGeometry(r);
              if (!geometry) return null;
              return {
                type: "Feature" as const,
                geometry: { type: "LineString" as const, coordinates: geometry },
                properties: {
                  color: r.color,
                  name: r.name || "Custom route",
                  id: r.id,
                  type: r.type,
                  fromStop: r.stops[0]?.name ?? "",
                  toStop: r.stops[r.stops.length - 1]?.name ?? "",
                },
              };
            })
            .filter((f): f is NonNullable<typeof f> => f !== null),
        });
      }

      // If the filter is an explicit allow-list, add the new route id now
      // (the React setRouteFilters + effect path also does this, but async)
      if (routeFilters.customRouteIds !== null) {
        const updatedIds = Array.from(
          new Set([...routeFilters.customRouteIds, route.id])
        );
        mapRef.current?.setVisibleRouteFilter(
          routeFilters.goRouteShortNames,
          updatedIds
        );
      }
    }

    setRouteFilters((current) => {
      if (current.customRouteIds === null) return current;
      return {
        ...current,
        customRouteIds: Array.from(new Set([...current.customRouteIds, route.id])),
      };
    });
    mapRef.current?.stopEdit();     // clean up if edit was active
    mapRef.current?.clearPreviewRoute();
    suppressBareMapExploreAutoRef.current = true;
    patchSearch({ mode: null, design: null, goRoute: null, entry: null });
    setEditingRoute(undefined);
    setDrawnGeometry(null);
    toast.success(`"${route.name || "Custom route"}" saved`, {
      action: { label: "Test this route", onClick: () => openRouteTest(route.id) },
    });
  }

  function cleanupDesignTools() {
    mapRef.current?.stopDraw();
    mapRef.current?.stopEdit();
    mapRef.current?.stopPinMode();
    mapRef.current?.clearPreviewRoute();
    setIsDrawing(false);
  }

  function handleDesignTabChange(tab: DesignTab) {
    cleanupDesignTools();
    setDesignTab(tab);
    const goPreserve =
      tab === "existing" ? searchParams.get("goRoute")?.trim() ?? null : null;
    if (tab === "existing") {
      setEditingRoute(undefined);
      setDrawnGeometry(null);
    }
    patchSearch({
      mode: "build",
      entry: tab === "existing" ? "network" : "fresh",
      design: designTabToUrl(tab),
      goRoute:
        tab === "existing" && goPreserve
          ? goPreserve
          : null,
    });
  }

  function closeDesignPanel() {
    cleanupDesignTools();
    suppressBareMapExploreAutoRef.current = true;
    patchSearch({ mode: null, design: null, goRoute: null, entry: null });
    setEditingRoute(undefined);
    setDrawnGeometry(null);
  }

  // ── Mode switcher (URL drives mode via patchSearch → useEffect) ─────────────
  function handleModeToggle(m: Mode) {
    if (mode === m) {
      suppressBareMapExploreAutoRef.current = true;
      mapRef.current?.setRouteHighlight(null);
      setClickedRoute(null);
      if (m === "build") {
        cleanupDesignTools();
        setEditingRoute(undefined);
        setDrawnGeometry(null);
      }
      patchSearch({ mode: null, design: null, goRoute: null, entry: null });
      return;
    }

    if (mode === "build") {
      cleanupDesignTools();
      setEditingRoute(undefined);
      setDrawnGeometry(null);
    }

    // Clear route info card when switching to build/simulate/schedule
    if (m !== "browse") setClickedRoute(null);
    if (m !== "browse") mapRef.current?.setRouteHighlight(null);

    if (m === "browse") {
      patchSearch({
        mode: "browse",
        entry: "network",
        design: null,
        goRoute: null,
      });
    } else if (m === "test") {
      patchSearch({
        mode: "test",
        entry: "network",
        design: null,
        goRoute: null,
      });
    } else if (m === "schedule") {
      patchSearch({
        mode: "schedule",
        entry: "network",
        design: null,
        goRoute: null,
      });
    } else if (m === "simulate") {
      patchSearch({
        mode: "simulate",
        entry: "network",
        design: null,
        goRoute: null,
      });
    } else if (m === "build") {
      const raw = searchParams.get("design");
      const parsed = raw ? designParamToTab(raw) : null;
      const go = searchParams.get("goRoute");

      if (parsed) {
        patchSearch({
          mode: "build",
          entry: parsed === "existing" ? "network" : "fresh",
          design: designTabToUrl(parsed),
          goRoute:
            parsed === "existing" && go?.trim()
              ? go.trim()
              : null,
        });
      } else if (go?.trim()) {
        patchSearch({
          mode: "build",
          entry: "network",
          design: "extend",
          goRoute: go.trim(),
        });
      } else {
        patchSearch({
          mode: "build",
          entry: "fresh",
          design: "new",
          goRoute: null,
        });
      }
    }
  }

  // Clicking "Explore this route" on info card opens browse panel
  function handleExploreFromCard() {
    if (!clickedRoute) return;
    if (clickedRoute.isCustom) {
      const route = customRoutes.find((r) => r.id === clickedRoute.variantId);
      if (route) {
        setEditingRoute(route);
        setDrawnGeometry(route.geometry ?? null);
        patchSearch({
          mode: "build",
          entry: "fresh",
          design: designTabToUrl("new"),
          goRoute: null,
        });
      }
      return;
    }
    patchSearch({
      mode: "browse",
      entry: "network",
      design: null,
      goRoute: null,
    });
    // Highlight stays applied on map
  }

  function deleteCustomRoute(routeId: string) {
    deleteRoute(routeId);
    setRouteFilters((current) => current.customRouteIds === null
      ? current
      : { ...current, customRouteIds: current.customRouteIds.filter((id) => id !== routeId) });
    if (editingRoute?.id === routeId) {
      setEditingRoute(undefined);
      setDrawnGeometry(null);
      suppressBareMapExploreAutoRef.current = true;
      patchSearch({ mode: null, design: null, goRoute: null, entry: null });
    }
    mapRef.current?.stopEdit();
    mapRef.current?.clearPreviewRoute();
    mapRef.current?.setRouteHighlight(null);
    setClickedRoute(null);
    toast.success("Route deleted");
  }

  function requestDeleteCustomRoute(routeId: string, routeName: string) {
    toast.warning(`Delete "${routeName}"?`, {
      description: "This removes the saved custom route from this browser.",
      action: {
        label: "Delete",
        onClick: () => deleteCustomRoute(routeId),
      },
      cancel: {
        label: "Cancel",
        onClick: () => undefined,
      },
    });
  }

  function handleDeleteFromCard() {
    if (!clickedRoute?.isCustom) return;
    requestDeleteCustomRoute(clickedRoute.variantId, clickedRoute.shortName);
  }

  const handleDesignFromGap = useCallback(
    (gap: NetworkGap) => {
      const toStop = (e: NetworkGap["from"], seq: number): CustomStop => ({
        id: uuidv4(),
        name: e.name.replace(/\s+Bus$/, ""),
        lat: e.lat,
        lon: e.lon,
        sequence: seq,
      });
      setGapSeed({
        stops: [toStop(gap.from, 1), toStop(gap.to, 2)],
        key: `gap-${gap.id}-${Date.now()}`,
        mode: gap.mode,
      });
      setDesignTab("new");
      patchSearch({ mode: "build", design: "new", entry: "fresh", goRoute: null });
      toast.success(`${gap.headline}: endpoints added — draw the alignment and add stops between.`);
    },
    [patchSearch]
  );

  const panelOpen = mode === "browse" || mode === "build" || mode === "test";
  const activeStep = stepForMode(mode);

  const handleStep = (step: MapStep) => {
    handleModeToggle(step === "explore" ? "browse" : step === "design" ? "build" : "test");
  };

  // Simulate from the Test panel: add the route to the selection, then open the simulator.
  const simulateRoute = (routeId: string | null) => {
    if (routeId) {
      const code = customRouteSelectionId(routeId);
      if (!sim.selectedRoutes.includes(code)) sim.setSelectedRoutes([...sim.selectedRoutes, code]);
    }
    handleModeToggle("simulate");
  };
  // Hide info card when browse panel is open (panel shows richer info)
  const showInfoCard = clickedRoute && !isDrawing && mode !== "browse";

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[var(--landing-band)]">
      {/* ── Full-screen map ─────────────────────────────────────────────── */}
      <div className={`absolute inset-0 ${MOBILE_NAV_OFFSET}`}>
        <Map
          ref={mapRef}
          onLoad={handleMapLoad}
          onMapDestroy={handleMapDestroy}
          onRouteClick={handleRouteClick}
          onCustomRouteClick={handleCustomRouteClick}
          onRouteHover={handleRouteHover}
          onVehicleClick={handleVehicleClick}
          onVehicleHover={handleVehicleHover}
          isTrainDesignMode={isTrainDesignMode}
          onError={setMapError}
        />
        {/* Dark-mode map tint — a light dim so the light Mapbox basemap reads
            as muted in dark mode without hiding routes or labels. Sits above
            the canvas, below every panel. Opacity is the knob to tune. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 hidden bg-[#0a1512]/35 dark:block"
        />
      </div>

      {/* ── Steps: Explore → Design → Test → Share ──────────────────────── */}
      <MapNav
        active={activeStep}
        onStep={handleStep}
        customRoutes={customRoutes}
        onShare={setShareTarget}
      />

      {/* ── Map loading / failure ───────────────────────────────────────── */}
      {mapError ? (
        <div className="absolute inset-0 z-10 flex items-center justify-center p-6">
          <div role="alert" className="tf-map-panel max-w-sm space-y-2 px-5 py-4 text-center">
            <MapPinOff className="mx-auto h-6 w-6 text-[var(--landing-faint)]" aria-hidden />
            <p className="text-sm font-semibold text-[var(--landing-ink)]">The map couldn&apos;t start</p>
            <p className="text-xs leading-relaxed text-[var(--landing-muted)]">
              {mapError === "webgl"
                ? "Your browser has WebGL turned off or unavailable, which the map needs. Try another browser or enable hardware acceleration."
                : "The map service isn't configured on this deployment."}{" "}
              Your saved routes are safe, and the panels still work.
            </p>
          </div>
        </div>
      ) : !mapLoaded ? (
        <div className="pointer-events-none absolute inset-x-0 top-1/2 z-10 flex justify-center">
          <p role="status" className="tf-map-panel flex items-center gap-2 px-3 py-2 text-xs text-[var(--landing-muted)]">
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> Loading map…
          </p>
        </div>
      ) : null}

      {!isDrawing && (
        <ServiceStatusPill
          className={panelOpen ? "max-md:hidden" : undefined}
          data={serviceAlerts}
          loaded={serviceAlertsLoaded}
          canToggle={railAlerts.length > 0}
          showOnMap={showAlertsOnMap}
          onShowOnMapChange={setShowAlertsOnMap}
        />
      )}

      {OPENRAILWAYMAP_OVERLAY_ENABLED && (
        <OpenRailwayMapOverlayControls
          mapLoaded={mapLoaded}
          isTrainDesignMode={isTrainDesignMode}
          isDrawing={isDrawing}
          mapRef={mapRef}
        />
      )}

      {GAP_FINDER_BETA_ENABLED && (
        <GapFinderBeta
          mapRef={mapRef}
          mapLoaded={mapLoaded}
          hidden={isDrawing}
          onDesignRoute={handleDesignFromGap}
          onOpenChange={(gapOpen) => {
            if (gapOpen && panelOpen) {
              patchSearch({ mode: null, design: null, goRoute: null, entry: null });
            }
          }}
        />
      )}

      {/* ── Left side panel ─────────────────────────────────────────────── */}
      {panelOpen && (
        <div
          className={
            `absolute z-20 max-md:inset-x-2 max-md:top-auto max-md:w-auto ${MOBILE_NAV_OFFSET} max-md:mb-2 ${
              mode === "build"
                ? "left-4 top-20 bottom-4 w-[25rem] max-w-[calc(100vw-2rem)] max-md:h-[62dvh]"
                : "left-4 top-20 w-72 max-h-[calc(100dvh-5.5rem)] overflow-hidden max-md:max-h-[55dvh]"
            }`
          }
        >
          <div
            className={
              mode === "build"
                ? "tf-map-panel flex h-full min-h-0 flex-col overflow-hidden"
                : "tf-map-panel flex min-h-0 flex-col overflow-hidden max-md:max-h-[55dvh]"
            }
          >
            {mode === "browse" && (
              <BrowsePanel
                onRouteSelect={handleRouteSelect}
                onRouteClear={handleRouteClear}
                customRoutes={customRoutes}
                routeFilters={routeFilters}
                onRouteFilterChange={handleRouteFilterChange}
                onDeleteCustomRoute={requestDeleteCustomRoute}
                onShareCustomRoute={(id) => {
                  const route = customRoutes.find((r) => r.id === id);
                  if (route) setShareTarget(route);
                }}
                onTestCustomRoute={openRouteTest}
                onCheckNetworkImpact={setImpactRouteId}
                onOpenTimetables={() => handleModeToggle("schedule")}
                cityFeeds={cityFeeds}
                visibleCityFeedIds={visibleCityFeedIds}
                loadingCityFeedIds={loadingCityFeedIds}
                onToggleCityFeed={handleToggleCityFeed}
                onDeleteCityFeed={requestDeleteCityFeed}
                onZoomCityFeed={handleZoomCityFeed}
                onAddCityFeed={() => setCityFeedModalOpen(true)}
              />
            )}
            {mode === "test" && (
              <TestPanel
                customRoutes={customRoutes}
                onTestJourney={openRouteTest}
                onCheckImpact={setImpactRouteId}
                onSimulate={simulateRoute}
                onEditTimetable={() => handleModeToggle("schedule")}
                onDesign={() => handleModeToggle("build")}
              />
            )}
            {mode === "build" && (
                <DesignPanel
                  activeTab={designTab}
                  onActiveTabChange={handleDesignTabChange}
                  newSeedStops={gapSeed?.stops}
                  newWizardKey={gapSeed?.key}
                  newLockRouteType={gapSeed?.mode}
                  extendInitialRoute={extendSeedRoute}
                  extendWizardKey={
                    extendSeedRoute?.route_id
                      ?? searchParams.get("goRoute")?.trim()
                      ?? "pick"
                  }
                  extendTabLoading={
                    designTab === "existing"
                    && Boolean(searchParams.get("goRoute")?.trim())
                    && extendSeedStatus === "loading"
                  }
                  onSaveRoute={handleSaveRoute}
                  onDrawRequest={startDrawing}
                  onEditRequest={handleEditRequest}
                  onEditDone={handleEditDone}
                  onPreviewRoute={handlePreviewRoute}
                  onClearPreview={handleClearPreview}
                  onStartPinMode={(cb) => mapRef.current?.startPinMode(cb)}
                  onStopPinMode={() => mapRef.current?.stopPinMode()}
                  onCancel={closeDesignPanel}
                  drawGeometry={drawnGeometry ?? undefined}
                  editingRoute={editingRoute}
                  onTrainModeChange={setIsTrainDesignMode}
                  customStations={customStations}
                  onSaveStation={saveStation}
                  onDeleteStation={deleteStation}
                />
              )}
          </div>
        </div>
      )}

      {/* ── Schedule modal ──────────────────────────────────────────────── */}
      <ScheduleModal
        open={mode === "schedule"}
        customRoutes={customRoutes}
        onSaveSchedule={handleSaveSchedule}
        onClose={() => handleModeToggle("schedule")}
      />

      {/* ── "Test this route" journey comparison ───────────────────────── */}
      <TestRouteModal
        key={testRoute?.id ?? "none"}
        route={testRoute}
        open={testView === "modal"}
        onClose={closeRouteTest}
        onPickOnMap={pickTestPlaceOnMap}
        onShowOnMap={showTestJourneysOnMap}
        onCheckNetworkImpact={() => {
          const id = testRouteId;
          closeRouteTest();
          setImpactRouteId(id);
        }}
      />
      <NetworkImpactModal
        key={`impact-${impactRoute?.id ?? "none"}`}
        route={impactRoute}
        onClose={() => setImpactRouteId(null)}
      />
      {testRoute && testView !== "modal" && (
        <JourneyTestMapBar
          view={testView}
          routeName={testRoute.name || "Your route"}
          routeColor={testRoute.color}
          onBack={() => {
            mapRef.current?.stopPinMode();
            setTestView("modal");
          }}
          onClose={closeRouteTest}
        />
      )}

      {/* ── Route hover tooltip (top-right) ─────────────────────────────── */}
      {hoveredRoute && !isDrawing && !clickedRoute && (
        <RouteTooltip
          shortName={hoveredRoute.shortName}
          variantLabel={hoveredRoute.variantId}
        />
      )}

      {/* ── Route info card (bottom-center, on click) ────────────────────── */}
      {showInfoCard && (
        <RouteInfoCard
          shortName={clickedRoute.shortName}
          variantId={clickedRoute.variantId}
          variantLabel={clickedRoute.variantLabel}
          fromStop={clickedRoute.fromStop}
          toStop={clickedRoute.toStop}
          tripCount={clickedRoute.tripCount}
          color={clickedRoute.color}
          routeType={clickedRoute.routeType}
          title={clickedRoute.isCustom ? clickedRoute.shortName : undefined}
          actionLabel={clickedRoute.isCustom ? "Edit this route" : undefined}
          deleteLabel={clickedRoute.isCustom ? "Delete route" : undefined}
          placement={mode === "simulate" ? "top-left" : "bottom-center"}
          onDelete={clickedRoute.isCustom ? handleDeleteFromCard : undefined}
          onShare={clickedRoute.isCustom ? () => {
            const route = customRoutes.find((r) => r.id === clickedRoute.variantId);
            if (route) setShareTarget(route);
          } : undefined}
          onClose={() => {
            setClickedRoute(null);
            mapRef.current?.setRouteHighlight(null);
          }}
          onExplore={handleExploreFromCard}
        />
      )}

      {/* ── Vehicle info popup ──────────────────────────────────────────── */}
      {selectedVehicleTripId && (() => {
        const trip = sim.getTripById(selectedVehicleTripId);
        if (!trip) return null;
        return (
          <VehicleInfoPopup
            trip={trip}
            currentTime={sim.currentTime}
            serviceDate={sim.date}
            onClose={() => setSelectedVehicleTripId(null)}
          />
        );
      })()}

      {/* ── Draw guide overlay ──────────────────────────────────────────── */}
      {isDrawing && (
        <DrawGuide onFinish={finishDrawing} onCancel={cancelDrawing} mode={isTrainDesignMode ? "rail" : "route"} />
      )}

      {/* ── Simulation HUD ──────────────────────────────────────────────── */}
      {mode === "simulate" && (
        <SimulationHUD
          trips={sim.trips}
          currentTime={sim.currentTime}
          startTime={sim.startTime}
          endTime={sim.endTime}
          playing={sim.playing}
          speed={sim.speed}
          loading={sim.loading}
          hasEverLoaded={sim.hasEverLoaded}
          error={sim.error}
          selectedRoutes={sim.selectedRoutes}
          customRoutes={customRoutes}
          date={sim.date}
          startHour={sim.startHour}
          placement="dock"
          onTogglePlay={sim.togglePlay}
          onScrub={sim.setCurrentTime}
          onCycleSpeed={sim.cycleSpeed}
          onLoadSimulation={sim.loadSimulation}
          onRoutesChange={sim.setSelectedRoutes}
          onDateChange={sim.setDate}
          onStartHourChange={sim.setStartHour}
          onClear={sim.clearSimulation}
          onTestRoute={openRouteTest}
        />
      )}

      {/* ── First-run hint: the flow in one line ───────────────────────── */}
      {!mode && !clickedRoute && mapLoaded && (
        <div className={`pointer-events-none absolute bottom-8 left-1/2 z-20 w-max max-w-[min(420px,calc(100vw-32px))] -translate-x-1/2 text-center ${MOBILE_NAV_OFFSET} max-md:mb-3`}>
          <p className="tf-map-panel px-4 py-2.5 text-sm leading-snug text-[var(--landing-muted)]">
            <strong className="font-semibold text-[var(--landing-ink)]">Explore</strong> GO lines,{" "}
            <strong className="font-semibold text-[var(--landing-ink)]">design</strong> a route,{" "}
            <strong className="font-semibold text-[var(--landing-ink)]">test</strong> it on real trips, then{" "}
            <strong className="font-semibold text-[var(--landing-ink)]">share</strong> it. Tap any line for details.
          </p>
        </div>
      )}

      {/* Share to community modal */}
      <ShareModal route={shareTarget} onClose={() => setShareTarget(null)} />

      <AddCityFeedModal
        open={cityFeedModalOpen}
        onClose={() => setCityFeedModalOpen(false)}
        isAuthenticated={cityFeedsAuthed}
        parseProgress={cityFeedParseProgress}
        parseZip={parseCityFeedZip}
        cancelParse={cancelCityFeedParse}
        saveFeed={saveCityFeed}
        addLocalFeed={addLocalCityFeed}
        onAdded={(meta) => {
          toast.success(`${meta.name} added to the map`);
          handleZoomCityFeed(meta);
        }}
      />

    </div>
  );
}

export default function MapPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-screen w-screen items-center justify-center bg-[var(--landing-band)] text-sm text-[var(--landing-muted)]">
          Loading map…
        </div>
      }
    >
      <MapPageContent />
    </Suspense>
  );
}
