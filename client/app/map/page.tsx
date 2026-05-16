"use client";

import { useState, useEffect, useCallback, useRef, Suspense } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import mapboxgl from "mapbox-gl";
import { Train, Map as MapIcon, PlayCircle, Pencil, CalendarClock, Share2 } from "lucide-react";
import { toast } from "sonner";
import { v4 as uuidv4 } from "uuid";
import { MapHandle } from "@/components/Map";
import BrowsePanel from "@/components/panels/BrowsePanel";
import DesignPanel, { type DesignTab } from "@/components/panels/DesignPanel";
import ScheduleModal from "@/components/panels/ScheduleModal";
import SimulationHUD from "@/components/panels/SimulationHUD";
import RouteTooltip from "@/components/overlays/RouteTooltip";
import RouteInfoCard from "@/components/overlays/RouteInfoCard";
import ShareModal from "@/components/community/ShareModal";
import VehicleInfoPopup from "@/components/overlays/VehicleInfoPopup";
import DrawGuide from "@/components/overlays/DrawGuide";
import OpenRailwayMapOverlayControls from "@/components/overlays/OpenRailwayMapOverlayControls";
import { OPENRAILWAYMAP_OVERLAY_ENABLED } from "@/lib/features";
import RouteFilterControl from "@/components/overlays/RouteFilterControl";
import { useRoutes } from "@/hooks/useRoutes";
import { useStations } from "@/hooks/useStations";
import { useSimulation } from "@/hooks/useSimulation";
import { networkRouteFilters } from "@/lib/mapEntry";
import { type CustomRoute, type CustomSchedule, type EnrichedRoute, type RouteFilters } from "@/lib/gtfs";

// Dynamically import Map to avoid SSR issues with mapbox-gl
const Map = dynamic(() => import("@/components/Map"), { ssr: false });

type Mode = "browse" | "build" | "schedule" | "simulate" | null;

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

const NAV_ITEMS = [
  { mode: "browse" as Mode,   icon: MapIcon,       label: "Explore"   },
  { mode: "build" as Mode,    icon: Pencil,        label: "Design"    },
  { mode: "schedule" as Mode, icon: CalendarClock, label: "Schedules" },
  { mode: "simulate" as Mode, icon: PlayCircle,    label: "Simulate"  },
];

