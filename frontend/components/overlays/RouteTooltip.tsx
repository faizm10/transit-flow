"use client";

import { Train, Bus } from "lucide-react";
import { GO_RAIL_LINES } from "@/lib/routeColors";

interface RouteTooltipProps {
  shortName: string | null;
  variantLabel?: string;
}

export default function RouteTooltip({ shortName, variantLabel }: RouteTooltipProps) {
  if (!shortName) return null;

  const lineInfo = GO_RAIL_LINES[shortName];
  const isRail = !!lineInfo;

  return (
    <div className="absolute top-4 right-4 z-30 pointer-events-none">
      <div className="bg-white/95 backdrop-blur-xl rounded-xl border border-slate-100 shadow-lg px-3.5 py-2.5 flex items-center gap-2.5 animate-in fade-in slide-in-from-right-2">
        <div
          className="w-8 h-8 rounded-lg flex-shrink-0 flex items-center justify-center text-white text-xs font-bold"
          style={{ backgroundColor: lineInfo?.color ?? "#0066CC" }}
        >
          {isRail ? (
            <Train className="w-4 h-4" />
          ) : (
            <Bus className="w-4 h-4" />
          )}
        </div>
        <div>
          <p className="text-sm font-semibold text-slate-900">
            {lineInfo?.name ?? `Route ${shortName}`}
          </p>
          {variantLabel && (
            <p className="text-xs text-slate-400 truncate max-w-48">{variantLabel}</p>
          )}
          <p className="text-[10px] text-slate-400 mt-0.5">Click to explore this route</p>
        </div>
      </div>
    </div>
  );
}
