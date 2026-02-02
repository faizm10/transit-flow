"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import {
  useRouteBuilder,
  expandSchedule,
  ROUTE_COLORS,
  type Stop,
  type Schedule,
} from "@/hooks/useRouteBuilder";
import type { DirectionsProfile } from "@/lib/mapboxDirections";

const ROUTE_LAYER_ID = "route-builder-line";
const ROUTE_SOURCE_ID = "route-builder-route";

type GoVariant = {
  variant_id: string;
  label: string;
  route_variant: string;
};

type GoVariantsIndex = Record<string, GoVariant[]>;

type GoVariantStop = {
  stop_id: string;
  stop_name: string;
  stop_lat: number | null;
  stop_lon: number | null;
  stop_sequence: number;
};

type RouteBuilderProps = {
  mapRef: React.RefObject<mapboxgl.Map | null>;
  mapReady: boolean;
  enabled: boolean;
  goVariantsIndex: GoVariantsIndex | null;
  goVariantStops: Record<string, GoVariantStop[]> | null;
  onClose?: () => void;
};

function getVariantLabel(
  variant: GoVariant,
  stops: GoVariantStop[] | undefined
): string {
  if (stops && stops.length >= 2) {
    const first = stops[0]?.stop_name ?? "";
    const last = stops[stops.length - 1]?.stop_name ?? "";
    const short = (s: string) =>
      s
        .replace(/\s+GO\s*$/i, "")
        .replace(/\s+Station\s*$/i, "")
        .replace(/\s+Bus\s*$/i, "")
        .replace(/\s+Terminal\s*$/i, "")
        .trim();
    if (first && last) return `${variant.route_variant || variant.variant_id} - ${short(first)} → ${short(last)}`;
  }
  return variant.label || variant.variant_id;
}

