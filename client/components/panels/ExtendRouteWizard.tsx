"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  ArrowLeft, ArrowRight, Check, Plus, X, MapPin, ChevronUp, ChevronDown, Loader2, Train, Bus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  EnrichedRoute, CustomRoute, CustomStop, CustomSchedule, GTFSStop, ExtensionMeta,
} from "@/lib/gtfs";
import { CUSTOM_ROUTE_COLORS } from "@/lib/routeColors";
import { v4 as uuidv4 } from "uuid";

// ─── Types ──────────────────────────────────────────────────────────────────

interface ExtendRouteWizardProps {
  initialRoute?: EnrichedRoute;
  onSave: (route: CustomRoute) => void;
  onPreviewRoute: (coords: [number, number][], color: string) => void;
  onClearPreview: () => void;
  onStartPinMode: (cb: (lat: number, lon: number) => void) => void;
  onStopPinMode: () => void;
  onCancel: () => void;
}

type Step = 1 | 2 | 3 | 4;
type FreqChip = "quarter" | "half" | "same" | "custom";

// ─── Schedule builder ────────────────────────────────────────────────────────

function buildExtendedSchedule(
  parentWeeklyTrips: number,
  multiplier: number,
  headwayOverrideMins: number | null,
  direction: "one-way" | "two-way",
): CustomSchedule {
  const dailyTrips = Math.round(parentWeeklyTrips / 5);
  const baseHeadway = headwayOverrideMins ?? Math.round((16 * 60) / Math.max(1, dailyTrips));
  const effectiveHeadway = Math.round(baseHeadway / multiplier);
  const h = Math.max(5, Math.min(120, effectiveHeadway));

  return {
    type: "banded",
    direction,
    weekday: {
      active: true,
      bands: [
        { id: uuidv4(), label: "Morning peak",   startHour: 6,  startMin: 0, endHour: 9,  endMin: 0,  headwayMins: Math.max(5, Math.round(h * 0.6)) },
        { id: uuidv4(), label: "Midday",         startHour: 9,  startMin: 0, endHour: 15, endMin: 0,  headwayMins: h },
        { id: uuidv4(), label: "Afternoon peak", startHour: 15, startMin: 0, endHour: 19, endMin: 0,  headwayMins: Math.max(5, Math.round(h * 0.7)) },
        { id: uuidv4(), label: "Evening",        startHour: 19, startMin: 0, endHour: 22, endMin: 0,  headwayMins: Math.min(120, Math.round(h * 1.4)) },
      ],
    },
    saturday: {
      active: parentWeeklyTrips > 300,
      bands: parentWeeklyTrips > 300 ? [
        { id: uuidv4(), label: "All day", startHour: 7, startMin: 0, endHour: 21, endMin: 0, headwayMins: Math.min(120, h * 2) },
      ] : [],
    },
    sunday: { active: false, bands: [] },
  };
}

