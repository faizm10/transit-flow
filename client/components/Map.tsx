"use client";

import { useEffect, useRef, forwardRef, useImperativeHandle } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import "@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css";
import { GO_RAIL_LINES, PINK_BUS_COLOR, PURPLE_BUS_COLOR } from "@/lib/routeColors";
import type { CustomStation } from "@/lib/gtfs";
import { simplifyPolylineForVertexEdit } from "@/lib/polylineSimplify";
import { OPENRAILWAYMAP_OVERLAY_ENABLED } from "@/lib/features";

const KITCHENER_BUS_ROUTES = ["30", "31", "32", "33", "34", "35", "36", "37", "38", "39"];
const BARRIE_BUS_ROUTES = ["65", "68"];
const STOUFFVILLE_BUS_ROUTES = ["70", "71", "72", "73", "74", "75", "76", "77", "78", "79"];
const MILTON_BUS_ROUTES = ["17", "19", "21", "22", "25", "27"];
const LAKESHORE_EAST_BUS_ROUTES = ["88", "90", "92", "96"];
const LAKESHORE_WEST_BUS_ROUTES = ["11", "12", "15", "16", "18"];
const PINK_BUS_ROUTES = ["40", "41", "47", "48", "94"];
const PURPLE_BUS_ROUTES = ["52", "56"];
const GO_ROUTE_LAYER_IDS = ["go-routes-casing", "go-routes-line", "go-routes-hit"];
const CUSTOM_ROUTE_LAYER_IDS = ["custom-routes-line-bus", "custom-routes-line-train", "custom-routes-line-train-inner", "custom-routes-hit"];
const EMPTY_ROUTE_FILTER_VALUE = "__transit_flow_no_routes__";
const OPENRAILWAYMAP_LAYER_ID = "openrailwaymap-overlay";

type LayerFilter = Parameters<mapboxgl.Map["setFilter"]>[1];

export interface MapHandle {
  getMap: () => mapboxgl.Map | null;
  flyTo: (options: Parameters<mapboxgl.Map["flyTo"]>[0]) => void;
  setRouteHighlight: (variantIds: string[] | null) => void;
  setVisibleRouteFilter: (goRouteShortNames: string[] | null, customRouteIds: string[] | null) => void;
  setRailMapVisible: (visible: boolean) => void;
  /** Show a dashed preview line on the map (wizard use). */
  showPreviewRoute: (coords: [number, number][], color: string) => void;
  /** Remove the preview line. */
  clearPreviewRoute: () => void;
  /** Activate draw_line_string mode. onComplete fires with coordinates when the line is finished. */
  startDraw: (onComplete: (coords: [number, number][]) => void) => void;
  /** Programmatically finish the current draw (same as double-click). */
  finishDraw: () => void;
  /** Cancel / remove the draw control without saving. */
  stopDraw: () => void;
  /**
   * Load coords into MapboxDraw direct_select so the user can drag vertices.
   * onChange fires on every vertex release with updated coords.
   */
  startEdit: (coords: [number, number][], onChange: (coords: [number, number][]) => void) => void;
  /** Finalise edit: fires onChange one last time with final geometry then cleans up. */
  stopEdit: () => void;
  /** Enable map-click mode to pin a stop. Callback fires with {lat, lon} on each click. */
  startPinMode: (onPin: (lat: number, lon: number) => void) => void;
  /** Disable pin mode. */
  stopPinMode: () => void;
  /** Update custom station markers on the map. */
  updateStations: (stations: CustomStation[]) => void;
}

function makeVisibilityFilter(propertyName: string, values: string[] | null): LayerFilter {
  if (values === null) return null;
  if (values.length === 0) {
    return ["==", ["get", propertyName], EMPTY_ROUTE_FILTER_VALUE] as LayerFilter;
  }
  return ["in", ["get", propertyName], ["literal", values]] as LayerFilter;
}

function applyLayerFilter(map: mapboxgl.Map, layerIds: string[], filter: LayerFilter) {
  for (const layerId of layerIds) {
    if (map.getLayer(layerId)) {
      map.setFilter(layerId, filter);
    }
  }
}

