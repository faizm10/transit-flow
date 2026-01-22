"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import MapboxDraw from "@mapbox/mapbox-gl-draw";
import "@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css";
import { GitHubLogoIcon } from "@radix-ui/react-icons";

function parseCsvLine(line: string): string[] {
  const values: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const next = line[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      values.push(current);
      current = "";
      continue;
    }

    current += char;
  }

  values.push(current);
  return values;
}

export default function MapPage() {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const [unionPearsonShapes, setUnionPearsonShapes] =
    useState<GeoJSON.FeatureCollection | null>(null);
  const [showUnionPearson, setShowUnionPearson] = useState(true);
  const hasFitUnionPearson = useRef(false);
  const [mapReady, setMapReady] = useState(false);
  const [goTransitShapes, setGoTransitShapes] =
    useState<GeoJSON.FeatureCollection | null>(null);
  const [showGoBuses, setShowGoBuses] = useState(true);
  const [showGoTrains, setShowGoTrains] = useState(true);
  const [showGoTransit, setShowGoTransit] = useState(true);
  const [goTransitStops, setGoTransitStops] =
    useState<GeoJSON.FeatureCollection | null>(null);
  const [goRouteOptions, setGoRouteOptions] = useState<
    Array<{
      id: string;
      name: string;
      shortName: string;
      type: string;
      color: string;
    }>
  >([]);
  const [selectedGoRouteIds, setSelectedGoRouteIds] = useState<string[]>([]);
  const [goRouteFilterText, setGoRouteFilterText] = useState("");
  const hasInitializedGoRoutes = useRef(false);
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

    const hasRouteSelection = hasInitializedGoRoutes.current;
    const routesFilter: mapboxgl.Expression = [
      "all",
      routeTypeFilter,
      hasRouteSelection
        ? selectedGoRouteIds.length > 0
          ? ["in", ["get", "route_id"], ["literal", selectedGoRouteIds]]
          : ["in", ["get", "route_id"], ""]
        : ["has", "route_id"],
    ];

    // Filter routes layer
    const routesLayer = "go-transit-routes-layer";
    if (map.current.getLayer(routesLayer)) {
      map.current.setFilter(routesLayer, routesFilter);
    }

  }, [
    showGoBuses,
    showGoTrains,
    mapReady,
    selectedGoRouteIds,
    goRouteOptions,
  ]);

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

  // Fetch GO Transit shapes
  useEffect(() => {
    const fetchGoTransitShapes = async () => {
      try {
        console.log("[GO] Fetching shapes from /api/gotransit/shapes");
        const response = await fetch("/api/gotransit/shapes");
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data: GeoJSON.FeatureCollection = await response.json();
        console.log("[GO] Shapes loaded from API:", data.features.length);
        setGoTransitShapes(data);
      } catch (error) {
        console.error("Failed to fetch GO Transit shapes:", error);
      }
    };
    fetchGoTransitShapes();
  }, []);

  // Fetch GO Transit stops (train stops only)
  useEffect(() => {
    const fetchGoTransitStops = async () => {
      try {
        const response = await fetch("/api/gotransit/stops");
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data: GeoJSON.FeatureCollection = await response.json();
        setGoTransitStops(data);
      } catch (error) {
        console.warn("[GO] API stops fetch failed, trying fallback", error);
        try {
          const fallbackResponse = await fetch("/gotransit/stops.txt");
          if (!fallbackResponse.ok) {
            throw new Error(
              `Fallback HTTP error! status: ${fallbackResponse.status}`,
            );
          }
          const text = await fallbackResponse.text();
          const lines = text.split("\n").filter(Boolean);
          if (lines.length <= 1) {
            throw new Error("Fallback file empty");
          }

          const headers = parseCsvLine(lines[0]).map((header) =>
            header.trim(),
          );
          if (headers[0]) {
            headers[0] = headers[0].replace(/^\uFEFF/, "");
          }

          const features: GeoJSON.Feature[] = lines
            .slice(1)
            .map((line) => {
              const values = parseCsvLine(line);
              const row = headers.reduce<Record<string, string>>(
                (obj, header, index) => {
                  obj[header] = (values[index] || "").trim();
                  return obj;
                },
                {},
              );

              const lat = parseFloat(row.stop_lat);
              const lon = parseFloat(row.stop_lon);
              if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
                return null;
              }

              return {
                type: "Feature",
                properties: {
                  stop_id: row.stop_id,
                  stop_name: row.stop_name,
                },
                geometry: {
                  type: "Point",
                  coordinates: [lon, lat],
                },
              } as GeoJSON.Feature;
            })
            .filter(Boolean) as GeoJSON.Feature[];

          setGoTransitStops({
            type: "FeatureCollection",
            features,
          });
        } catch (fallbackError) {
          console.error("Failed to fetch GO Transit stops:", error);
          console.error("Failed fallback stops load:", fallbackError);
        }
      }
    };
    fetchGoTransitStops();
  }, []);

  useEffect(() => {
    if (!goTransitShapes) return;

    const optionsMap = new Map<
      string,
      { id: string; name: string; shortName: string; type: string; color: string }
    >();

    for (const feature of goTransitShapes.features) {
      const props = feature.properties as Record<string, string>;
      const id = props.route_id || "";
      if (!id || optionsMap.has(id)) continue;

      optionsMap.set(id, {
        id,
        name: props.route_name || "",
        shortName: props.route_short_name || "",
        type: props.route_type || "",
        color: props.route_color || "#10b981",
      });
    }

    const options = Array.from(optionsMap.values()).sort((a, b) => {
      if (a.type !== b.type) return a.type.localeCompare(b.type);
      return (a.shortName || a.name).localeCompare(b.shortName || b.name);
    });

    setGoRouteOptions(options);
    if (!hasInitializedGoRoutes.current && options.length > 0) {
      setSelectedGoRouteIds(options.map((route) => route.id));
      hasInitializedGoRoutes.current = true;
    }
  }, [goTransitShapes]);

  const groupedGoRoutes = useMemo(() => {
    const term = goRouteFilterText.trim().toLowerCase();
    const grouped = new Map<string, typeof goRouteOptions>();

    goRouteOptions.forEach((route) => {
      const haystack = `${route.shortName} ${route.name} ${route.id}`
        .trim()
        .toLowerCase();
      if (term && !haystack.includes(term)) return;

      const key = route.name || "Other";
      if (!grouped.has(key)) {
        grouped.set(key, []);
      }
      grouped.get(key)!.push(route);
    });

    return Array.from(grouped.entries()).map(([name, routes]) => ({
      name,
      routes: routes.sort((a, b) =>
        (a.shortName || a.id).localeCompare(b.shortName || b.id),
      ),
    }));
  }, [goRouteOptions, goRouteFilterText]);

  const toggleGoRoute = (routeId: string) => {
    setSelectedGoRouteIds((prev) =>
      prev.includes(routeId)
        ? prev.filter((id) => id !== routeId)
        : [...prev, routeId],
    );
  };

  const setGoRouteGroup = (routeIds: string[], enabled: boolean) => {
    setSelectedGoRouteIds((prev) => {
      if (enabled) {
        return Array.from(new Set([...prev, ...routeIds]));
      }
      return prev.filter((id) => !routeIds.includes(id));
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
      setMapReady(true);
    };

    map.current.on("style.load", handleStyleLoad);

    return () => {
      map.current?.off("style.load", handleStyleLoad);
      map.current?.remove();
      map.current = null;
      setMapReady(false);
    };
  }, [ensureUnionPearsonLayers, ensureGOTransitLayers]);

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
          showGoTrains && showGoTransit ? "visible" : "none",
        );
      }
    }
  }, [showGoTransit, showGoTrains, map.current]);

  useEffect(() => {
    if (!map.current || !map.current.isStyleLoaded()) return;
    if (!map.current.getLayer("go-transit-stops-layer")) return;

    const trainStopsFilter: mapboxgl.Expression = [
      "in",
      "2",
      ["get", "route_types"],
    ];

    map.current.setFilter("go-transit-stops-layer", trainStopsFilter);
  }, [mapReady, showGoTrains]);

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

  // Update GO Transit shapes data
  useEffect(() => {
    if (!mapReady || !map.current || !goTransitShapes) {
      return;
    }
    ensureGOTransitLayers();
    const source = map.current.getSource(
      "go-transit-routes",
    ) as mapboxgl.GeoJSONSource;
    if (source) {
      source.setData(goTransitShapes);
    }
  }, [mapReady, goTransitShapes, ensureGOTransitLayers]);

  useEffect(() => {
    if (!mapReady || !map.current || !goTransitStops) {
      return;
    }
    ensureGOTransitLayers();
    const source = map.current.getSource(
      "go-transit-stops",
    ) as mapboxgl.GeoJSONSource;
    if (source) {
      source.setData(goTransitStops);
    }
  }, [mapReady, goTransitStops, ensureGOTransitLayers]);

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

  return (
    <div className="relative h-screen w-full">
      {/* GitHub icon - top left */}
      <a
        href="https://github.com/jli2007/delta"
        target="_blank"
        rel="noopener noreferrer"
        className="absolute top-4 left-4 z-10 p-3 rounded-xl bg-black/40 backdrop-blur-md border border-white/10 text-white/60 hover:text-white hover:bg-black/60 transition-all"
      >
        <GitHubLogoIcon width={20} height={20} />
      </a>

      {/* Union Pearson Toggle Button */}
      <div className="absolute top-4 right-4 z-10 flex flex-col gap-2">
        <div className="flex gap-2">
          <button
            onClick={() => setShowUnionPearson((prev) => !prev)}
            className="p-3 rounded-xl bg-black/40 backdrop-blur-md border border-white/10 text-white/60 hover:text-white hover:bg-black/60 transition-all"
          >
            {showUnionPearson ? "Hide UPX" : "Show UPX"}
          </button>
          <button
            onClick={() => setShowGoTransit((prev) => !prev)}
            className="p-3 rounded-xl bg-black/40 backdrop-blur-md border border-white/10 text-white/60 hover:text-white hover:bg-black/60 transition-all"
          >
            {showGoTransit ? "Hide GO" : "Show GO"}
          </button>
        </div>

        <div className="w-64 max-h-[60vh] overflow-auto rounded-xl bg-black/40 backdrop-blur-md border border-white/10 p-3 text-white/70">
          <div className="flex items-center justify-between text-xs uppercase tracking-wide text-white/50">
            <span>GO Transit Routes</span>
            <div className="flex gap-2">
              <button
                className="text-white/60 hover:text-white transition"
                onClick={() =>
                  setSelectedGoRouteIds(goRouteOptions.map((route) => route.id))
                }
              >
                All
              </button>
              <button
                className="text-white/60 hover:text-white transition"
                onClick={() => setSelectedGoRouteIds([])}
              >
                None
              </button>
            </div>
          </div>

          <div className="mt-3 flex items-center gap-4 text-sm text-white/70">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                className="accent-emerald-400"
                checked={showGoTrains}
                onChange={() => setShowGoTrains((prev) => !prev)}
              />
              Trains
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                className="accent-emerald-400"
                checked={showGoBuses}
                onChange={() => setShowGoBuses((prev) => !prev)}
              />
              Buses
            </label>
          </div>

          <input
            type="text"
            value={goRouteFilterText}
            onChange={(event) => setGoRouteFilterText(event.target.value)}
            placeholder="Filter sub-routes (e.g., 31A)"
            className="mt-3 w-full rounded-lg bg-black/50 border border-white/10 px-3 py-2 text-xs text-white/80 placeholder:text-white/40"
          />

          {groupedGoRoutes.length === 0 && (
            <div className="mt-3 text-xs text-white/40">
              No routes match this filter.
            </div>
          )}

          {groupedGoRoutes.map((group) => {
            const routeIds = group.routes.map((route) => route.id);
            const selectedCount = routeIds.filter((id) =>
              selectedGoRouteIds.includes(id),
            ).length;

            return (
              <div key={group.name} className="mt-4">
                <div className="flex items-center justify-between text-[11px] text-white/40">
                  <span className="truncate">{group.name}</span>
                  <div className="flex gap-2">
                    <button
                      className="text-white/60 hover:text-white transition"
                      onClick={() => setGoRouteGroup(routeIds, true)}
                    >
                      All
                    </button>
                    <button
                      className="text-white/60 hover:text-white transition"
                      onClick={() => setGoRouteGroup(routeIds, false)}
                    >
                      None
                    </button>
                  </div>
                </div>
                <div className="mt-2 space-y-2">
                  {group.routes.map((route) => (
                    <label
                      key={route.id}
                      className="flex items-center gap-2 text-sm text-white/70"
                    >
                      <input
                        type="checkbox"
                        className="accent-emerald-400"
                        checked={selectedGoRouteIds.includes(route.id)}
                        onChange={() => toggleGoRoute(route.id)}
                      />
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ backgroundColor: route.color }}
                      />
                      <span className="truncate">
                        {route.shortName || route.name || route.id}
                      </span>
                      <span className="ml-auto text-[10px] uppercase text-white/40">
                        {route.type === "2" ? "Train" : "Bus"}
                      </span>
                    </label>
                  ))}
                </div>
                <div className="mt-1 text-[10px] text-white/30">
                  {selectedCount}/{routeIds.length} selected
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div ref={mapContainer} className="h-full w-full" />
    </div>
  );
}
