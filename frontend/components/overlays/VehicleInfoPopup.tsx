"use client";

import { X, Train, Bus, MapPin, Clock, ArrowRight, Gauge } from "lucide-react";
import { SimTrip } from "@/lib/simulation";
import { formatSimTime } from "@/lib/simulation";
import { GO_RAIL_LINES } from "@/lib/routeColors";

interface VehicleInfoPopupProps {
  trip: SimTrip;
  currentTime: number;
  onClose: () => void;
}

function ProgressBar({ value, color }: { value: number; color: string }) {
  return (
    <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
      <div
        className="h-full rounded-full transition-all duration-500"
        style={{ width: `${Math.round(value * 100)}%`, backgroundColor: color }}
      />
    </div>
  );
}

function secsToMinLabel(s: number): string {
  if (s < 60) return "< 1 min";
  return `${Math.round(s / 60)} min`;
}

export default function VehicleInfoPopup({
  trip,
  currentTime,
  onClose,
}: VehicleInfoPopupProps) {
  const lineInfo = GO_RAIL_LINES[trip.route_short_name];
  const color = trip.color;
  const isRail = trip.route_type === 2;

  // Find next upcoming stop
  const nextStop = trip.stops.find((s) => s.t > currentTime);
  const prevStop = [...trip.stops].reverse().find((s) => s.t <= currentTime);

  // Overall trip progress
  const tripDur = trip.arriveSec - trip.departSec;
  const progress = tripDur > 0
    ? Math.max(0, Math.min(1, (currentTime - trip.departSec) / tripDur))
    : 0;

  // Time to destination
  const secsToDestination = Math.max(0, trip.arriveSec - currentTime);

  return (
    <div className="absolute top-20 right-4 z-30 w-72 animate-in fade-in slide-in-from-right-3 duration-200">
      <div className="bg-white/97 backdrop-blur-xl rounded-2xl border border-slate-200 shadow-xl overflow-hidden">
        {/* Color header */}
        <div className="h-1.5 w-full" style={{ backgroundColor: color }} />

        <div className="p-4">
          {/* Header */}
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center gap-2.5">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center text-white flex-shrink-0"
                style={{ backgroundColor: color }}
              >
                {isRail ? <Train className="w-5 h-5" /> : <Bus className="w-5 h-5" />}
              </div>
              <div>
                <p className="font-semibold text-slate-900 text-sm leading-tight">
                  {lineInfo?.name ?? `Route ${trip.route_short_name}`}
                </p>
                <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-1">
                  <span
                    className="inline-block w-2 h-2 rounded-full animate-pulse"
                    style={{ backgroundColor: color }}
                  />
                  In service
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-slate-300 hover:text-slate-500 transition-colors p-1 -mt-0.5 -mr-0.5"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Destination */}
          <div className="flex items-center gap-2 bg-slate-50 rounded-xl px-3 py-2.5 mb-3">
            <MapPin className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-[10px] text-slate-400 uppercase tracking-wide font-medium">Towards</p>
              <p className="text-sm font-semibold text-slate-900 truncate">{trip.end_stop_name}</p>
            </div>
          </div>

          {/* Trip progress bar */}
          <div className="mb-3">
            <ProgressBar value={progress} color={color} />
            <div className="flex justify-between mt-1.5 text-[10px] text-slate-400">
              <span>{trip.start_stop_name}</span>
              <span>{trip.end_stop_name}</span>
            </div>
          </div>

          {/* Timing grid */}
          <div className="grid grid-cols-2 gap-2 mb-3">
            <div className="bg-slate-50 rounded-xl px-3 py-2">
              <p className="text-[10px] text-slate-400 uppercase tracking-wide font-medium mb-0.5">Departed</p>
              <p className="text-sm font-semibold text-slate-900 tabular-nums">{trip.start_time}</p>
            </div>
            <div className="bg-slate-50 rounded-xl px-3 py-2">
              <p className="text-[10px] text-slate-400 uppercase tracking-wide font-medium mb-0.5">Arrives</p>
              <p className="text-sm font-semibold text-slate-900 tabular-nums">{trip.end_time}</p>
            </div>
          </div>

          {/* Next stop */}
          {nextStop && (
            <div
              className="rounded-xl px-3 py-2.5 flex items-center gap-2.5"
              style={{ backgroundColor: color + "15" }}
            >
              <Clock className="w-3.5 h-3.5 flex-shrink-0" style={{ color }} />
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-medium uppercase tracking-wide" style={{ color }}>
                  Next stop
                </p>
                <p className="text-sm font-semibold text-slate-900 truncate">
                  {nextStop.stop_name ?? "—"}
                </p>
              </div>
              <div className="text-right flex-shrink-0">
                <p className="text-xs font-semibold tabular-nums" style={{ color }}>
                  {secsToMinLabel(nextStop.t - currentTime)}
                </p>
                <p className="text-[10px] text-slate-400 tabular-nums">{formatSimTime(nextStop.t)}</p>
              </div>
            </div>
          )}

          {/* ETA to destination */}
          {secsToDestination > 0 && (
            <p className="text-center text-xs text-slate-400 mt-2.5">
              <span className="font-medium text-slate-600">{secsToMinLabel(secsToDestination)}</span>
              {" "}to destination · arrives {trip.end_time}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
