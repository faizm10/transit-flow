"use client";

import { useState, useCallback } from "react";
import {
  Train, Bus, Pencil, ArrowRight, ArrowLeft, Check,
  Plus, X, GripVertical, MapPin, Clock, Repeat,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { CustomRoute, CustomStop, CustomSchedule } from "@/lib/gtfs";
import { CUSTOM_ROUTE_COLORS, GO_RAIL_LINES } from "@/lib/routeColors";
import { v4 as uuidv4 } from "uuid";

type Step = "type" | "name" | "stops" | "schedule" | "review";

interface BuilderWizardProps {
  onSave: (route: CustomRoute) => void;
  onDrawRequest: () => void;
  onCancel: () => void;
  drawGeometry?: [number, number][];
  existingRoute?: CustomRoute;
}

const ROUTE_TYPE_OPTIONS = [
  {
    type: "bus" as const,
    icon: Bus,
    label: "New bus route",
    description: "Create a bus service along roads",
    color: "border-blue-200 bg-blue-50",
  },
  {
    type: "train" as const,
    icon: Train,
    label: "New train line",
    description: "Design a rail corridor or extension",
    color: "border-emerald-200 bg-emerald-50",
  },
];

const FREQUENCY_PRESETS = [
  { label: "Every 10 min", interval: 10 },
  { label: "Every 15 min", interval: 15 },
  { label: "Every 30 min", interval: 30 },
  { label: "Every hour", interval: 60 },
];

export default function BuilderWizard({
  onSave,
  onDrawRequest,
  onCancel,
  drawGeometry,
  existingRoute,
}: BuilderWizardProps) {
  const [step, setStep] = useState<Step>(existingRoute ? "review" : "type");
  const [routeType, setRouteType] = useState<"bus" | "train">(
    existingRoute?.type ?? "bus"
  );
  const [name, setName] = useState(existingRoute?.name ?? "");
  const [description, setDescription] = useState(existingRoute?.description ?? "");
  const [color, setColor] = useState(existingRoute?.color ?? CUSTOM_ROUTE_COLORS[0]);
  const [stops, setStops] = useState<CustomStop[]>(existingRoute?.stops ?? []);
  const [stopQuery, setStopQuery] = useState("");
  const [stopResults, setStopResults] = useState<CustomStop[]>([]);
  const [searching, setSearching] = useState(false);
  const [scheduleType, setScheduleType] = useState<"frequency" | "fixed">(
    existingRoute?.schedule?.type ?? "frequency"
  );
  const [frequencyInterval, setFrequencyInterval] = useState(15);
  const [fixedDepartures, setFixedDepartures] = useState<string[]>(
    existingRoute?.schedule?.fixedDepartures ?? []
  );
  const [newDeparture, setNewDeparture] = useState("");

  // ── Stop search ──────────────────────────────────────────────────────────
  const searchStops = useCallback(async (q: string) => {
    if (q.length < 2) { setStopResults([]); return; }
    setSearching(true);
    try {
      const res = await fetch(`/api/stops?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      setStopResults(
        (data.stops ?? []).map((s: { stop_id: string; stop_name: string; lat: number; lon: number }) => ({
          id: s.stop_id,
          name: s.stop_name,
          lat: s.lat,
          lon: s.lon,
          sequence: stops.length + 1,
        }))
      );
    } catch {
      setStopResults([]);
    } finally {
      setSearching(false);
    }
  }, [stops.length]);

  function addStop(s: CustomStop) {
    setStops((prev) => [...prev, { ...s, sequence: prev.length + 1 }]);
    setStopQuery("");
    setStopResults([]);
  }

  function removeStop(id: string) {
    setStops((prev) =>
      prev.filter((s) => s.id !== id).map((s, i) => ({ ...s, sequence: i + 1 }))
    );
  }

  function buildSchedule(): CustomSchedule {
    if (scheduleType === "fixed") {
      return { type: "fixed", fixedDepartures, direction: "two-way" };
    }
    return {
      type: "frequency",
      frequency: {
        weekday: { start: "06:00", end: "23:00", interval: frequencyInterval },
        weekend: { start: "07:00", end: "22:00", interval: frequencyInterval * 2 },
      },
      direction: "two-way",
    };
  }

  function handleSave() {
    const route: CustomRoute = {
      id: existingRoute?.id ?? uuidv4(),
      name: name || `${routeType === "train" ? "Train" : "Bus"} Route`,
      color,
      type: routeType,
      description: description || undefined,
      stops,
      geometry: drawGeometry,
      schedule: buildSchedule(),
      createdAt: existingRoute?.createdAt ?? new Date().toISOString(),
    };
    onSave(route);
  }

  // ── Step renderer ────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 pt-4 pb-3 border-b border-slate-100 flex items-center justify-between">
        <div>
          <h2 className="font-semibold text-slate-900 text-base">Design a route</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Step {["type","name","stops","schedule","review"].indexOf(step) + 1} of 5
          </p>
        </div>
        <button onClick={onCancel} className="text-slate-400 hover:text-slate-600 transition-colors">
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Progress bar */}
      <div className="h-1 bg-slate-100">
        <div
          className="h-full bg-[#007A33] transition-all duration-300"
          style={{
            width: `${(["type","name","stops","schedule","review"].indexOf(step) + 1) * 20}%`,
          }}
        />
      </div>

      {/* Step content */}
      <div className="flex-1 overflow-y-auto px-4 py-4">

        {/* Step 1: Route type */}
        {step === "type" && (
          <div className="flex flex-col gap-3">
            <p className="text-sm font-medium text-slate-700 mb-1">What are you building?</p>
            {ROUTE_TYPE_OPTIONS.map(({ type, icon: Icon, label, description, color: c }) => (
              <button
                key={type}
                className={`w-full flex items-center gap-3 rounded-xl border-2 p-4 text-left transition-all ${
                  routeType === type
                    ? `${c} border-current`
                    : "border-slate-100 bg-white hover:border-slate-200"
                }`}
                onClick={() => { setRouteType(type); setStep("name"); }}
              >
                <div className={`w-10 h-10 rounded-xl ${c} flex items-center justify-center`}>
                  <Icon className="w-5 h-5" />
                </div>
                <div>
                  <p className="font-semibold text-slate-900">{label}</p>
                  <p className="text-sm text-slate-500">{description}</p>
                </div>
                <ArrowRight className="ml-auto w-4 h-4 text-slate-300" />
              </button>
            ))}
          </div>
        )}

        {/* Step 2: Name & style */}
        {step === "name" && (
          <div className="flex flex-col gap-4">
            <div>
              <Label className="text-sm font-medium text-slate-700 mb-1.5 block">
                What should we call it?
              </Label>
              <Input
                placeholder={routeType === "train" ? "e.g. East Bayfront Rail" : "e.g. Airport Express"}
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="rounded-xl h-11"
                autoFocus
              />
            </div>

            <div>
              <Label className="text-sm font-medium text-slate-700 mb-1.5 block">
                Pick a colour
              </Label>
              <div className="flex gap-2 flex-wrap">
                {CUSTOM_ROUTE_COLORS.map((c) => (
                  <button
                    key={c}
                    className={`w-8 h-8 rounded-full transition-transform ${
                      color === c ? "scale-125 ring-2 ring-offset-2 ring-slate-400" : "hover:scale-110"
                    }`}
                    style={{ backgroundColor: c }}
                    onClick={() => setColor(c)}
                  />
                ))}
              </div>
            </div>

            <div>
              <Label className="text-sm font-medium text-slate-700 mb-1.5 block">
                Short description <span className="text-slate-400 font-normal">(optional)</span>
              </Label>
              <Input
                placeholder="e.g. Connects downtown to the waterfront"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="rounded-xl h-11"
              />
            </div>
          </div>
        )}

        {/* Step 3: Add stops */}
        {step === "stops" && (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-slate-500">
              Search for stations, or draw the route directly on the map.
            </p>

            {/* Stop search */}
            <div className="relative">
              <Input
                placeholder="Search for a station…"
                value={stopQuery}
                onChange={(e) => {
                  setStopQuery(e.target.value);
                  searchStops(e.target.value);
                }}
                className="rounded-xl h-10 pr-8"
              />
              {searching && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2 w-3 h-3 border-2 border-slate-300 border-t-transparent rounded-full animate-spin" />
              )}
            </div>

            {/* Search results dropdown */}
            {stopResults.length > 0 && (
              <div className="rounded-xl border border-slate-100 shadow-sm bg-white overflow-hidden">
                {stopResults.map((s) => (
                  <button
                    key={s.id}
                    className="w-full flex items-center gap-2 px-3 py-2.5 text-sm hover:bg-slate-50 text-left border-b border-slate-50 last:border-0"
                    onClick={() => addStop(s)}
                  >
                    <MapPin className="w-4 h-4 text-slate-400 flex-shrink-0" />
                    {s.name}
                    <Plus className="ml-auto w-4 h-4 text-slate-300" />
                  </button>
                ))}
              </div>
            )}

            {/* Draw on map button */}
            <button
              className="flex items-center gap-2 text-sm text-[#007A33] font-medium py-2 px-3 rounded-xl border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 transition-colors"
              onClick={onDrawRequest}
            >
              <Pencil className="w-4 h-4" />
              Draw route on map
            </button>

            {drawGeometry && (
              <div className="flex items-center gap-2 text-xs text-emerald-700 bg-emerald-50 rounded-lg px-3 py-2">
                <Check className="w-3.5 h-3.5" />
                Route drawn — {drawGeometry.length} points
              </div>
            )}

            {/* Stop list */}
            {stops.length === 0 ? (
              <div className="flex flex-col items-center py-8 text-slate-400">
                <MapPin className="w-8 h-8 mb-2 opacity-40" />
                <p className="text-sm font-medium">No stops added yet</p>
                <p className="text-xs mt-1">Search above or draw on the map</p>
              </div>
            ) : (
              <div className="flex flex-col gap-1">
                <p className="text-xs font-medium text-slate-500 mb-1">{stops.length} stops</p>
                {stops.map((s, i) => (
                  <div
                    key={s.id}
                    className="flex items-center gap-2 py-2 px-2 rounded-lg hover:bg-slate-50"
                  >
                    <GripVertical className="w-4 h-4 text-slate-300 cursor-grab" />
                    <div
                      className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0"
                      style={{ backgroundColor: color }}
                    >
                      {i + 1}
                    </div>
                    <span className="text-sm text-slate-700 flex-1 truncate">{s.name}</span>
                    <button onClick={() => removeStop(s.id)} className="text-slate-300 hover:text-red-400 transition-colors">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Step 4: Schedule */}
        {step === "schedule" && (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-slate-500">How often should this route run?</p>

            {/* Type toggle */}
            <div className="grid grid-cols-2 gap-2">
              {(["frequency", "fixed"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setScheduleType(t)}
                  className={`flex items-center gap-2 rounded-xl border p-3 text-sm font-medium transition-all ${
                    scheduleType === t
                      ? "border-[#007A33] bg-emerald-50 text-[#007A33]"
                      : "border-slate-100 text-slate-600 hover:border-slate-200"
                  }`}
                >
                  {t === "frequency" ? (
                    <><Repeat className="w-4 h-4" /> Frequency</>
                  ) : (
                    <><Clock className="w-4 h-4" /> Fixed times</>
                  )}
                </button>
              ))}
            </div>

            {scheduleType === "frequency" && (
              <div>
                <Label className="text-sm font-medium text-slate-700 mb-2 block">Service frequency</Label>
                <div className="grid grid-cols-2 gap-2">
                  {FREQUENCY_PRESETS.map(({ label, interval }) => (
                    <button
                      key={interval}
                      onClick={() => setFrequencyInterval(interval)}
                      className={`rounded-xl border p-3 text-sm font-medium transition-all ${
                        frequencyInterval === interval
                          ? "border-[#007A33] bg-emerald-50 text-[#007A33]"
                          : "border-slate-100 hover:border-slate-200 text-slate-700"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-slate-400 mt-2">
                  Weekdays 6 AM – 11 PM · Weekends every {frequencyInterval * 2} min
                </p>
              </div>
            )}

            {scheduleType === "fixed" && (
              <div>
                <Label className="text-sm font-medium text-slate-700 mb-2 block">
                  Departure times
                </Label>
                <div className="flex gap-2">
                  <Input
                    type="time"
                    value={newDeparture}
                    onChange={(e) => setNewDeparture(e.target.value)}
                    className="rounded-xl h-9 flex-1"
                  />
                  <Button
                    size="sm"
                    className="rounded-xl bg-[#007A33] text-white"
                    onClick={() => {
                      if (newDeparture && !fixedDepartures.includes(newDeparture)) {
                        setFixedDepartures((prev) => [...prev, newDeparture].sort());
                        setNewDeparture("");
                      }
                    }}
                  >
                    Add
                  </Button>
                </div>
                {fixedDepartures.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {fixedDepartures.map((t) => (
                      <Badge key={t} variant="secondary" className="gap-1 pr-1">
                        {t}
                        <button
                          onClick={() => setFixedDepartures((p) => p.filter((d) => d !== t))}
                          className="ml-0.5 hover:text-red-500"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Step 5: Review */}
        {step === "review" && (
          <div className="flex flex-col gap-4">
            <div className="rounded-xl border border-slate-100 overflow-hidden">
              {/* Route preview header */}
              <div
                className="flex items-center gap-3 px-4 py-3"
                style={{ backgroundColor: color + "20" }}
              >
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center text-white"
                  style={{ backgroundColor: color }}
                >
                  {routeType === "train" ? (
                    <Train className="w-5 h-5" />
                  ) : (
                    <Bus className="w-5 h-5" />
                  )}
                </div>
                <div>
                  <p className="font-semibold text-slate-900">{name || "Unnamed route"}</p>
                  {description && <p className="text-xs text-slate-500">{description}</p>}
                </div>
              </div>

              {/* Summary */}
              <div className="px-4 py-3 flex flex-col gap-2 text-sm">
                <div className="flex justify-between text-slate-600">
                  <span className="text-slate-400">Stops</span>
                  <span className="font-medium">{stops.length}</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span className="text-slate-400">Schedule</span>
                  <span className="font-medium">
                    {scheduleType === "frequency"
                      ? `Every ${frequencyInterval} min`
                      : `${fixedDepartures.length} departures`}
                  </span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span className="text-slate-400">Route drawn</span>
                  <span className="font-medium">{drawGeometry ? "Yes" : "No"}</span>
                </div>
              </div>
            </div>

            {stops.length > 0 && (
              <div>
                <p className="text-xs font-medium text-slate-500 mb-1.5">Stop sequence</p>
                <div className="flex flex-col">
                  {stops.map((s, i) => (
                    <div key={s.id} className="flex items-center gap-2 py-1">
                      <div className="flex flex-col items-center">
                        <div
                          className="w-4 h-4 rounded-full border-2 border-white shadow-sm"
                          style={{ backgroundColor: color }}
                        />
                        {i < stops.length - 1 && (
                          <div className="w-0.5 h-4 bg-slate-200" />
                        )}
                      </div>
                      <span className="text-sm text-slate-700">{s.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer navigation */}
      <div className="px-4 pb-4 pt-3 border-t border-slate-100 flex gap-2">
        {step !== "type" && (
          <Button
            variant="outline"
            className="rounded-xl flex-1"
            onClick={() => {
              const steps: Step[] = ["type", "name", "stops", "schedule", "review"];
              const i = steps.indexOf(step);
              if (i > 0) setStep(steps[i - 1]);
            }}
          >
            <ArrowLeft className="w-4 h-4 mr-1" /> Back
          </Button>
        )}

        {step !== "review" ? (
          <Button
            className="rounded-xl flex-1 bg-[#007A33] hover:bg-[#005f28] text-white"
            onClick={() => {
              const steps: Step[] = ["type", "name", "stops", "schedule", "review"];
              const i = steps.indexOf(step);
              if (i < steps.length - 1) setStep(steps[i + 1]);
            }}
          >
            Next <ArrowRight className="w-4 h-4 ml-1" />
          </Button>
        ) : (
          <Button
            className="rounded-xl flex-1 bg-[#007A33] hover:bg-[#005f28] text-white"
            onClick={handleSave}
          >
            <Check className="w-4 h-4 mr-1" /> Save route
          </Button>
        )}
      </div>
    </div>
  );
}
