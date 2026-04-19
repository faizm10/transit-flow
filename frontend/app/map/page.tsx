"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import mapboxgl from "mapbox-gl";
import { Train, Map as MapIcon, PlayCircle, Pencil } from "lucide-react";
import { MapHandle } from "@/components/Map";
import BrowsePanel from "@/components/panels/BrowsePanel";
import BuilderWizard from "@/components/panels/BuilderWizard";
import SimulationHUD from "@/components/panels/SimulationHUD";
import RouteTooltip from "@/components/overlays/RouteTooltip";
import RouteInfoCard from "@/components/overlays/RouteInfoCard";
import VehicleInfoPopup from "@/components/overlays/VehicleInfoPopup";
import DrawGuide from "@/components/overlays/DrawGuide";
import { useRoutes } from "@/hooks/useRoutes";
import { useSimulation } from "@/hooks/useSimulation";
import { CustomRoute } from "@/lib/gtfs";

// Dynamically import Map to avoid SSR issues with mapbox-gl
const Map = dynamic(() => import("@/components/Map"), { ssr: false });

type Mode = "browse" | "build" | "simulate" | null;

interface ClickedRoute {
  shortName: string;
  variantId: string;
  variantLabel?: string;
  fromStop?: string;
  toStop?: string;
  tripCount?: number;
}

const NAV_ITEMS = [
  { mode: "browse" as Mode, icon: MapIcon, label: "Explore" },
  { mode: "build" as Mode, icon: Pencil, label: "Design" },
  { mode: "simulate" as Mode, icon: PlayCircle, label: "Simulate" },
];

/** Stable numeric id from a trip_id string (for Mapbox feature-state) */
function tripIdToNum(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) {
    h = ((h * 31) + id.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
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
  const [selectedVehicleTripId, setSelectedVehicleTripId] = useState<string | null>(null);

  const { routes: customRoutes, saveRoute } = useRoutes();
  const sim = useSimulation();

  // ── Read URL mode param on mount ────────────────────────────────────────
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const m = params.get("mode") as Mode;
    if (m && ["browse", "build", "simulate"].includes(m)) {
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
        properties: { color: v.color, routeName: v.routeName, tripId: v.tripId, destination: v.destination, lineName: v.lineName },
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
        .filter((r) => r.geometry && r.geometry.length >= 2)
        .map((r) => ({
          type: "Feature",
          geometry: { type: "LineString", coordinates: r.geometry! },
          properties: { color: r.color, name: r.name, id: r.id },
        })),
    });
  }, [customRoutes, mapLoaded]);

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

  // ── Builder handlers ────────────────────────────────────────────────────
  function handleSaveRoute(route: CustomRoute) {
    saveRoute(route);
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
    } else {
      setMode(m);
      // Clear route info card when switching to build/simulate
      if (m !== "browse") setClickedRoute(null);
      if (m !== "browse") mapRef.current?.setRouteHighlight(null);
    }
  }

  // Clicking "Explore this route" on info card opens browse panel
  function handleExploreFromCard() {
    if (!clickedRoute) return;
    setMode("browse");
    // Keep highlight active
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

      {/* ── Left side panel ─────────────────────────────────────────────── */}
      {panelOpen && (
        <div className="absolute left-4 top-20 bottom-4 z-20 w-72">
          <div className="h-full rounded-2xl bg-white/95 backdrop-blur-xl border border-slate-200 shadow-xl overflow-hidden flex flex-col">
            {mode === "browse" && (
              <BrowsePanel
                onRouteSelect={handleRouteSelect}
                onRouteClear={handleRouteClear}
              />
            )}
            {mode === "build" && (
              <BuilderWizard
                onSave={handleSaveRoute}
                onDrawRequest={startDrawing}
                onCancel={() => setMode(null)}
                drawGeometry={drawnGeometry ?? undefined}
                existingRoute={editingRoute}
              />
            )}
          </div>
        </div>
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
          date={sim.date}
          onTogglePlay={sim.togglePlay}
          onScrub={sim.setCurrentTime}
          onCycleSpeed={sim.cycleSpeed}
          onLoadSimulation={sim.loadSimulation}
          onRoutesChange={sim.setSelectedRoutes}
          onDateChange={sim.setDate}
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
      {customRoutes.length > 0 && !panelOpen && (
        <div className="absolute bottom-20 right-4 z-20">
          <button
            onClick={() => setMode("build")}
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