interface MapProps {
  onLoad?: (map: mapboxgl.Map) => void;
  /** Fires before the underlying Map instance is destroyed (Strict Mode remount, navigation). */
  onMapDestroy?: () => void;
  onRouteClick?: (variantId: string, routeShortName: string) => void;
  onCustomRouteClick?: (route: {
    id: string;
    name: string;
    color: string;
    type: "bus" | "train";
    fromStop?: string;
    toStop?: string;
  }) => void;
  onRouteHover?: (variantId: string | null, routeShortName: string | null) => void;
  onVehicleClick?: (tripId: string) => void;
  onVehicleHover?: (tripId: string | null) => void;
  /** When true, show the full OSM rail network overlay (train design mode). */
  isTrainDesignMode?: boolean;
}

const TORONTO_CENTER: [number, number] = [-79.385, 43.693];
const DEFAULT_ZOOM = 9.5;

const Map = forwardRef<MapHandle, MapProps>(function Map(
  { onLoad, onMapDestroy, onRouteClick, onCustomRouteClick, onRouteHover, onVehicleClick, onVehicleHover, isTrainDesignMode },
  ref
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  /** Keeps visibility intent when callers run before GO/custom layers exist (first paint / remount race). */
  const lastVisibleRouteFilterRef = useRef<{ go: string[] | null; custom: string[] | null } | null>(
    { go: null, custom: null }
  );

  function applyStoredVisibleRouteFilters(map: mapboxgl.Map): void {
    const last = lastVisibleRouteFilterRef.current;
    if (!last || !map.getLayer("go-routes-line")) return;
    applyLayerFilter(
      map,
      GO_ROUTE_LAYER_IDS,
      makeVisibilityFilter("route_short_name", last.go)
    );
    applyLayerFilter(
      map,
      CUSTOM_ROUTE_LAYER_IDS,
      makeVisibilityFilter("id", last.custom)
    );
  }
  const hoveredVariantRef = useRef<string | null>(null);
  const hoveredTripRef = useRef<string | null>(null);
  const hoveredTripNumericIdRef = useRef<number | null>(null);
  const vehiclePopupRef = useRef<mapboxgl.Popup | null>(null);

  // Draw / edit state — stored in refs so handlers don't close over stale values
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const drawRef = useRef<any>(null);
  const isDrawingRef = useRef(false); // true during both draw AND edit modes
  const drawCompleteCallbackRef = useRef<((coords: [number, number][]) => void) | null>(null);
  const editOnChangeRef = useRef<((coords: [number, number][]) => void) | null>(null);

  // Pin mode state
  const pinListenerRef = useRef<((e: mapboxgl.MapMouseEvent) => void) | null>(null);

  // ── Imperative handle ──────────────────────────────────────────────────────
  useImperativeHandle(ref, () => ({
    getMap: () => mapRef.current,
    flyTo: (options) => mapRef.current?.flyTo(options),

    setRouteHighlight: (variantIds) => {
      const map = mapRef.current;
      if (!map || !map.isStyleLoaded()) return;
      if (!variantIds || variantIds.length === 0) {
        map.setPaintProperty("go-routes-line", "line-opacity", 1);
        map.setPaintProperty("go-routes-line", "line-width", 2);
        return;
      }
      map.setPaintProperty("go-routes-line", "line-opacity", [
        "case",
        ["in", ["get", "variant_id"], ["literal", variantIds]],
        1,
        0.15,
      ]);
      map.setPaintProperty("go-routes-line", "line-width", [
        "case",
        ["in", ["get", "variant_id"], ["literal", variantIds]],
        5,
        2,
      ]);
    },

    setVisibleRouteFilter: (goRouteShortNames, customRouteIds) => {
      lastVisibleRouteFilterRef.current = {
        go: goRouteShortNames,
        custom: customRouteIds,
      };
      const map = mapRef.current;
      if (!map || !map.isStyleLoaded()) return;

      applyStoredVisibleRouteFilters(map);
    },

    setRailMapVisible: (visible) => {
      const map = mapRef.current;
      if (!map || !map.getLayer(OPENRAILWAYMAP_LAYER_ID)) return;
      map.setLayoutProperty(OPENRAILWAYMAP_LAYER_ID, "visibility", visible ? "visible" : "none");
    },

    // ── Preview route (wizard) ───────────────────────────────────────────────
    showPreviewRoute: (coords, color) => {
      const map = mapRef.current;
      if (!map) return;
      const src = map.getSource("route-preview") as mapboxgl.GeoJSONSource | undefined;
      src?.setData({
        type: "FeatureCollection",
        features: [{
          type: "Feature",
          geometry: { type: "LineString", coordinates: coords },
          properties: { color },
        }],
      });
    },

    clearPreviewRoute: () => {
      const map = mapRef.current;
      if (!map) return;
      const src = map.getSource("route-preview") as mapboxgl.GeoJSONSource | undefined;
      src?.setData({ type: "FeatureCollection", features: [] });
    },

    // ── Draw (train initial line) ────────────────────────────────────────────
    startDraw: (onComplete) => {
      const map = mapRef.current;
      if (!map || isDrawingRef.current) return;

      import("@mapbox/mapbox-gl-draw").then(({ default: MapboxDraw }) => {
        const draw = new MapboxDraw({
          displayControlsDefault: false,
          defaultMode: "draw_line_string",
        });

        drawCompleteCallbackRef.current = onComplete;
        isDrawingRef.current = true;
        map.addControl(draw as unknown as mapboxgl.IControl);
        drawRef.current = draw;

        requestAnimationFrame(() => {
          try { draw.changeMode("draw_line_string"); } catch { /* already in mode */ }
        });

        map.getCanvas().style.cursor = "crosshair";

        const onCreate = (e: { features: GeoJSON.Feature[] }) => {
          const feature = e.features[0] as GeoJSON.Feature<GeoJSON.LineString> | undefined;
          const coords = feature?.geometry?.coordinates as [number, number][] | undefined;
          const cb = drawCompleteCallbackRef.current;
          // Defer removeControl — calling it synchronously inside draw.create crashes dragPan
          setTimeout(() => cleanupDraw(map, draw), 0);
          if (coords && coords.length >= 2) cb?.(coords);
        };
        map.on("draw.create", onCreate);
        (draw as unknown as Record<string, unknown>).__onCreateRef = onCreate;
      });
    },

    finishDraw: () => {
      const map = mapRef.current;
      const draw = drawRef.current;
      if (!map || !draw) return;
      try {
        const fc = draw.getAll?.() as GeoJSON.FeatureCollection | undefined;
        const feature = fc?.features?.[0] as GeoJSON.Feature<GeoJSON.LineString> | undefined;
        const coords = feature?.geometry?.coordinates as [number, number][] | undefined;
        cleanupDraw(map, draw);
        if (coords && coords.length >= 2) {
          drawCompleteCallbackRef.current?.(coords);
        }
      } catch {
        cleanupDraw(map, draw);
      }
    },

    stopDraw: () => {
      const map = mapRef.current;
      const draw = drawRef.current;
      if (!map || !draw) return;
      cleanupDraw(map, draw);
    },

    // ── Edit (drag vertices of an existing line) ─────────────────────────────
    startEdit: (coords, onChange) => {
      const map = mapRef.current;
      if (!map || isDrawingRef.current) return;

      // Hide preview while MapboxDraw renders the editable line
      const previewSrc = map.getSource("route-preview") as mapboxgl.GeoJSONSource | undefined;
      previewSrc?.setData({ type: "FeatureCollection", features: [] });

      import("@mapbox/mapbox-gl-draw").then(({ default: MapboxDraw }) => {
        const draw = new MapboxDraw({ displayControlsDefault: false });
        editOnChangeRef.current = onChange;
        isDrawingRef.current = true;
        map.addControl(draw as unknown as mapboxgl.IControl);
        drawRef.current = draw;

        // Few handles: DP in metres + hard cap (Draw also shows midpoints between vertices).
        const editCoords = simplifyPolylineForVertexEdit(coords, {
          toleranceM: 340,
          maxVertices: 12,
        });

        // Load geometry as an editable feature
        const [featureId] = draw.add({
          type: "Feature",
          geometry: { type: "LineString", coordinates: editCoords },
          properties: {},
        } as GeoJSON.Feature);

        // Enter direct_select so vertices are immediately visible + draggable
        requestAnimationFrame(() => {
          try { draw.changeMode("direct_select", { featureId }); } catch { /* ignore */ }
        });

        // Re-enter direct_select if user accidentally deselects by clicking the map
        const onSelectionChange = () => {
          const selected = draw.getSelectedIds?.() as string[] | undefined;
          if (!selected || selected.length === 0) {
            requestAnimationFrame(() => {
              try { draw.changeMode("direct_select", { featureId }); } catch { /* ignore */ }
            });
          }
        };
        map.on("draw.selectionchange", onSelectionChange);
        (draw as unknown as Record<string, unknown>).__onSelectionChangeRef = onSelectionChange;

        // Fire onChange after every vertex drag
        const onUpdate = (e: { features: GeoJSON.Feature[] }) => {
          const feat = e.features[0] as GeoJSON.Feature<GeoJSON.LineString> | undefined;
          const newCoords = feat?.geometry?.coordinates as [number, number][] | undefined;
          if (newCoords) editOnChangeRef.current?.(newCoords);
        };
        map.on("draw.update", onUpdate);
        (draw as unknown as Record<string, unknown>).__onUpdateRef = onUpdate;
      });
    },

    stopEdit: () => {
      const map = mapRef.current;
      const draw = drawRef.current;
      if (!map || !draw) return;

      // Capture final geometry before teardown
      try {
        const fc = draw.getAll?.() as GeoJSON.FeatureCollection | undefined;
        const feat = fc?.features?.[0] as GeoJSON.Feature<GeoJSON.LineString> | undefined;
        const coords = feat?.geometry?.coordinates as [number, number][] | undefined;
        if (coords) editOnChangeRef.current?.(coords);
      } catch { /* ignore */ }

      cleanupDraw(map, draw);
      editOnChangeRef.current = null;
    },

    // ── Pin mode (ExtendRouteWizard) ─────────────────────────────────────────
    startPinMode: (onPin) => {
      const map = mapRef.current;
      if (!map) return;

      // If MapboxDraw is active, stop it first so its click handler doesn't
      // intercept the pin placement click.
      if (isDrawingRef.current && drawRef.current) {
        cleanupDraw(map, drawRef.current);
      }

      // Remove any existing pin listener first
      if (pinListenerRef.current) {
        map.off("click", pinListenerRef.current);
        pinListenerRef.current = null;
      }

      map.getCanvas().style.cursor = "crosshair";

      const listener = (e: mapboxgl.MapMouseEvent) => {
        onPin(e.lngLat.lat, e.lngLat.lng);
      };

      map.on("click", listener);
      pinListenerRef.current = listener;
    },

    stopPinMode: () => {
      const map = mapRef.current;
      if (!map) return;

      if (pinListenerRef.current) {
        map.off("click", pinListenerRef.current);
        pinListenerRef.current = null;
      }

      map.getCanvas().style.cursor = "";
    },

    updateStations: (stations) => {
      const map = mapRef.current;
      if (!map) return;
      const src = map.getSource("custom-stations") as mapboxgl.GeoJSONSource | undefined;
      if (!src) return;
      src.setData({
        type: "FeatureCollection",
        features: stations.map((s) => ({
          type: "Feature",
          geometry: { type: "Point", coordinates: [s.lon, s.lat] },
          properties: {
            id: s.id,
            name: s.name,
            code: s.code ?? s.name.slice(0, 4).toUpperCase(),
            stationType: s.type,
          },
        })),
      });
    },
  }));

  // ── Shared draw/edit cleanup ───────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function cleanupDraw(map: mapboxgl.Map, draw: any) {
    const d = draw as Record<string, unknown>;

    const onCreate = d.__onCreateRef as ((e: { features: GeoJSON.Feature[] }) => void) | undefined;
    if (onCreate) map.off("draw.create", onCreate);

    const onUpdate = d.__onUpdateRef as ((e: { features: GeoJSON.Feature[] }) => void) | undefined;
    if (onUpdate) map.off("draw.update", onUpdate);

    const onSel = d.__onSelectionChangeRef as (() => void) | undefined;
    if (onSel) map.off("draw.selectionchange", onSel);

    try { map.removeControl(draw as unknown as mapboxgl.IControl); } catch { /* already removed */ }
    drawRef.current = null;
    isDrawingRef.current = false;
    drawCompleteCallbackRef.current = null;
    map.getCanvas().style.cursor = "";
  }

  // ── Map init ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return;
    if (mapRef.current) return;

    const token = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;
    if (!token || token === "your_public_mapbox_token") {
      console.error("Mapbox token missing — set NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN in .env.local");
      return;
    }
    mapboxgl.accessToken = token;

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: "mapbox://styles/mapbox/outdoors-v12",
      center: TORONTO_CENTER,
      zoom: DEFAULT_ZOOM,
      pitch: 40,
      bearing: -10,
      minZoom: 7,
      maxZoom: 18,
      attributionControl: false,
    });

    map.addControl(new mapboxgl.NavigationControl({ showCompass: true }), "bottom-right");
    map.addControl(new mapboxgl.AttributionControl({ compact: true }), "bottom-left");

    map.on("load", () => {
      // ── 3D terrain ────────────────────────────────────────────────────────
      map.addSource("mapbox-dem", {
        type: "raster-dem",
        url: "mapbox://mapbox.mapbox-terrain-dem-v1",
        tileSize: 512,
        maxzoom: 14,
      });
      map.setTerrain({ source: "mapbox-dem", exaggeration: 1.5 });
      map.addLayer({
        id: "sky",
        type: "sky",
        paint: {
          "sky-type": "atmosphere",
          "sky-atmosphere-sun": [0.0, 90.0],
          "sky-atmosphere-sun-intensity": 15,
        },
      });

      // OpenRailwayMap reference tiles — toggle via `OPENRAILWAYMAP_OVERLAY_ENABLED` in `lib/features.ts`
      if (OPENRAILWAYMAP_OVERLAY_ENABLED) {
        map.addSource("openrailwaymap", {
          type: "raster",
          tiles: ["https://tiles.openrailwaymap.org/standard/{z}/{x}/{y}.png"],
          tileSize: 256,
          attribution:
            'Data <a href="https://www.openstreetmap.org/copyright">© OpenStreetMap contributors</a>, Style: <a href="https://creativecommons.org/licenses/by-sa/2.0/">CC-BY-SA 2.0</a> <a href="https://www.openrailwaymap.org/">OpenRailwayMap</a>',
        });
        map.addLayer({
          id: OPENRAILWAYMAP_LAYER_ID,
          type: "raster",
          source: "openrailwaymap",
          layout: { visibility: "none" },
          paint: { "raster-opacity": 0.62 },
        });
      }

      // ── GO Transit routes layer ────────────────────────────────────────────
      map.addSource("go-routes", {
        type: "geojson",
        data: "/gotransit/derived/variant_lines.geojson",
      });

      map.addLayer({
        id: "go-routes-casing",
        type: "line",
        source: "go-routes",
        layout: { "line-join": "round", "line-cap": "round" },
        paint: {
          "line-color": "#ffffff",
          "line-width": 5,
          "line-opacity": 0.6,
        },
      });

      map.addLayer({
        id: "go-routes-line",
        type: "line",
        source: "go-routes",
        layout: { "line-join": "round", "line-cap": "round" },
        paint: {
          "line-color": [
            "match", ["get", "route_short_name"],
            "BR", GO_RAIL_LINES.BR.color, "KI", GO_RAIL_LINES.KI.color, "LE", GO_RAIL_LINES.LE.color,
            "LW", GO_RAIL_LINES.LW.color, "MI", GO_RAIL_LINES.MI.color, "RH", GO_RAIL_LINES.RH.color,
            "ST", GO_RAIL_LINES.ST.color, "UP", GO_RAIL_LINES.UP.color,
            MILTON_BUS_ROUTES, GO_RAIL_LINES.MI.color,
            "29", GO_RAIL_LINES.KI.color,
            KITCHENER_BUS_ROUTES, GO_RAIL_LINES.KI.color,
            "61", GO_RAIL_LINES.RH.color,
            BARRIE_BUS_ROUTES, GO_RAIL_LINES.BR.color,
            STOUFFVILLE_BUS_ROUTES, GO_RAIL_LINES.ST.color,
            LAKESHORE_EAST_BUS_ROUTES, GO_RAIL_LINES.LE.color,
            LAKESHORE_WEST_BUS_ROUTES, GO_RAIL_LINES.LW.color,
            PINK_BUS_ROUTES, PINK_BUS_COLOR,
            PURPLE_BUS_ROUTES, PURPLE_BUS_COLOR,
            "#4a6fa5",
          ],
          "line-width": [
            "match", ["get", "route_short_name"],
            "BR", 3, "KI", 3, "LE", 3, "LW", 3,
            "MI", 3, "RH", 3, "ST", 3, "UP", 3,
            2,
          ],
          "line-opacity": 1,
        },
      });

      // Wider invisible hit area for clicks
      map.addLayer({
        id: "go-routes-hit",
        type: "line",
        source: "go-routes",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": "transparent",
          "line-width": 12,
        },
      });

      // ── Rail network overlay (train design mode) ──────────────────────────
      map.addSource("rail-network-display", {
        type: "geojson",
        data: "/gotransit/derived/rail_display.geojson",
      });
      map.addLayer({
        id: "rail-network-line",
        type: "line",
        source: "rail-network-display",
        layout: { "line-join": "round", "line-cap": "round" },
        paint: {
          "line-color": "#64748b",
          "line-width": 2.5,
          "line-opacity": 0.7,
          "line-dasharray": [4, 2],
        },
        filter: ["==", ["get", "railway"], "rail"],
      });
      map.setLayoutProperty("rail-network-line", "visibility", "none");

      // ── Custom routes (saved) ──────────────────────────────────────────────
      map.addSource("custom-routes", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      // Bus routes — dashed
      map.addLayer({
        id: "custom-routes-line-bus",
        type: "line",
        source: "custom-routes",
        filter: ["!=", ["get", "type"], "train"],
        layout: { "line-join": "round", "line-cap": "round" },
        paint: {
          "line-color": ["get", "color"],
          "line-width": 3,
          "line-dasharray": [2, 1],
          "line-opacity": 0.9,
        },
      });
      // Train routes — solid outer track
      map.addLayer({
        id: "custom-routes-line-train",
        type: "line",
        source: "custom-routes",
        filter: ["==", ["get", "type"], "train"],
        layout: { "line-join": "round", "line-cap": "butt" },
        paint: {
          "line-color": ["get", "color"],
          "line-width": 5,
          "line-opacity": 0.95,
        },
      });
      // Train routes — white inner accent (double-rail look)
      map.addLayer({
        id: "custom-routes-line-train-inner",
        type: "line",
        source: "custom-routes",
        filter: ["==", ["get", "type"], "train"],
        layout: { "line-join": "round", "line-cap": "butt" },
        paint: {
          "line-color": "#ffffff",
          "line-width": 1.5,
          "line-opacity": 0.6,
        },
      });
      map.addLayer({
        id: "custom-routes-hit",
        type: "line",
        source: "custom-routes",
        layout: { "line-join": "round", "line-cap": "round" },
        paint: {
          "line-color": "transparent",
          "line-width": 14,
        },
      });

      // ── Custom stations ────────────────────────────────────────────────────
      map.addSource("custom-stations", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      // Outer ring
      map.addLayer({
        id: "custom-stations-circle",
        type: "circle",
        source: "custom-stations",
        paint: {
          "circle-radius": 10,
          "circle-color": "#1e293b",
          "circle-stroke-width": 2.5,
          "circle-stroke-color": "#ffffff",
          "circle-opacity": 0.92,
        },
      });
      // Code text label
      map.addLayer({
        id: "custom-stations-label",
        type: "symbol",
        source: "custom-stations",
        layout: {
          "text-field": ["get", "code"],
          "text-font": ["DIN Pro Bold", "Arial Unicode MS Bold"],
          "text-size": 8,
          "text-anchor": "center",
          "text-allow-overlap": true,
        },
        paint: {
          "text-color": "#ffffff",
        },
      });
      // Name tooltip below the dot
      map.addLayer({
        id: "custom-stations-name",
        type: "symbol",
        source: "custom-stations",
        layout: {
          "text-field": ["get", "name"],
          "text-font": ["DIN Pro Medium", "Arial Unicode MS Regular"],
          "text-size": 10,
          "text-anchor": "top",
          "text-offset": [0, 1.2],
          "text-allow-overlap": false,
          "text-optional": true,
        },
        paint: {
          "text-color": "#1e293b",
          "text-halo-color": "#ffffff",
          "text-halo-width": 1.5,
        },
      });

      // ── Route preview (wizard: shown while designing, before saving) ───────
      map.addSource("route-preview", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      // White casing for legibility over any map background
      map.addLayer({
        id: "route-preview-casing",
        type: "line",
        source: "route-preview",
        layout: { "line-join": "round", "line-cap": "round" },
        paint: { "line-color": "#ffffff", "line-width": 6, "line-opacity": 0.7 },
      });
      map.addLayer({
        id: "route-preview-line",
        type: "line",
        source: "route-preview",
        layout: { "line-join": "round", "line-cap": "round" },
        paint: {
          "line-color": ["get", "color"],
          "line-width": 3.5,
          "line-dasharray": [4, 2.5],
          "line-opacity": 0.95,
        },
      });

      // ── Simulation vehicles ────────────────────────────────────────────────
      map.addSource("sim-vehicles", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });

      // Halo ring — larger + softer for trains, tighter for buses
      map.addLayer({
        id: "sim-vehicles-halo",
        type: "circle",
        source: "sim-vehicles",
        paint: {
          "circle-radius": [
            "case", ["==", ["get", "routeType"], 3], 8, 11,  // bus=8, train=11
          ],
          "circle-color": ["get", "color"],
          "circle-opacity": [
            "case", ["==", ["get", "routeType"], 3], 0.18, 0.25,  // bus slightly dimmer
          ],
          "circle-stroke-width": 0,
        },
      });

      // Main dot — trains are larger squares-ish, buses are smaller circles
      map.addLayer({
        id: "sim-vehicles-dot",
        type: "circle",
        source: "sim-vehicles",
        paint: {
          "circle-radius": [
            "case",
            ["boolean", ["feature-state", "hovered"], false],
            ["case", ["==", ["get", "routeType"], 3], 8, 10],   // hovered bus=8, train=10
            ["case", ["==", ["get", "routeType"], 3], 5, 7],    // normal  bus=5, train=7
          ],
          "circle-color": ["get", "color"],
          "circle-stroke-width": [
            "case", ["==", ["get", "routeType"], 3], 1.5, 2,    // bus thinner stroke
          ],
          "circle-stroke-color": "#ffffff",
          // buses get slight opacity so trains "pop" more when both are shown
          "circle-opacity": [
            "case", ["==", ["get", "routeType"], 3], 0.88, 1,
          ],
        },
      });

      // Route label — below the dot
      map.addLayer({
        id: "sim-vehicles-label",
        type: "symbol",
        source: "sim-vehicles",
        layout: {
          "text-field": ["get", "routeName"],
          "text-size": ["case", ["==", ["get", "routeType"], 3], 8, 9],  // bus slightly smaller text
          "text-font": ["DIN Offc Pro Bold", "Arial Unicode MS Bold"],
          "text-offset": [0, 2.0],
          "text-anchor": "top",
          "text-allow-overlap": false,
          "text-ignore-placement": false,
        },
        paint: {
          "text-color": ["get", "color"],
          "text-halo-color": "#ffffff",
          "text-halo-width": 1.5,
        },
      });

      applyStoredVisibleRouteFilters(map);

      onLoad?.(map);
    });

    // ── Route hover ────────────────────────────────────────────────────────
    map.on("mousemove", "go-routes-hit", (e) => {
      if (isDrawingRef.current) return;
      if (!e.features?.length) return;
      const f = e.features[0];
      const variantId = f.properties?.variant_id as string;
      const shortName = f.properties?.route_short_name as string;
      if (variantId !== hoveredVariantRef.current) {
        hoveredVariantRef.current = variantId;
        map.getCanvas().style.cursor = "pointer";
        onRouteHover?.(variantId, shortName);
      }
    });

    map.on("mouseleave", "go-routes-hit", () => {
      if (isDrawingRef.current) return;
      hoveredVariantRef.current = null;
      map.getCanvas().style.cursor = "";
      onRouteHover?.(null, null);
    });

    // ── Route click ────────────────────────────────────────────────────────
    map.on("click", "go-routes-hit", (e) => {
      if (isDrawingRef.current) return;
      if (!e.features?.length) return;
      // Prefer simulation vehicle under cursor (route hit buffer is wide)
      if (map.getLayer("sim-vehicles-dot")) {
        const vehiclesHere = map.queryRenderedFeatures(e.point, { layers: ["sim-vehicles-dot"] });
        if (vehiclesHere.length > 0) return;
      }
      if (map.getLayer("custom-routes-hit")) {
        const customFeatures = map.queryRenderedFeatures(e.point, { layers: ["custom-routes-hit"] });
        if (customFeatures.length > 0) return;
      }
      const f = e.features[0];
      onRouteClick?.(f.properties?.variant_id as string, f.properties?.route_short_name as string);
    });

    // ── Custom route hover/click ───────────────────────────────────────────
    map.on("mousemove", "custom-routes-hit", () => {
      if (isDrawingRef.current) return;
      map.getCanvas().style.cursor = "pointer";
    });

    map.on("mouseleave", "custom-routes-hit", () => {
      if (isDrawingRef.current) return;
      map.getCanvas().style.cursor = "";
    });

    map.on("click", "custom-routes-hit", (e) => {
      if (isDrawingRef.current) return;
      e.preventDefault();
      if (!e.features?.length) return;
      if (map.getLayer("sim-vehicles-dot")) {
        const vehiclesHere = map.queryRenderedFeatures(e.point, { layers: ["sim-vehicles-dot"] });
        if (vehiclesHere.length > 0) return;
      }
      const props = e.features[0].properties as Record<string, string> | undefined;
      if (!props?.id) return;
      onCustomRouteClick?.({
        id: props.id,
        name: props.name || "Custom route",
        color: props.color || "#8b5cf6",
        type: props.type === "train" ? "train" : "bus",
        fromStop: props.fromStop || undefined,
        toStop: props.toStop || undefined,
      });
    });

    // ── Vehicle hover ──────────────────────────────────────────────────────
    map.on("mousemove", "sim-vehicles-dot", (e) => {
      if (isDrawingRef.current) return;
      if (!e.features?.length) return;

      const feat = e.features[0];
      const tripId = feat.properties?.tripId as string;
      const numericId = feat.id as number;
      const props = feat.properties as {
        color: string; routeName: string; lineName: string; destination: string;
        startTime: string; endTime: string; nextStopName: string; secsToNextStop: number;
      };
      const coords = (feat.geometry as GeoJSON.Point).coordinates as [number, number];

      if (tripId !== hoveredTripRef.current) {
        if (hoveredTripNumericIdRef.current !== null) {
          map.setFeatureState({ source: "sim-vehicles", id: hoveredTripNumericIdRef.current }, { hovered: false });
        }
        hoveredTripRef.current = tripId;
        hoveredTripNumericIdRef.current = numericId;
        map.setFeatureState({ source: "sim-vehicles", id: numericId }, { hovered: true });
        map.getCanvas().style.cursor = "pointer";
        onVehicleHover?.(tripId);
      }

      // ── Hover tooltip ────────────────────────────────────────────────────
      if (!vehiclePopupRef.current) {
        vehiclePopupRef.current = new mapboxgl.Popup({
          closeButton: false,
          closeOnClick: false,
          offset: 14,
          anchor: "bottom",
          className: "vehicle-hover-popup",
        });
      }
      const secsToNext = props.secsToNextStop ?? 0;
      const minToNext = secsToNext < 60 ? "< 1 min" : `${Math.round(secsToNext / 60)} min`;
      const nextLine = props.nextStopName
        ? `<div class="vhp-row vhp-next"><span class="vhp-next-dot"></span>${props.nextStopName}<span class="vhp-eta">${minToNext}</span></div>`
        : "";
      const timingLine = props.startTime && props.endTime
        ? `<div class="vhp-row vhp-timing">${props.startTime} → ${props.endTime}</div>`
        : "";

      vehiclePopupRef.current
        .setLngLat(coords)
        .setHTML(
          `<div class="vhp-inner">` +
            `<span class="vhp-badge" style="background:${props.color}">${props.routeName}</span>` +
            `<div class="vhp-body">` +
              `<div class="vhp-dest">${props.destination || props.lineName}</div>` +
              nextLine +
              timingLine +
            `</div>` +
          `</div>`
        )
        .addTo(map);
    });

    map.on("mouseleave", "sim-vehicles-dot", () => {
      if (isDrawingRef.current) return;
      if (hoveredTripNumericIdRef.current !== null) {
        map.setFeatureState({ source: "sim-vehicles", id: hoveredTripNumericIdRef.current }, { hovered: false });
        hoveredTripNumericIdRef.current = null;
      }
      hoveredTripRef.current = null;
      map.getCanvas().style.cursor = "";
      onVehicleHover?.(null);
      vehiclePopupRef.current?.remove();
      vehiclePopupRef.current = null;
    });

    // ── Vehicle click ──────────────────────────────────────────────────────
    map.on("click", "sim-vehicles-dot", (e) => {
      if (isDrawingRef.current) return;
      e.preventDefault();
      if (!e.features?.length) return;
      onVehicleClick?.(e.features[0].properties?.tripId as string);
    });

    mapRef.current = map;

    return () => {
      onMapDestroy?.();
      map.remove();
      mapRef.current = null;
    };
  }, [onLoad, onMapDestroy, onRouteClick, onCustomRouteClick, onRouteHover, onVehicleClick, onVehicleHover]);

  // ── Toggle rail network overlay when entering/leaving train design mode ──
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.getLayer("rail-network-line")) return;
    map.setLayoutProperty(
      "rail-network-line",
      "visibility",
      isTrainDesignMode ? "visible" : "none"
    );
  }, [isTrainDesignMode]);

  return <div ref={containerRef} className="w-full h-full" />;
});

export default Map;