export function RouteBuilder({
  mapRef,
  mapReady,
  enabled,
  goVariantsIndex,
  goVariantStops,
  onClose,
}: RouteBuilderProps) {
  const {
    routes,
    currentRoute,
    activeRoute,
    stops,
    profile,
    setProfile,
    route,
    loading,
    error,
    addStop,
    updateStop,
    removeStop,
    moveStop,
    loadFromGoVariant,
    clearBaseVariant,
    saveRoute,
    loadRoute,
    deleteRoute,
    clearRoute,
    startNewRoute,
    updateCurrent,
  } = useRouteBuilder(goVariantStops);

  const [showExtendDropdown, setShowExtendDropdown] = useState(false);
  const [showSavedRoutes, setShowSavedRoutes] = useState(false);
  const [showSchedule, setShowSchedule] = useState(false);
  const markersRef = useRef<mapboxgl.Marker[]>([]);

  const variantOptions = useMemo(() => {
    if (!goVariantsIndex || !goVariantStops) return [];
    const out: { variantId: string; routeShortName: string; label: string }[] = [];
    Object.entries(goVariantsIndex).forEach(([routeShortName, variants]) => {
      variants.forEach((v) => {
        const s = goVariantStops[v.variant_id];
        if (s && s.length > 0) {
          out.push({
            variantId: v.variant_id,
            routeShortName,
            label: getVariantLabel(v, s),
          });
        }
      });
    });
    return out.sort((a, b) => a.label.localeCompare(b.label));
  }, [goVariantsIndex, goVariantStops]);

  const routeColor = activeRoute.color;

  // Ensure route layer exists; remove on unmount
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !enabled) return;

    const ensureLayer = () => {
      if (!map.getSource(ROUTE_SOURCE_ID)) {
        map.addSource(ROUTE_SOURCE_ID, {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] },
        });
      }
      if (!map.getLayer(ROUTE_LAYER_ID)) {
        map.addLayer({
          id: ROUTE_LAYER_ID,
          type: "line",
          source: ROUTE_SOURCE_ID,
          layout: { "line-join": "round", "line-cap": "round" },
          paint: {
            "line-color": routeColor,
            "line-width": 4,
          },
        });
      } else {
        map.setPaintProperty(ROUTE_LAYER_ID, "line-color", routeColor);
      }
    };

    if (map.isStyleLoaded()) {
      ensureLayer();
    } else {
      map.once("style.load", ensureLayer);
    }
    return () => {
      map.off("style.load", ensureLayer);
      if (map.getLayer(ROUTE_LAYER_ID)) map.removeLayer(ROUTE_LAYER_ID);
      if (map.getSource(ROUTE_SOURCE_ID)) map.removeSource(ROUTE_SOURCE_ID);
    };
  }, [mapRef, mapReady, enabled, routeColor]);

  // Update route line geometry
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !enabled) return;

    const source = map.getSource(ROUTE_SOURCE_ID) as mapboxgl.GeoJSONSource;
    if (!source) return;

    if (route?.geometry) {
      source.setData({
        type: "Feature",
        properties: {},
        geometry: route.geometry,
      });
    } else {
      source.setData({ type: "FeatureCollection", features: [] });
    }
  }, [mapRef, mapReady, enabled, route?.geometry]);

  // Map click to add stop
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !enabled) return;

    const handleClick = (e: mapboxgl.MapMouseEvent) => {
      const { lng, lat } = e.lngLat;
      addStop(lng, lat);
    };

    map.on("click", handleClick);
    map.getCanvas().style.cursor = "crosshair";
    return () => {
      map.off("click", handleClick);
      map.getCanvas().style.cursor = "";
    };
  }, [mapRef, mapReady, enabled, addStop]);

  // Markers for stops
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !enabled) return;

    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    stops.forEach((stop, index) => {
      const el = document.createElement("div");
      el.className = "route-builder-marker";
      el.style.cssText = `
        width: 24px; height: 24px; border-radius: 50%;
        background: ${routeColor}; border: 2px solid white;
        cursor: grab; box-shadow: 0 2px 6px rgba(0,0,0,0.3);
        display: flex; align-items: center; justify-content: center;
        color: white; font-size: 10px; font-weight: 700;
      `;
      el.textContent = String(index + 1);

      const marker = new mapboxgl.Marker({
        element: el,
        draggable: true,
      })
        .setLngLat([stop.lng, stop.lat])
        .addTo(map);

      marker.on("dragend", () => {
        const pos = marker.getLngLat();
        updateStop(stop.id, { lng: pos.lng, lat: pos.lat });
      });

      markersRef.current.push(marker);
    });

    return () => {
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];
    };
  }, [mapRef, mapReady, enabled, stops, routeColor, updateStop]);

  // Layer visibility when disabled
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    if (map.getLayer(ROUTE_LAYER_ID)) {
      map.setLayoutProperty(
        ROUTE_LAYER_ID,
        "visibility",
        enabled ? "visible" : "none"
      );
    }
  }, [mapRef, mapReady, enabled]);

  if (!enabled) return null;

  const schedule = activeRoute.schedule;
  const departures = schedule ? expandSchedule(schedule) : [];

  return (
    <div className="h-full overflow-hidden rounded-xl bg-black/70 backdrop-blur-md border border-white/20 shadow-2xl text-white/90 flex flex-col">
      <div className="px-3 py-2.5 border-b border-white/10 bg-black/40 flex items-start justify-between gap-2 shrink-0">
        <div>
          <h3 className="text-sm font-semibold text-white">Create New Route</h3>
          <p className="text-[10px] text-white/50 mt-0.5">
            Click map to add stops · Drag markers · Extend GO routes
          </p>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-white/10 text-white/70 hover:text-white transition-colors shrink-0"
            title="Close"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6 6 18" /><path d="m6 6 12 12" />
            </svg>
          </button>
        )}
      </div>

      <div className="p-3 space-y-3 overflow-y-auto flex-1 min-h-0">
        {/* Route name + color */}
        <div className="flex gap-2">
          <input
            type="text"
            value={activeRoute.name}
            onChange={(e) => updateCurrent({ name: e.target.value })}
            placeholder="Route name (e.g. 30 extended to London)"
            className="flex-1 rounded-lg bg-black/50 border border-white/10 px-2 py-1.5 text-xs text-white/90 placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
          />
          <div className="flex gap-1">
            {ROUTE_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => updateCurrent({ color: c })}
                className={`w-6 h-6 rounded-full border-2 transition-all ${
                  activeRoute.color === c ? "border-white scale-110" : "border-white/30"
                }`}
                style={{ backgroundColor: c }}
                title={c}
              />
            ))}
          </div>
        </div>

        {/* Extend GO route */}
        <div>
          <label className="text-[10px] text-white/60 block mb-1">
            Extend GO route (optional)
          </label>
          {activeRoute.baseVariantLabel ? (
            <div className="flex items-center gap-2 rounded-lg bg-emerald-500/20 border border-emerald-500/30 px-2 py-1.5">
              <span className="text-[11px] text-emerald-200 truncate flex-1">
                {activeRoute.baseVariantLabel}
              </span>
              <button
                onClick={clearBaseVariant}
                className="text-[10px] text-red-300 hover:text-red-200"
              >
                Clear
              </button>
            </div>
          ) : (
            <div className="relative">
              <button
                onClick={() => setShowExtendDropdown((v) => !v)}
                className="w-full rounded-lg bg-black/50 border border-white/10 px-2 py-1.5 text-xs text-white/70 hover:bg-black/60 text-left"
              >
                {showExtendDropdown ? "Hide options" : "Select GO route to extend..."}
              </button>
              {showExtendDropdown && (
                <div className="absolute top-full left-0 right-0 mt-1 max-h-40 overflow-y-auto rounded-lg bg-black/90 border border-white/20 shadow-xl z-20">
                  {variantOptions.length === 0 ? (
                    <div className="px-2 py-3 text-[10px] text-white/50">
                      Loading...
                    </div>
                  ) : (
                    variantOptions.map((opt) => (
                      <button
                        key={opt.variantId}
                        onClick={() => {
                          loadFromGoVariant(opt.variantId, opt.label);
                          setShowExtendDropdown(false);
                        }}
                        className="w-full px-2 py-2 text-left text-[11px] hover:bg-white/10 border-b border-white/5 last:border-0"
                      >
                        {opt.label}
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Profile */}
        <div>
          <label className="text-[10px] text-white/60 block mb-1">Profile</label>
          <select
            value={profile}
            onChange={(e) => setProfile(e.target.value as DirectionsProfile)}
            className="w-full rounded-lg bg-black/50 border border-white/10 px-2 py-1.5 text-xs text-white/90 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
          >
            <option value="mapbox/driving">Driving</option>
            <option value="mapbox/walking">Walking</option>
            <option value="mapbox/cycling">Cycling</option>
          </select>
        </div>

        {/* Route stats */}
        {route && (
          <div
            className="rounded-lg px-2.5 py-2 text-xs border"
            style={{
              backgroundColor: `${routeColor}20`,
              borderColor: `${routeColor}50`,
            }}
          >
            <div className="flex justify-between">
              <span className="text-white/70">Distance</span>
              <span className="font-medium">
                {(route.distance / 1000).toFixed(1)} km
              </span>
            </div>
            <div className="flex justify-between mt-1">
              <span className="text-white/70">Duration</span>
              <span className="font-medium">
                {Math.round(route.duration / 60)} min
              </span>
            </div>
          </div>
        )}

        {loading && (
          <div className="text-[10px] text-white/50">Calculating route...</div>
        )}
        {error && (
          <div className="text-[10px] text-red-300">{error}</div>
        )}

        {/* Schedule */}
        <div>
          <button
            onClick={() => setShowSchedule((v) => !v)}
            className="w-full flex items-center justify-between text-[10px] text-white/60 hover:text-white/80"
          >
            <span>Schedule & frequency</span>
            <span>{showSchedule ? "Hide" : "Show"}</span>
          </button>
          {showSchedule && (
            <ScheduleEditor
              schedule={schedule}
              onChange={(s) => updateCurrent({ schedule: s })}
            />
          )}
          {departures.length > 0 && (
            <div className="mt-1 text-[10px] text-white/45">
              {departures.length} departures: {departures.slice(0, 5).join(", ")}
              {departures.length > 5 ? ` ...` : ""}
            </div>
          )}
        </div>

        {/* Stops */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] text-white/60">Stops ({stops.length})</span>
            <div className="flex gap-2">
              <button
                onClick={saveRoute}
                disabled={stops.length < 2}
                className="text-[10px] text-emerald-400 hover:text-emerald-300 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Save
              </button>
              <button
                onClick={clearRoute}
                className="text-[10px] text-red-300 hover:text-red-200"
              >
                Clear
              </button>
            </div>
          </div>

          <div className="max-h-40 overflow-y-auto space-y-1">
            {stops.length === 0 ? (
              <div className="text-[10px] text-white/40 py-4 text-center">
                Extend a GO route or add 2+ stops by clicking the map
              </div>
            ) : (
              stops.map((stop, i) => (
                <StopRow
                  key={stop.id}
                  stop={stop}
                  index={i}
                  color={routeColor}
                  canMoveUp={i > 0}
                  canMoveDown={i < stops.length - 1}
                  onMoveUp={() => moveStop(stop.id, "up")}
                  onMoveDown={() => moveStop(stop.id, "down")}
                  onRemove={() => removeStop(stop.id)}
                />
              ))
            )}
          </div>
        </div>

        {/* Saved routes */}
        {routes.length > 0 && (
          <div>
            <button
              onClick={() => setShowSavedRoutes((v) => !v)}
              className="w-full flex items-center justify-between text-[10px] text-white/60 hover:text-white/80"
            >
              <span>Saved routes ({routes.length})</span>
              <span>{showSavedRoutes ? "Hide" : "Show"}</span>
            </button>
            {showSavedRoutes && (
              <div className="mt-2 space-y-1">
                {routes.map((r) => (
                  <div
                    key={r.id}
                    className="flex items-center gap-2 rounded-lg bg-black/30 border border-white/10 px-2 py-1.5"
                  >
                    <span
                      className="w-3 h-3 rounded-full shrink-0"
                      style={{ backgroundColor: r.color }}
                    />
                    <span className="text-[11px] truncate flex-1">{r.name}</span>
                    <button
                      onClick={() => loadRoute(r)}
                      className="text-[10px] text-blue-400 hover:text-blue-300"
                    >
                      Load
                    </button>
                    <button
                      onClick={() => deleteRoute(r.id)}
                      className="text-[10px] text-red-400 hover:text-red-300"
                    >
                      Del
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function ScheduleEditor({
  schedule,
  onChange,
}: {
  schedule: Schedule | undefined;
  onChange: (s: Schedule | undefined) => void;
}) {
  const [type, setType] = useState<"frequency" | "fixed" | "none">(
    schedule?.type ?? "none"
  );
  const [startTime, setStartTime] = useState(
    schedule?.type === "frequency" ? schedule.startTime : "06:00"
  );
  const [endTime, setEndTime] = useState(
    schedule?.type === "frequency" ? schedule.endTime : "22:00"
  );
  const [intervalMinutes, setIntervalMinutes] = useState(
    schedule?.type === "frequency" ? schedule.intervalMinutes : 30
  );
  const [days, setDays] = useState<"weekday" | "weekend" | "all">(
    schedule?.type === "frequency" ? schedule.days : "weekday"
  );
  const [departuresText, setDeparturesText] = useState(
    schedule?.type === "fixed"
      ? schedule.departures.join(", ")
      : "06:00, 06:30, 07:00, 07:30, 08:00"
  );

  useEffect(() => {
    setType(schedule?.type ?? "none");
    if (schedule?.type === "frequency") {
      setStartTime(schedule.startTime);
      setEndTime(schedule.endTime);
      setIntervalMinutes(schedule.intervalMinutes);
      setDays(schedule.days);
    } else if (schedule?.type === "fixed") {
      setDeparturesText(schedule.departures.join(", "));
    }
  }, [schedule]);

  const apply = () => {
    if (type === "none") {
      onChange(undefined);
      return;
    }
    if (type === "frequency") {
      onChange({
        type: "frequency",
        startTime,
        endTime,
        intervalMinutes,
        days,
      });
    } else {
      const list = departuresText
        .split(/[\s,;]+/)
        .map((s) => s.trim())
        .filter((s) => /^\d{1,2}:\d{2}$/.test(s));
      onChange({ type: "fixed", departures: list });
    }
  };

  return (
    <div className="mt-2 space-y-2 rounded-lg bg-black/30 border border-white/10 p-2 text-[11px]">
      <div className="flex gap-2">
        <button
          onClick={() => setType("none")}
          className={`px-2 py-1 rounded ${type === "none" ? "bg-white/20" : "bg-white/5"}`}
        >
          None
        </button>
        <button
          onClick={() => setType("frequency")}
          className={`px-2 py-1 rounded ${type === "frequency" ? "bg-white/20" : "bg-white/5"}`}
        >
          Frequency
        </button>
        <button
          onClick={() => setType("fixed")}
          className={`px-2 py-1 rounded ${type === "fixed" ? "bg-white/20" : "bg-white/5"}`}
        >
          Fixed times
        </button>
      </div>
      {type === "frequency" && (
        <>
          <div className="grid grid-cols-2 gap-2">
            <label>
              <span className="text-white/50">Start</span>
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="mt-1 w-full rounded bg-black/50 border border-white/10 px-2 py-1 text-xs"
              />
            </label>
            <label>
              <span className="text-white/50">End</span>
              <input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="mt-1 w-full rounded bg-black/50 border border-white/10 px-2 py-1 text-xs"
              />
            </label>
          </div>
          <div>
            <span className="text-white/50">Interval (min)</span>
            <select
              value={intervalMinutes}
              onChange={(e) => setIntervalMinutes(Number(e.target.value))}
              className="mt-1 w-full rounded bg-black/50 border border-white/10 px-2 py-1 text-xs"
            >
              {[15, 30, 45, 60, 90, 120].map((m) => (
                <option key={m} value={m}>
                  Every {m} min
                </option>
              ))}
            </select>
          </div>
          <div>
            <span className="text-white/50">Days</span>
            <select
              value={days}
              onChange={(e) => setDays(e.target.value as "weekday" | "weekend" | "all")}
              className="mt-1 w-full rounded bg-black/50 border border-white/10 px-2 py-1 text-xs"
            >
              <option value="weekday">Weekdays</option>
              <option value="weekend">Weekends</option>
              <option value="all">All days</option>
            </select>
          </div>
        </>
      )}
      {type === "fixed" && (
        <label>
          <span className="text-white/50">Times (e.g. 06:00, 06:30, 07:00)</span>
          <input
            type="text"
            value={departuresText}
            onChange={(e) => setDeparturesText(e.target.value)}
            placeholder="06:00, 06:30, 07:00"
            className="mt-1 w-full rounded bg-black/50 border border-white/10 px-2 py-1 text-xs"
          />
        </label>
      )}
      {type !== "none" && (
        <button
          onClick={apply}
          className="w-full py-1.5 rounded bg-blue-500/30 text-blue-200 text-[10px] hover:bg-blue-500/40"
        >
          Apply schedule
        </button>
      )}
    </div>
  );
}

function StopRow({
  stop,
  index,
  color,
  canMoveUp,
  canMoveDown,
  onMoveUp,
  onMoveDown,
  onRemove,
}: {
  stop: Stop;
  index: number;
  color: string;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex items-center gap-2 rounded-lg bg-black/30 border border-white/10 px-2 py-1.5 group">
      <span
        className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 text-white"
        style={{ backgroundColor: color }}
      >
        {index + 1}
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[11px] truncate">{stop.name ?? `Stop ${index + 1}`}</div>
        <div className="text-[10px] text-white/45 truncate">
          {stop.lat.toFixed(5)}, {stop.lng.toFixed(5)}
        </div>
      </div>
      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={onMoveUp}
          disabled={!canMoveUp}
          className="p-1 rounded hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed text-[10px]"
          title="Move up"
        >
          ▲
        </button>
        <button
          onClick={onMoveDown}
          disabled={!canMoveDown}
          className="p-1 rounded hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed text-[10px]"
          title="Move down"
        >
          ▼
        </button>
        <button
          onClick={onRemove}
          className="p-1 rounded hover:bg-red-500/30 text-red-300 text-[10px]"
          title="Remove"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
