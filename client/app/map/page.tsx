"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import MapboxDraw from "@mapbox/mapbox-gl-draw";
import "@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css";
import { GitHubLogoIcon } from "@radix-ui/react-icons";

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
  const hasInitializedGoVariants = useRef(false);
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
    let hash = 0;
    for (let i = 0; i < routeShortName.length; i += 1) {
      hash = (hash * 31 + routeShortName.charCodeAt(i)) % 360;
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

  const groupedGoVariants = useMemo(() => {
    const term = goVariantFilterText.trim().toLowerCase();
    return Object.entries(goVariantsIndex)
      .map(([routeShortName, variants]) => {
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
  }, [goVariantsIndex, goVariantFilterText]);

  const toggleVariant = (variantId: string) => {
    setSelectedVariantIds((prev) =>
      prev.includes(variantId)
        ? prev.filter((id) => id !== variantId)
        : [...prev, variantId],
    );
  };

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
          showGoTransit ? "visible" : "none",
        );
      }
    }
  }, [showGoTransit, map.current]);

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

  const selectedVariantStops = useMemo(() => {
    if (!goVariantStops) return null;
    const features: GeoJSON.Feature[] = [];
    selectedVariantIds.forEach((variantId) => {
      const stops = goVariantStops[variantId] || [];
      const lookup = variantLookup.get(variantId);
      const routeInfo = lookup ? routeById.get(lookup.route_id) : null;
      const routeType = routeInfo ? String(routeInfo.route_type) : "";

      stops.forEach((stop) => {
        if (
          stop.stop_lat === null ||
          stop.stop_lon === null ||
          Number.isNaN(stop.stop_lat) ||
          Number.isNaN(stop.stop_lon)
        ) {
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
            route_short_name: lookup?.route_short_name || "",
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
            <span>GO Transit Variants</span>
            <div className="flex gap-2">
              <button
                className="text-white/60 hover:text-white transition"
                onClick={() => setSelectedVariantIds(allVariantIds)}
              >
                All
              </button>
              <button
                className="text-white/60 hover:text-white transition"
                onClick={() => setSelectedVariantIds([])}
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
            value={goVariantFilterText}
            onChange={(event) => setGoVariantFilterText(event.target.value)}
            placeholder="Filter variants (e.g., 31A or Union)"
            className="mt-3 w-full rounded-lg bg-black/50 border border-white/10 px-3 py-2 text-xs text-white/80 placeholder:text-white/40"
          />

          {groupedGoVariants.length === 0 && (
            <div className="mt-3 text-xs text-white/40">
              No routes match this filter.
            </div>
          )}

          {groupedGoVariants.map((group) => {
            const routeInfo = routeByShortName.get(group.routeShortName);
            const variantIds = group.items.flatMap((item) => item.variantIds);
            const selectedCount = variantIds.filter((id) =>
              selectedVariantIds.includes(id),
            ).length;

            return (
              <div key={group.routeShortName} className="mt-4">
                <div className="flex items-center justify-between text-[11px] text-white/40">
                  <span className="truncate">
                    {group.routeShortName}
                    {routeInfo?.route_long_name
                      ? ` · ${routeInfo.route_long_name}`
                      : ""}
                  </span>
                  <div className="flex gap-2">
                    <button
                      className="text-white/60 hover:text-white transition"
                      onClick={() => setVariantGroup(variantIds, true)}
                    >
                      All
                    </button>
                    <button
                      className="text-white/60 hover:text-white transition"
                      onClick={() => setVariantGroup(variantIds, false)}
                    >
                      None
                    </button>
                  </div>
                </div>
                <div className="mt-2 space-y-2">
                  {group.items.map((item) => {
                    return (
                    <label
                      key={item.displayKey}
                      className="flex items-center gap-2 text-sm text-white/70"
                    >
                      <input
                        type="checkbox"
                        className="accent-emerald-400"
                        checked={item.variantIds.every((id) =>
                          selectedVariantIds.includes(id),
                        )}
                        onChange={() => {
                          const enabled = !item.variantIds.every((id) =>
                            selectedVariantIds.includes(id),
                          );
                          setVariantGroup(item.variantIds, enabled);
                        }}
                      />
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{
                          backgroundColor: colorForRoute(group.routeShortName),
                        }}
                      />
                      <span className="truncate">{item.displayKey}</span>
                      <span className="ml-auto text-[10px] uppercase text-white/40">
                        {String(routeInfo?.route_type) === "2" ? "Train" : "Bus"}
                      </span>
                    </label>
                    );
                  })}
                </div>
                <div className="mt-1 text-[10px] text-white/30">
                  {selectedCount}/{variantIds.length} selected
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