const VALID_MODES: Mode[] = ["browse", "build", "schedule", "simulate"];

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
  const [sharePickerOpen, setSharePickerOpen] = useState(false);
  // Close share picker on outside click
  useEffect(() => {
    if (!sharePickerOpen) return;
    const handler = () => setSharePickerOpen(false);
    window.addEventListener("click", handler, { capture: true, once: true });
    return () => window.removeEventListener("click", handler, { capture: true });
  }, [sharePickerOpen]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawnGeometry, setDrawnGeometry] = useState<[number, number][] | null>(null);
  const [editingRoute, setEditingRoute] = useState<CustomRoute | undefined>();
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

  const { routes: customRoutes, saveRoute, deleteRoute } = useRoutes();
  const { stations: customStations, saveStation, deleteStation } = useStations();

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
        },
      })),
    });
  }, [sim.activeVehicles, mapLoaded]);

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

  const panelOpen = mode === "browse" || mode === "build";
  // Hide info card when browse panel is open (panel shows richer info)
  const showInfoCard = clickedRoute && !isDrawing && mode !== "browse";

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-slate-100">
      {/* ── Full-screen map ─────────────────────────────────────────────── */}
      <div className="absolute inset-0">
        <Map
          ref={mapRef}
          onLoad={handleMapLoad}
          onMapDestroy={handleMapDestroy}
          onRouteClick={handleRouteClick}
          onCustomRouteClick={handleCustomRouteClick}
          onRouteHover={handleRouteHover}
          onVehicleClick={handleVehicleClick}
          onVehicleHover={handleVehicleHover}
        />
      </div>

      {/* ── Top nav bar ─────────────────────────────────────────────────── */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30 pointer-events-none">
        <div className="pointer-events-auto flex items-center gap-1 bg-white/95 backdrop-blur-xl rounded-2xl border border-slate-200 shadow-lg px-2 py-1.5">
          <Link
            href="/"
            className="flex items-center gap-1.5 mr-2 pl-1.5 pr-3 border-r border-slate-100"
          >
            <div className="w-6 h-6 rounded-lg bg-[#155ba0] flex items-center justify-center">
              <Train className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="text-sm font-semibold text-slate-900">TransitFlow</span>
          </Link>
          {NAV_ITEMS.map(({ mode: m, icon: Icon, label }) => (
            <button
              key={m}
              onClick={() => handleModeToggle(m)}
              className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-sm font-medium transition-all ${
                mode === m
                  ? "bg-slate-900 text-white shadow-sm"
                  : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
            </button>
          ))}
        </div>
      </div>

      {!isDrawing && (
        <RouteFilterControl
          customRoutes={customRoutes}
          routeFilters={routeFilters}
          onRouteFilterChange={handleRouteFilterChange}
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

      {/* ── Left side panel ─────────────────────────────────────────────── */}
      {panelOpen && (
        <div
          className={
            mode === "browse"
              ? "absolute left-4 top-20 z-20 w-72 max-h-[calc(100dvh-5.5rem)] overflow-hidden"
              : "absolute left-4 top-20 bottom-4 z-20 w-72"
          }
        >
          <div
            className={
              mode === "browse"
                ? "flex min-h-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white/95 shadow-xl backdrop-blur-xl"
                : "flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white/95 shadow-xl backdrop-blur-xl"
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
              />
            )}
            {mode === "build" && (
                <DesignPanel
                  activeTab={designTab}
                  onActiveTabChange={handleDesignTabChange}
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
          placement="bottom-right"
          onTogglePlay={sim.togglePlay}
          onScrub={sim.setCurrentTime}
          onCycleSpeed={sim.cycleSpeed}
          onLoadSimulation={sim.loadSimulation}
          onRoutesChange={sim.setSelectedRoutes}
          onDateChange={sim.setDate}
          onStartHourChange={sim.setStartHour}
          onClear={sim.clearSimulation}
        />
      )}

      {/* ── Empty state hint ────────────────────────────────────────────── */}
      {!mode
        && !clickedRoute
        && mapLoaded && (
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-20 pointer-events-none max-w-[min(360px,calc(100vw-32px))] text-center">
          <div className="rounded-xl border border-slate-100 bg-white/90 px-4 py-2.5 text-sm leading-snug text-slate-500 shadow-md backdrop-blur-md">
            Tap a coloured line for details — open <strong className="font-semibold text-slate-700">Explore</strong>{" "}
            for the route list, or <strong className="font-semibold text-slate-700">Design</strong> to model corridors.
          </div>
        </div>
      )}

      {/* ── Saved routes badge ──────────────────────────────────────────── */}
      {customRoutes.length > 0
        && !panelOpen
        && mode !== "simulate" && (
        <div className="absolute bottom-20 right-4 z-20 flex items-center gap-2">
          <button
            onClick={() => {
              patchSearch({
                mode: "build",
                entry: "fresh",
                design: "new",
                goRoute: null,
              });
            }}
            className="bg-white/95 backdrop-blur-xl rounded-xl border border-slate-200 shadow-md px-3 py-2 text-xs font-medium text-slate-700 flex items-center gap-1.5 hover:shadow-lg transition-shadow"
          >
            <Pencil className="w-3.5 h-3.5 text-slate-400" />
            {customRoutes.length} saved route{customRoutes.length !== 1 ? "s" : ""}
          </button>
          <div className="relative">
            <button
              onClick={() => {
                if (customRoutes.length === 1) {
                  setShareTarget(customRoutes[0]);
                } else {
                  setSharePickerOpen((o) => !o);
                }
              }}
              className="bg-[#007A33] backdrop-blur-xl rounded-xl border border-[#007A33] shadow-md px-3 py-2 text-xs font-semibold text-white flex items-center gap-1.5 hover:bg-[#005f28] hover:shadow-lg transition-all"
            >
              <Share2 className="w-3.5 h-3.5" />
              Share
            </button>
            {sharePickerOpen && (
              <div className="absolute bottom-full right-0 mb-2 w-56 rounded-xl border border-slate-200 bg-white shadow-xl overflow-hidden z-30">
                <p className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-slate-400 border-b border-slate-100">
                  Pick a route to share
                </p>
                <ul>
                  {customRoutes.map((r) => (
                    <li key={r.id}>
                      <button
                        className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-xs font-medium text-slate-800 hover:bg-slate-50 transition-colors"
                        onClick={() => {
                          setShareTarget(r);
                          setSharePickerOpen(false);
                        }}
                      >
                        <span
                          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[9px] font-bold text-white"
                          style={{ backgroundColor: r.color }}
                        >
                          {r.type === "train" ? "R" : "B"}
                        </span>
                        <span className="truncate">{r.name || "Custom route"}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Share to community modal */}
      <ShareModal route={shareTarget} onClose={() => setShareTarget(null)} />
    </div>
  );
}

export default function MapPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-screen w-screen items-center justify-center bg-slate-100 text-sm text-slate-500">
          Loading map…
        </div>
      }
    >
      <MapPageContent />
    </Suspense>
  );
}
