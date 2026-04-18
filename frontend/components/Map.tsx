"use client";

import { useEffect, useRef, forwardRef, useImperativeHandle } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { colorForRoute } from "@/lib/routeColors";

export interface MapHandle {
  getMap: () => mapboxgl.Map | null;
  flyTo: (options: Parameters<mapboxgl.Map["flyTo"]>[0]) => void;
  setRouteHighlight: (variantIds: string[] | null) => void;
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

      // Dim all routes, brighten selected
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
  }));

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
    map.addControl(
      new mapboxgl.AttributionControl({ compact: true }),
      "bottom-left"
    );

    map.on("load", () => {
      // ── GO Transit routes layer ──────────────────────────────────────────
      map.addSource("go-routes", {
        type: "geojson",
        data: "/gotransit/derived/variant_lines.geojson",
      });

      // Casing (white outline behind colored line)
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

      // Colored route lines
      map.addLayer({
        id: "go-routes-line",
        type: "line",
        source: "go-routes",
        layout: { "line-join": "round", "line-cap": "round" },
        paint: {
          "line-color": [
            "match",
            ["get", "route_short_name"],
            // Official GO Transit brand colors
            "BR", "#155ba0",
            "KI", "#138336",
            "LE", "#ee2722",
            "LW", "#8b0a31",
            "MI", "#dd521f",
            "RH", "#27adea",
            "ST", "#774111",
            "UP", "#231F20",
            "#4a6fa5", // default bus (muted blue)
          ],
          "line-width": [
            "match",
            ["get", "route_short_name"],
            // Rail lines slightly thicker
            "BR", 3, "KI", 3, "LE", 3, "LW", 3,
            "MI", 3, "RH", 3, "ST", 3, "UP", 3,
            2, // bus default
          ],
          "line-opacity": 1,
        },
      });

      // Invisible wider hit area for clicks
      map.addLayer({
        id: "go-routes-hit",
        type: "line",
        source: "go-routes",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": "transparent", "line-width": 12 },
      });

      // ── Custom routes layer (empty until user adds routes) ───────────────
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

      // ── Simulation vehicles layer (empty until simulation runs) ──────────
      map.addSource("sim-vehicles", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });

      // Outer glow / halo
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

      // Main dot
      map.addLayer({
        id: "sim-vehicles-dot",
        type: "circle",
        source: "sim-vehicles",
        paint: {
          "circle-radius": [
            "case",
            ["boolean", ["feature-state", "hovered"], false],
            10,
            7,
          ],
          "circle-color": ["get", "color"],
          "circle-stroke-width": 2,
          "circle-stroke-color": "#ffffff",
        },
      });

      // Route label on the dot
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

    // ── Hover interaction ────────────────────────────────────────────────
    map.on("mousemove", "go-routes-hit", (e) => {
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
      hoveredVariantRef.current = null;
      map.getCanvas().style.cursor = "";
      onRouteHover?.(null, null);
    });

    // ── Route click ──────────────────────────────────────────────────────
    map.on("click", "go-routes-hit", (e) => {
      if (!e.features?.length) return;
      const f = e.features[0];
      const variantId = f.properties?.variant_id as string;
      const shortName = f.properties?.route_short_name as string;
      onRouteClick?.(variantId, shortName);
    });

    // ── Vehicle hover ────────────────────────────────────────────────────
    map.on("mousemove", "sim-vehicles-dot", (e) => {
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
      if (hoveredTripNumericIdRef.current !== null) {
        map.setFeatureState({ source: "sim-vehicles", id: hoveredTripNumericIdRef.current }, { hovered: false });
        hoveredTripNumericIdRef.current = null;
      }
      hoveredTripRef.current = null;
      map.getCanvas().style.cursor = "";
      onVehicleHover?.(null);
    });

    // ── Vehicle click ────────────────────────────────────────────────────
    map.on("click", "sim-vehicles-dot", (e) => {
      e.preventDefault(); // prevent route click from also firing
      if (!e.features?.length) return;
      const tripId = e.features[0].properties?.tripId as string;
      onVehicleClick?.(tripId);
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
