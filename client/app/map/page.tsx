"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import mapboxgl from "mapbox-gl";
import { Train, Map as MapIcon, PlayCircle, Pencil, CalendarClock } from "lucide-react";
import { toast } from "sonner";
import { MapHandle } from "@/components/Map";
import BrowsePanel from "@/components/panels/BrowsePanel";
import DesignPanel, { type DesignTab } from "@/components/panels/DesignPanel";
import ScheduleModal from "@/components/panels/ScheduleModal";
import SimulationHUD from "@/components/panels/SimulationHUD";
import RouteTooltip from "@/components/overlays/RouteTooltip";
import RouteInfoCard from "@/components/overlays/RouteInfoCard";
import VehicleInfoPopup from "@/components/overlays/VehicleInfoPopup";
import DrawGuide from "@/components/overlays/DrawGuide";
import RouteFilterControl from "@/components/overlays/RouteFilterControl";
import { useRoutes } from "@/hooks/useRoutes";
import { useStations } from "@/hooks/useStations";
import { useSimulation } from "@/hooks/useSimulation";
import { type CustomRoute, type CustomSchedule, type RouteFilters } from "@/lib/gtfs";

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

export default function MapPage() {
  const mapRef = useRef<MapHandle | null>(null);
  const [mode, setMode] = useState<Mode>(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [hoveredRoute, setHoveredRoute] = useState<{ shortName: string; variantId: string } | null>(null);
  const [clickedRoute, setClickedRoute] = useState<ClickedRoute | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawnGeometry, setDrawnGeometry] = useState<[number, number][] | null>(null);
  const [editingRoute, setEditingRoute] = useState<CustomRoute | undefined>();
  const [designTab, setDesignTab] = useState<DesignTab>("existing");
  const [railMapVisible, setRailMapVisible] = useState(true);
  // true when one of the wizards signals a train route is being designed
  const [isTrainDesignMode, setIsTrainDesignMode] = useState(false);
  const [selectedVehicleTripId, setSelectedVehicleTripId] = useState<string | null>(null);
  const [routeFilters, setRouteFilters] = useState<RouteFilters>({
    goRouteShortNames: null,
    customRouteIds: null,
  });

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

  // ── Read URL mode param on mount ────────────────────────────────────────
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const m = params.get("mode") as Mode;
    if (m && ["browse", "build", "schedule", "simulate"].includes(m)) {
      setMode(m);
      if (m === "simulate") {
        setTimeout(() => sim.loadSimulation(), 500);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  // ── Rail-design visual overlay — only for train route design ──────────
  useEffect(() => {
    if (!mapLoaded) return;
    mapRef.current?.setRailMapVisible(isTrainDesignMode && railMapVisible);
  }, [mapLoaded, isTrainDesignMode, railMapVisible]);

  // ── Map event handlers ──────────────────────────────────────────────────
  const handleMapLoad = useCallback((_map: mapboxgl.Map) => {
    setMapLoaded(true);
  }, []);

  // Click works in ALL modes — always highlights + shows info card
  const handleRouteClick = useCallback(async (variantId: string, shortName: string) => {
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
    setRouteFilters((current) => {
      if (current.customRouteIds === null) return current;
      return {
        ...current,
        customRouteIds: Array.from(new Set([...current.customRouteIds, route.id])),
      };
    });
    mapRef.current?.stopEdit();     // clean up if edit was active
    mapRef.current?.clearPreviewRoute();
    setMode(null);
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
    if (tab === "existing") {
      setEditingRoute(undefined);
      setDrawnGeometry(null);
    }
  }

  function closeDesignPanel() {
    cleanupDesignTools();
    setMode(null);
    setEditingRoute(undefined);
    setDrawnGeometry(null);
  }

  // ── Mode switcher ───────────────────────────────────────────────────────
  function handleModeToggle(m: Mode) {
    if (mode === m) {
      setMode(null);
      mapRef.current?.setRouteHighlight(null);
      setClickedRoute(null);
      if (m === "build") closeDesignPanel();
    } else {
      if (mode === "build") closeDesignPanel();
      setMode(m);
      if (m === "build") {
        setDesignTab("existing");
        setEditingRoute(undefined);
        setDrawnGeometry(null);
      }
      // Clear route info card when switching to build/simulate
      if (m !== "browse") setClickedRoute(null);
      if (m !== "browse") mapRef.current?.setRouteHighlight(null);
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
        setDesignTab("new");
        setMode("build");
      }
      return;
    }
    setMode("browse");
    // Keep highlight active
  }

  function deleteCustomRoute(routeId: string) {
    deleteRoute(routeId);
    setRouteFilters((current) => current.customRouteIds === null
      ? current
      : { ...current, customRouteIds: current.customRouteIds.filter((id) => id !== routeId) });
    if (editingRoute?.id === routeId) {
      setEditingRoute(undefined);
      setDrawnGeometry(null);
      setMode(null);
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

      {isTrainDesignMode && !isDrawing && (
        <div className="absolute right-4 top-24 z-20 flex flex-col items-end gap-2">
          <button
            type="button"
            onClick={() => setRailMapVisible((visible) => !visible)}
            className={`pointer-events-auto flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold shadow-md backdrop-blur-xl transition-colors ${
              railMapVisible
                ? "border-emerald-200 bg-emerald-50/95 text-[#007A33]"
                : "border-slate-200 bg-white/95 text-slate-600 hover:bg-slate-50"
            }`}
          >
            <Train className="h-3.5 w-3.5" />
            Rail map
          </button>
          <div className="max-w-56 rounded-lg border border-slate-200 bg-white/90 px-2.5 py-1.5 text-[10px] leading-snug text-slate-500 shadow-sm backdrop-blur-md">
            Rail routing data © OpenStreetMap contributors, ODbL
          </div>
        </div>
      )}

      {/* ── Left side panel ─────────────────────────────────────────────── */}
      {panelOpen && (
        <div className="absolute left-4 top-20 bottom-4 z-20 w-72">
          <div className="h-full rounded-2xl bg-white/95 backdrop-blur-xl border border-slate-200 shadow-xl overflow-hidden flex flex-col">
            {mode === "browse" && (
              <BrowsePanel
                onRouteSelect={handleRouteSelect}
                onRouteClear={handleRouteClear}
                customRoutes={customRoutes}
                routeFilters={routeFilters}
                onRouteFilterChange={handleRouteFilterChange}
                onDeleteCustomRoute={requestDeleteCustomRoute}
              />
            )}
            {mode === "build" && (
              <DesignPanel
                activeTab={designTab}
                onActiveTabChange={handleDesignTabChange}
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
        <DrawGuide onFinish={finishDrawing} onCancel={cancelDrawing} />
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
        />
      )}

      {/* ── Empty state hint ────────────────────────────────────────────── */}
      {!mode && !clickedRoute && mapLoaded && (
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-20 pointer-events-none">
          <div className="bg-white/90 backdrop-blur-md rounded-xl px-4 py-2.5 border border-slate-100 shadow-md text-sm text-slate-500">
            Tap any coloured line to explore a route
          </div>
        </div>
      )}

      {/* ── Saved routes badge ──────────────────────────────────────────── */}
      {customRoutes.length > 0 && !panelOpen && mode !== "simulate" && (
        <div className="absolute bottom-20 right-4 z-20">
          <button
            onClick={() => {
              setDesignTab("new");
              setMode("build");
            }}
            className="bg-white/95 backdrop-blur-xl rounded-xl border border-slate-200 shadow-md px-3 py-2 text-xs font-medium text-slate-700 flex items-center gap-1.5 hover:shadow-lg transition-shadow"
          >
            <Pencil className="w-3.5 h-3.5 text-slate-400" />
            {customRoutes.length} saved route{customRoutes.length !== 1 ? "s" : ""}
          </button>
        </div>
      )}
    </div>
  );
}
