"use client";

import { useEffect, useRef, forwardRef, useImperativeHandle } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import "@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css";
import { colorForRoute } from "@/lib/routeColors";

export interface MapHandle {
  getMap: () => mapboxgl.Map | null;
  flyTo: (options: Parameters<mapboxgl.Map["flyTo"]>[0]) => void;
  setRouteHighlight: (variantIds: string[] | null) => void;
  /** Activate draw_line_string mode. onComplete fires with coordinates when the line is finished. */
  startDraw: (onComplete: (coords: [number, number][]) => void) => void;
  /** Programmatically finish the current draw (same as double-click). */
  finishDraw: () => void;
  /** Cancel / remove the draw control without saving. */
  stopDraw: () => void;
}

interface MapProps {
  onLoad?: (map: mapboxgl.Map) => void;
  onRouteClick?: (variantId: string, routeShortName: string) => void;
  onRouteHover?: (variantId: string | null, routeShortName: string | null) => void;
  onVehicleClick?: (tripId: string) => void;
  onVehicleHover?: (tripId: string | null) => void;
}

const TORONTO_CENTER: [number, number] = [-79.385, 43.693];
const DEFAULT_ZOOM = 9.5;

const Map = forwardRef<MapHandle, MapProps>(function Map(
  { onLoad, onRouteClick, onRouteHover, onVehicleClick, onVehicleHover },
  ref
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const hoveredVariantRef = useRef<string | null>(null);
  const hoveredTripRef = useRef<string | null>(null);
  const hoveredTripNumericIdRef = useRef<number | null>(null);

  // Draw state — stored in refs so handlers don't close over stale values
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const drawRef = useRef<any>(null);
  const isDrawingRef = useRef(false);
  const drawCompleteCallbackRef = useRef<((coords: [number, number][]) => void) | null>(null);

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

        // Ensure draw mode is active (addControl sets defaultMode but be explicit)
        requestAnimationFrame(() => {
          try { draw.changeMode("draw_line_string"); } catch { /* already in mode */ }
        });

        // Set crosshair cursor
        map.getCanvas().style.cursor = "crosshair";

        // Listen for line completion (double-click / Enter)
        const onCreate = (e: { features: GeoJSON.Feature[] }) => {
          const feature = e.features[0] as GeoJSON.Feature<GeoJSON.LineString> | undefined;
          const coords = feature?.geometry?.coordinates as [number, number][] | undefined;
          cleanupDraw(map, draw);
          if (coords && coords.length >= 2) {
            drawCompleteCallbackRef.current?.(coords);
          }
        };
        map.on("draw.create", onCreate);
        // Store cleanup reference
        (draw as unknown as Record<string, unknown>).__onCreateRef = onCreate;
      });
    },

    finishDraw: () => {
      const map = mapRef.current;
      const draw = drawRef.current;
      if (!map || !draw) return;
      // Grab whatever has been drawn so far
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
  }));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function cleanupDraw(map: mapboxgl.Map, draw: any) {
    const onCreate = (draw as Record<string, unknown>).__onCreateRef as
      | ((e: { features: GeoJSON.Feature[] }) => void)
      | undefined;
    if (onCreate) map.off("draw.create", onCreate);
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
      style: "mapbox://styles/mapbox/light-v11",
      center: TORONTO_CENTER,
      zoom: DEFAULT_ZOOM,
      minZoom: 7,
      maxZoom: 18,
      attributionControl: false,
    });

    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "bottom-right");
    map.addControl(new mapboxgl.AttributionControl({ compact: true }), "bottom-left");

    map.on("load", () => {
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
        paint: { "line-color": "#ffffff", "line-width": 5, "line-opacity": 0.6 },
      });

      map.addLayer({
        id: "go-routes-line",
        type: "line",
        source: "go-routes",
        layout: { "line-join": "round", "line-cap": "round" },
        paint: {
          "line-color": [
            "match", ["get", "route_short_name"],
            "BR", "#155ba0", "KI", "#138336", "LE", "#ee2722", "LW", "#8b0a31",
            "MI", "#dd521f", "RH", "#27adea", "ST", "#774111", "UP", "#231F20",
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
        paint: { "line-color": "transparent", "line-width": 12 },
      });

      // ── Custom routes ──────────────────────────────────────────────────────
      map.addSource("custom-routes", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      map.addLayer({
        id: "custom-routes-line",
        type: "line",
        source: "custom-routes",
        layout: { "line-join": "round", "line-cap": "round" },
        paint: {
          "line-color": ["get", "color"],
          "line-width": 3,
          "line-dasharray": [2, 1],
          "line-opacity": 0.9,
        },
      });

      // ── Simulation vehicles ────────────────────────────────────────────────
      map.addSource("sim-vehicles", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });

      map.addLayer({
        id: "sim-vehicles-halo",
        type: "circle",
        source: "sim-vehicles",
        paint: {
          "circle-radius": 11,
          "circle-color": ["get", "color"],
          "circle-opacity": 0.25,
          "circle-stroke-width": 0,
        },
      });

      map.addLayer({
        id: "sim-vehicles-dot",
        type: "circle",
        source: "sim-vehicles",
        paint: {
          "circle-radius": [
            "case", ["boolean", ["feature-state", "hovered"], false], 10, 7,
          ],
          "circle-color": ["get", "color"],
          "circle-stroke-width": 2,
          "circle-stroke-color": "#ffffff",
        },
      });

      map.addLayer({
        id: "sim-vehicles-label",
        type: "symbol",
        source: "sim-vehicles",
        layout: {
          "text-field": ["get", "routeName"],
          "text-size": 9,
          "text-font": ["DIN Offc Pro Bold", "Arial Unicode MS Bold"],
          "text-offset": [0, 2.2],
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

      onLoad?.(map);
    });

    // ── Route hover ────────────────────────────────────────────────────────
    map.on("mousemove", "go-routes-hit", (e) => {
      if (isDrawingRef.current) return; // don't interfere with draw cursor
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
      if (isDrawingRef.current) return; // let MapboxDraw handle clicks
      if (!e.features?.length) return;
      const f = e.features[0];
      onRouteClick?.(f.properties?.variant_id as string, f.properties?.route_short_name as string);
    });

    // ── Vehicle hover ──────────────────────────────────────────────────────
    map.on("mousemove", "sim-vehicles-dot", (e) => {
      if (isDrawingRef.current) return;
      if (!e.features?.length) return;
      const tripId = e.features[0].properties?.tripId as string;
      const numericId = e.features[0].id as number;
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
      map.remove();
      mapRef.current = null;
    };
  }, [onLoad, onRouteClick, onRouteHover]);

  return <div ref={containerRef} className="w-full h-full" />;
});

export default Map;
