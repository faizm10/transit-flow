"use client";

import { useEffect, useRef } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import type { CustomRoute } from "@/lib/gtfs";

interface CommunityMapPreviewProps {
  route: CustomRoute;
  className?: string;
}

export default function CommunityMapPreview({ route, className = "" }: CommunityMapPreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const token = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;
    if (!token) return;
    mapboxgl.accessToken = token;

    // Build coordinate list from geometry or stops
    const coords: [number, number][] =
      Array.isArray(route.geometry) && route.geometry.length > 1
        ? route.geometry
        : (route.stops ?? []).map((s) => [s.lon, s.lat]);

    if (coords.length === 0) return;

    // Compute bounding box
    const lons = coords.map(([lon]) => lon);
    const lats = coords.map(([, lat]) => lat);
    const bounds = new mapboxgl.LngLatBounds(
      [Math.min(...lons), Math.min(...lats)],
      [Math.max(...lons), Math.max(...lats)]
    );

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: "mapbox://styles/mapbox/streets-v12",
      bounds,
      fitBoundsOptions: { padding: 48, maxZoom: 14 },
      interactive: false,
      attributionControl: false,
    });
    mapRef.current = map;

    map.on("load", () => {
      // Route line
      map.addSource("route", {
        type: "geojson",
        data: {
          type: "Feature",
          geometry: { type: "LineString", coordinates: coords },
          properties: {},
        },
      });

      map.addLayer({
        id: "route-line-casing",
        type: "line",
        source: "route",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": "#ffffff",
          "line-width": 6,
          "line-opacity": 0.8,
        },
      });

      map.addLayer({
        id: "route-line",
        type: "line",
        source: "route",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": route.color ?? "#3b82f6",
          "line-width": 4,
        },
      });

      // Stops
      const stops = route.stops ?? [];
      if (stops.length > 0) {
        map.addSource("stops", {
          type: "geojson",
          data: {
            type: "FeatureCollection",
            features: stops.map((s, i) => ({
              type: "Feature",
              geometry: { type: "Point", coordinates: [s.lon, s.lat] },
              properties: { name: s.name ?? "", isEndpoint: i === 0 || i === stops.length - 1 },
            })),
          },
        });

        // All stops: white dot with coloured border
        map.addLayer({
          id: "stops-circle",
          type: "circle",
          source: "stops",
          paint: {
            "circle-radius": ["case", ["get", "isEndpoint"], 7, 5],
            "circle-color": "#ffffff",
            "circle-stroke-color": route.color ?? "#3b82f6",
            "circle-stroke-width": 2.5,
          },
        });

        // Stop name labels
        map.addLayer({
          id: "stops-label",
          type: "symbol",
          source: "stops",
          layout: {
            "text-field": ["get", "name"],
            "text-size": 11,
            "text-offset": [0, 1.2],
            "text-anchor": "top",
            "text-max-width": 10,
          },
          paint: {
            "text-color": "#1e293b",
            "text-halo-color": "#ffffff",
            "text-halo-width": 1.5,
          },
        });
      }
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [route]);

  return (
    <div
      ref={containerRef}
      className={`h-72 w-full rounded-2xl overflow-hidden ${className}`}
      aria-label={`Map preview for ${route.name}`}
    />
  );
}