/** Reduce coords to at most `max` waypoints, keeping start + end. */
function sampleCoords(coords: [number, number][], max = 25): [number, number][] {
  if (coords.length <= max) return coords;
  const result: [number, number][] = [coords[0]];
  const step = (coords.length - 2) / (max - 2);
  for (let i = 1; i < max - 1; i++) {
    result.push(coords[Math.round(i * step)]);
  }
  result.push(coords[coords.length - 1]);
  return result;
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function ExtendRouteWizard({
  initialRoute,
  onSave,
  onPreviewRoute,
  onClearPreview,
  onStartPinMode,
  onStopPinMode,
  onCancel,
}: ExtendRouteWizardProps) {
  // ── Step management ────────────────────────────────────────────────────────
  const [step, setStep] = useState<Step>(initialRoute ? 2 : 1);

  // ── Step 1: route selection ────────────────────────────────────────────────
  const [allRoutes, setAllRoutes] = useState<EnrichedRoute[]>([]);
  const [routesLoading, setRoutesLoading] = useState(false);
  const [routeQuery, setRouteQuery] = useState("");
  const [selectedRoute, setSelectedRoute] = useState<EnrichedRoute | undefined>(initialRoute);

  // ── Step 2: extension stops ────────────────────────────────────────────────
  const [extensionStops, setExtensionStops] = useState<CustomStop[]>([]);
  const [stopQuery, setStopQuery] = useState("");
  const [stopResults, setStopResults] = useState<Array<{ stop_id: string; stop_name: string; lat: number; lon: number }>>([]);
  const [stopSearching, setStopSearching] = useState(false);
  const [pinActive, setPinActive] = useState(false);
  const [baseStops, setBaseStops] = useState<GTFSStop[]>([]);
  const [baseStopsLoading, setBaseStopsLoading] = useState(false);
  const [directionInfo, setDirectionInfo] = useState<{ durationSecs: number; distanceM: number } | null>(null);
  const [directionLoading, setDirectionLoading] = useState(false);
  const pinCounterRef = useRef(0);

  // ── Step 3: name & options ─────────────────────────────────────────────────
  const [routeName, setRouteName] = useState("");
  const [branchSuffix, setBranchSuffix] = useState("R");
  const [color, setColor] = useState(CUSTOM_ROUTE_COLORS[0]);
  const [keepOriginal, setKeepOriginal] = useState(true);

  // ── Step 4: schedule ───────────────────────────────────────────────────────
  const [freqChip, setFreqChip] = useState<FreqChip>("same");
  const [customHeadway, setCustomHeadway] = useState<string>("");
  const [direction, setDirection] = useState<"one-way" | "two-way">("two-way");
  const [saving, setSaving] = useState(false);

  // ── Derived values ─────────────────────────────────────────────────────────
  const multiplier = freqChip === "quarter" ? 0.25 : freqChip === "half" ? 0.5 : freqChip === "same" ? 1 : 1;
  const headwayOverride = freqChip === "custom" && customHeadway ? Number(customHeadway) : null;
  const parentWeeklyTrips = selectedRoute?.weekly_trips ?? 0;
  const estimatedWeeklyTrips = freqChip === "custom" && headwayOverride
    ? Math.round((16 * 60 / headwayOverride) * 5)
    : Math.round(parentWeeklyTrips * multiplier);

  // ── Load routes for step 1 ─────────────────────────────────────────────────
  useEffect(() => {
    if (initialRoute) return; // skip if pre-selected
    setRoutesLoading(true);
    fetch("/api/routes")
      .then((r) => r.json())
      .then((d) => { setAllRoutes(d.routes ?? []); setRoutesLoading(false); })
      .catch(() => setRoutesLoading(false));
  }, [initialRoute]);

  // ── Load base stops when route selected ───────────────────────────────────
  useEffect(() => {
    if (!selectedRoute) return;
    const variantId = selectedRoute.variants[0]?.variant_id;
    if (!variantId) return;
    setBaseStopsLoading(true);
    fetch(`/api/variant-stops?variant_id=${encodeURIComponent(variantId)}`)
      .then((r) => r.json())
      .then((d) => { setBaseStops(d.stops ?? []); setBaseStopsLoading(false); })
      .catch(() => setBaseStopsLoading(false));
  }, [selectedRoute]);

  // ── Pre-fill name when route/suffix/extensionStops changes ────────────────
  useEffect(() => {
    if (!selectedRoute) return;
    const lastStop = extensionStops[extensionStops.length - 1]?.name ?? selectedRoute.to_stop;
    setRouteName(`${selectedRoute.short_name}${branchSuffix} — ${lastStop}`);
  }, [selectedRoute, branchSuffix, extensionStops]);

  // ── Stop search ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!stopQuery.trim()) { setStopResults([]); return; }
    const tid = setTimeout(() => {
      setStopSearching(true);
      fetch(`/api/stops?q=${encodeURIComponent(stopQuery)}`)
        .then((r) => r.json())
        .then((d) => { setStopResults(d.stops ?? []); setStopSearching(false); })
        .catch(() => setStopSearching(false));
    }, 250);
    return () => clearTimeout(tid);
  }, [stopQuery]);

  // ── Directions fetch ───────────────────────────────────────────────────────
  useEffect(() => {
    if (extensionStops.length < 1) { setDirectionInfo(null); onClearPreview(); return; }

    // Build waypoints: branch point (last base stop) + extension stops
    const branchPoint = baseStops.length > 0
      ? { lat: baseStops[baseStops.length - 1].stop_lat, lon: baseStops[baseStops.length - 1].stop_lon }
      : null;

    const allWaypoints: [number, number][] = [];
    if (branchPoint) allWaypoints.push([branchPoint.lon, branchPoint.lat]);
    for (const s of extensionStops) allWaypoints.push([s.lon, s.lat]);

    if (allWaypoints.length < 2) return;

    const sampled = sampleCoords(allWaypoints, 25);
    const coordStr = sampled.map(([lon, lat]) => `${lon},${lat}`).join(";");
    const token = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;
    if (!token) return;

    setDirectionLoading(true);
    fetch(
      `https://api.mapbox.com/directions/v5/mapbox/driving/${coordStr}?access_token=${token}&geometries=geojson&overview=full&annotations=duration`
    )
      .then((r) => r.json())
      .then((d) => {
        const route = d.routes?.[0];
        if (route) {
          setDirectionInfo({ durationSecs: route.duration, distanceM: route.distance });
          const coords = route.geometry?.coordinates as [number, number][] | undefined;
          if (coords && color) onPreviewRoute(coords, color);
        }
        setDirectionLoading(false);
      })
      .catch(() => setDirectionLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [extensionStops, baseStops, color]);

  // ── Cleanup pin mode on unmount ───────────────────────────────────────────
  useEffect(() => {
    return () => {
      onStopPinMode();
      onClearPreview();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleSelectRoute = useCallback((route: EnrichedRoute) => {
    setSelectedRoute(route);
    setStep(2);
  }, []);

  const handleAddStop = useCallback((stop: { stop_id?: string; stop_name: string; lat: number; lon: number }) => {
    setExtensionStops((prev) => [
      ...prev,
      { id: uuidv4(), name: stop.stop_name, lat: stop.lat, lon: stop.lon, sequence: prev.length + 1 },
    ]);
    setStopQuery("");
    setStopResults([]);
  }, []);

  const handleRemoveStop = useCallback((id: string) => {
    setExtensionStops((prev) => prev.filter((s) => s.id !== id));
  }, []);

  const handleMoveStop = useCallback((idx: number, dir: -1 | 1) => {
    setExtensionStops((prev) => {
      const next = [...prev];
      const target = idx + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });
  }, []);

  const togglePinMode = useCallback(() => {
    if (pinActive) {
      onStopPinMode();
      setPinActive(false);
    } else {
      onStartPinMode((lat, lon) => {
        pinCounterRef.current += 1;
        handleAddStop({ stop_name: `Stop ${pinCounterRef.current}`, lat, lon });
      });
      setPinActive(true);
    }
  }, [pinActive, onStartPinMode, onStopPinMode, handleAddStop]);

  const handleSave = useCallback(async () => {
    if (!selectedRoute) return;
    setSaving(true);

    try {
      // Convert base GTFSStops to CustomStop[]
      const baseCustomStops: CustomStop[] = baseStops.map((s, i) => ({
        id: uuidv4(),
        name: s.stop_name,
        lat: s.stop_lat,
        lon: s.stop_lon,
        sequence: i,
      }));

      // Re-sequence extension stops after base stops
      const resequencedExtension: CustomStop[] = extensionStops.map((s, i) => ({
        ...s,
        sequence: baseCustomStops.length + i,
      }));

      const allStops = [...baseCustomStops, ...resequencedExtension];

      // Build geometry: use extension directions geometry if available
      // Simplification: extension geometry only (avoids 1.4MB base GeoJSON fetch)
      let geometry: [number, number][] | undefined;
      if (extensionStops.length >= 1) {
        const branchPoint = baseStops.length > 0
          ? [baseStops[baseStops.length - 1].stop_lon, baseStops[baseStops.length - 1].stop_lat] as [number, number]
          : null;
        const waypoints: [number, number][] = branchPoint ? [branchPoint] : [];
        for (const s of extensionStops) waypoints.push([s.lon, s.lat]);

        const sampled = sampleCoords(waypoints, 25);
        const coordStr = sampled.map(([lon, lat]) => `${lon},${lat}`).join(";");
        const token = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;
        if (token && sampled.length >= 2) {
          try {
            const resp = await fetch(
              `https://api.mapbox.com/directions/v5/mapbox/driving/${coordStr}?access_token=${token}&geometries=geojson&overview=full`
            );
            const data = await resp.json();
            geometry = data.routes?.[0]?.geometry?.coordinates as [number, number][] | undefined;
          } catch {
            // fall back to straight-line
          }
        }
      }

      // Fallback: straight lines through all stops
      if (!geometry) {
        geometry = allStops.map((s) => [s.lon, s.lat] as [number, number]);
      }

      const schedule = buildExtendedSchedule(parentWeeklyTrips, multiplier, headwayOverride, direction);

      const extensionMeta: ExtensionMeta = {
        parentRouteShortName: selectedRoute.short_name,
        parentRouteName: selectedRoute.long_name,
        parentRouteColor: selectedRoute.color,
        parentWeeklyTrips: selectedRoute.weekly_trips,
        branchSuffix,
        scheduleMultiplier: multiplier,
        keepOriginalRunning: keepOriginal,
        extensionTravelTimeMins: directionInfo ? Math.round(directionInfo.durationSecs / 60) : 0,
        baseStopCount: baseCustomStops.length,
      };

      const route: CustomRoute = {
        id: uuidv4(),
        name: routeName,
        color,
        type: selectedRoute.is_rail ? "train" : "bus",
        stops: allStops,
        geometry,
        schedule,
        createdAt: new Date().toISOString(),
        extension: extensionMeta,
      };

      onSave(route);
      onClearPreview();
    } finally {
      setSaving(false);
    }
  }, [
    selectedRoute, baseStops, extensionStops, routeName, color, branchSuffix, keepOriginal,
    multiplier, headwayOverride, direction, directionInfo, parentWeeklyTrips, onSave, onClearPreview,
  ]);

  // ── Filtered routes for step 1 ─────────────────────────────────────────────
  const filteredRoutes = routeQuery.trim()
    ? allRoutes.filter(
        (r) =>
          r.short_name.toLowerCase().includes(routeQuery.toLowerCase()) ||
          r.long_name.toLowerCase().includes(routeQuery.toLowerCase())
      )
    : allRoutes;

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 pt-4 pb-3 border-b border-slate-100">
        <div className="flex items-center gap-2 mb-2">
          <button
            onClick={onCancel}
            className="p-1 rounded-lg hover:bg-slate-100 transition-colors text-slate-400 hover:text-slate-600"
            aria-label="Cancel"
          >
            <X className="w-4 h-4" />
          </button>
          <h2 className="font-semibold text-slate-900 text-base">Extend a GO Route</h2>
        </div>
        {/* Step indicator */}
        <div className="flex items-center gap-1.5">
          {([1, 2, 3, 4] as Step[]).map((s) => (
            <div
              key={s}
              className={`h-1.5 flex-1 rounded-full transition-colors ${
                s < step ? "bg-[#007A33]" : s === step ? "bg-[#007A33]" : "bg-slate-200"
              }`}
            />
          ))}
        </div>
        <p className="text-xs text-slate-400 mt-1.5">
          {step === 1 && "Select a base route"}
          {step === 2 && "Add extension stops"}
          {step === 3 && "Name & options"}
          {step === 4 && "Schedule"}
        </p>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-3">

        {/* ── Step 1: Pick a route ── */}
        {step === 1 && (
          <>
            <Input
              placeholder="Search routes..."
              value={routeQuery}
              onChange={(e) => setRouteQuery(e.target.value)}
              className="h-9 text-sm"
            />
            {routesLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
              </div>
            ) : (
              <div className="flex flex-col gap-1.5">
                {filteredRoutes.map((route) => (
                  <button
                    key={route.route_id}
                    onClick={() => handleSelectRoute(route)}
                    className="w-full flex items-center gap-3 p-2.5 rounded-xl border border-transparent hover:border-slate-200 hover:bg-slate-50 text-left transition-colors"
                  >
                    <div
                      className="w-9 h-9 rounded-lg flex items-center justify-center text-white font-bold text-xs flex-shrink-0"
                      style={{ backgroundColor: route.color }}
                    >
                      {route.short_name}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800 truncate">{route.long_name || route.short_name}</p>
                      <p className="text-xs text-slate-400 truncate">{route.from_stop} → {route.to_stop}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1 flex-shrink-0">
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                        {route.weekly_trips.toLocaleString()}/wk
                      </Badge>
                      {route.is_rail ? <Train className="w-3 h-3 text-slate-300" /> : <Bus className="w-3 h-3 text-slate-300" />}
                    </div>
                  </button>
                ))}
                {filteredRoutes.length === 0 && !routesLoading && (
                  <p className="text-sm text-slate-400 text-center py-6">No routes found</p>
                )}
              </div>
            )}
          </>
        )}

        {/* ── Step 2: Add extension stops ── */}
        {step === 2 && selectedRoute && (
          <>
            {/* Base route badge */}
            <div className="flex items-center gap-2 p-2.5 rounded-xl bg-slate-50 border border-slate-100">
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold text-xs flex-shrink-0"
                style={{ backgroundColor: selectedRoute.color }}
              >
                {selectedRoute.short_name}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-slate-700 truncate">{selectedRoute.long_name}</p>
                <p className="text-xs text-slate-400">Extending from <span className="font-medium">{selectedRoute.to_stop}</span></p>
              </div>
            </div>

            {/* Base stop count note */}
            {baseStopsLoading ? (
              <p className="text-xs text-slate-400 flex items-center gap-1">
                <Loader2 className="w-3 h-3 animate-spin" /> Loading base stops…
              </p>
            ) : (
              <p className="text-xs text-slate-500">
                Includes <span className="font-medium">{baseStops.length} base stops</span> from Route {selectedRoute.short_name}
              </p>
            )}

            {/* Branch point (locked) */}
            <div>
              <p className="text-xs font-medium text-slate-600 mb-1.5">Extension stops</p>
              <div className="flex items-center gap-2 p-2 rounded-lg bg-slate-100 mb-1">
                <MapPin className="w-3.5 h-3.5 text-[#007A33] flex-shrink-0" />
                <span className="text-xs text-slate-600 truncate">{selectedRoute.to_stop}</span>
                <Badge variant="secondary" className="text-[10px] px-1 py-0 ml-auto">branch point</Badge>
              </div>

              {/* Extension stop list */}
              {extensionStops.map((stop, idx) => (
                <div key={stop.id} className="flex items-center gap-2 p-2 rounded-lg hover:bg-slate-50 group mb-1">
                  <MapPin className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                  <span className="text-xs text-slate-700 flex-1 truncate">{stop.name}</span>
                  <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => handleMoveStop(idx, -1)}
                      disabled={idx === 0}
                      className="p-0.5 rounded hover:bg-slate-200 disabled:opacity-30"
                      aria-label="Move up"
                    >
                      <ChevronUp className="w-3 h-3 text-slate-500" />
                    </button>
                    <button
                      onClick={() => handleMoveStop(idx, 1)}
                      disabled={idx === extensionStops.length - 1}
                      className="p-0.5 rounded hover:bg-slate-200 disabled:opacity-30"
                      aria-label="Move down"
                    >
                      <ChevronDown className="w-3 h-3 text-slate-500" />
                    </button>
                    <button
                      onClick={() => handleRemoveStop(stop.id)}
                      className="p-0.5 rounded hover:bg-red-100 text-slate-400 hover:text-red-500"
                      aria-label="Remove stop"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Stop search */}
            <div className="relative">
              <Input
                placeholder="Search for a stop to add..."
                value={stopQuery}
                onChange={(e) => setStopQuery(e.target.value)}
                className="h-9 text-sm pr-8"
              />
              {stopSearching && (
                <Loader2 className="absolute right-2.5 top-2.5 w-4 h-4 animate-spin text-slate-400" />
              )}
              {stopResults.length > 0 && (
                <div className="absolute top-full mt-1 left-0 right-0 bg-white border border-slate-200 rounded-xl shadow-lg z-10 overflow-hidden">
                  {stopResults.map((s) => (
                    <button
                      key={s.stop_id}
                      onClick={() => handleAddStop(s)}
                      className="w-full flex items-center gap-2 px-3 py-2 hover:bg-slate-50 text-left text-xs text-slate-700 border-b border-slate-50 last:border-0"
                    >
                      <Plus className="w-3 h-3 text-slate-400 flex-shrink-0" />
                      {s.stop_name}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Pin on map button */}
            <button
              onClick={togglePinMode}
              className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-medium transition-colors ${
                pinActive
                  ? "bg-[#007A33] text-white border-[#007A33]"
                  : "bg-white text-slate-700 border-slate-200 hover:border-[#007A33] hover:text-[#007A33]"
              }`}
            >
              <MapPin className="w-3.5 h-3.5" />
              {pinActive ? "Pinning active — tap Done to stop" : "Pin stop on map"}
            </button>

            {/* Pin mode banner */}
            {pinActive && (
              <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-[#007A33]/10 border border-[#007A33]/20 text-xs text-[#007A33]">
                <span className="font-medium">Click on the map to pin a stop</span>
                <button
                  onClick={togglePinMode}
                  className="font-semibold hover:text-[#005f28] transition-colors"
                >
                  Done
                </button>
              </div>
            )}

            {/* Direction info */}
            {directionLoading && (
              <p className="text-xs text-slate-400 flex items-center gap-1">
                <Loader2 className="w-3 h-3 animate-spin" /> Calculating route…
              </p>
            )}
            {directionInfo && !directionLoading && (
              <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-100 text-xs text-emerald-700">
                Extension adds ~{Math.round(directionInfo.durationSecs / 60)} min · {(directionInfo.distanceM / 1000).toFixed(1)} km
              </div>
            )}
          </>
        )}

        {/* ── Step 3: Name & options ── */}
        {step === 3 && selectedRoute && (
          <>
            <div>
              <label className="text-xs font-medium text-slate-700 mb-1.5 block">Route name</label>
              <Input
                value={routeName}
                onChange={(e) => setRouteName(e.target.value)}
                className="h-9 text-sm"
                placeholder="e.g. 30R — Richmond Hill"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-slate-700 mb-1.5 block">Branch suffix</label>
              <Input
                value={branchSuffix}
                onChange={(e) => setBranchSuffix(e.target.value.slice(0, 2).toUpperCase())}
                className="h-9 text-sm w-20"
                placeholder="R"
                maxLength={2}
              />
              <p className="text-xs text-slate-400 mt-1">Displayed as {selectedRoute.short_name}{branchSuffix || "R"}</p>
            </div>

            <div>
              <label className="text-xs font-medium text-slate-700 mb-1.5 block">Route colour</label>
              <div className="flex gap-2 flex-wrap">
                {CUSTOM_ROUTE_COLORS.map((c) => (
                  <button
                    key={c}
                    onClick={() => setColor(c)}
                    className={`w-7 h-7 rounded-lg border-2 transition-all ${
                      color === c ? "border-slate-800 scale-110" : "border-transparent hover:scale-105"
                    }`}
                    style={{ backgroundColor: c }}
                    aria-label={`Select colour ${c}`}
                  />
                ))}
              </div>
            </div>

            <button
              onClick={() => setKeepOriginal((v) => !v)}
              className={`flex items-center gap-2.5 p-3 rounded-xl border text-sm transition-colors ${
                keepOriginal
                  ? "border-[#007A33] bg-[#007A33]/5 text-[#007A33]"
                  : "border-slate-200 bg-white text-slate-600"
              }`}
            >
              <div className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 ${
                keepOriginal ? "border-[#007A33] bg-[#007A33]" : "border-slate-300"
              }`}>
                {keepOriginal && <Check className="w-2.5 h-2.5 text-white" />}
              </div>
              <span>Keep Route {selectedRoute.short_name} running alongside</span>
            </button>
          </>
        )}

        {/* ── Step 4: Schedule ── */}
        {step === 4 && selectedRoute && (
          <>
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-100 text-xs text-slate-600">
              Route <span className="font-semibold">{selectedRoute.short_name}</span> runs ~
              <span className="font-semibold"> {parentWeeklyTrips.toLocaleString()}</span> trips/week
            </div>

            <div>
              <label className="text-xs font-medium text-slate-700 mb-1.5 block">Frequency relative to parent</label>
              <div className="flex gap-2">
                {(["quarter", "half", "same", "custom"] as FreqChip[]).map((chip) => (
                  <button
                    key={chip}
                    onClick={() => setFreqChip(chip)}
                    className={`flex-1 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
                      freqChip === chip
                        ? "bg-slate-900 text-white border-slate-900"
                        : "bg-white text-slate-600 border-slate-200 hover:border-slate-400"
                    }`}
                  >
                    {chip === "quarter" ? "¼×" : chip === "half" ? "½×" : chip === "same" ? "Same" : "Custom"}
                  </button>
                ))}
              </div>
            </div>

            {freqChip === "custom" && (
              <div>
                <label className="text-xs font-medium text-slate-700 mb-1.5 block">Headway (minutes)</label>
                <Input
                  type="number"
                  min={5}
                  max={120}
                  value={customHeadway}
                  onChange={(e) => setCustomHeadway(e.target.value)}
                  className="h-9 text-sm w-28"
                  placeholder="e.g. 20"
                />
              </div>
            )}

            <div>
              <label className="text-xs font-medium text-slate-700 mb-1.5 block">Direction</label>
              <div className="flex gap-2">
                {(["one-way", "two-way"] as const).map((d) => (
                  <button
                    key={d}
                    onClick={() => setDirection(d)}
                    className={`flex-1 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
                      direction === d
                        ? "bg-slate-900 text-white border-slate-900"
                        : "bg-white text-slate-600 border-slate-200 hover:border-slate-400"
                    }`}
                  >
                    {d === "one-way" ? "One-way" : "Two-way"}
                  </button>
                ))}
              </div>
            </div>

            <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-100 text-xs text-emerald-700">
              <span className="font-semibold">{selectedRoute.short_name}{branchSuffix}</span> will run ~
              <span className="font-semibold"> {estimatedWeeklyTrips.toLocaleString()}</span> trips/week
            </div>
          </>
        )}
      </div>

      {/* Footer nav */}
      <div className="px-4 pb-4 pt-2 border-t border-slate-100 flex gap-2">
        {step > 1 && (
          <Button
            variant="outline"
            size="sm"
            className="gap-1"
            onClick={() => setStep((s) => (s - 1) as Step)}
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back
          </Button>
        )}

        {step < 4 && step !== 1 && (
          <Button
            size="sm"
            className="flex-1 gap-1 bg-[#007A33] hover:bg-[#005f28] text-white"
            disabled={step === 2 && extensionStops.length === 0}
            onClick={() => {
              if (pinActive) { onStopPinMode(); setPinActive(false); }
              setStep((s) => (s + 1) as Step);
            }}
          >
            Next <ArrowRight className="w-3.5 h-3.5" />
          </Button>
        )}

        {step === 4 && (
          <Button
            size="sm"
            className="flex-1 gap-1 bg-[#007A33] hover:bg-[#005f28] text-white"
            disabled={saving || !routeName.trim()}
            onClick={handleSave}
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
            Save route
          </Button>
        )}
      </div>
    </div>
  );
}
