"use client";

import { Train, Bus } from "lucide-react";
import { colorForRoute, GO_RAIL_LINES } from "@/lib/routeColors";

interface RouteTooltipProps {
  shortName: string | null;
  variantLabel?: string;
}

export default function RouteTooltip({ shortName, variantLabel }: RouteTooltipProps) {
  if (!shortName) return null;

  const lineInfo = GO_RAIL_LINES[shortName];
  const isRail = !!lineInfo;
  const color = lineInfo?.color ?? colorForRoute(shortName);

  return (
    <div className="absolute top-4 right-4 z-30 pointer-events-none">
      <div className="tf-map-panel px-3.5 py-2.5 flex items-center gap-2.5 animate-in fade-in slide-in-from-right-2">
        <div
          className="w-8 h-8 flex-shrink-0 flex items-center justify-center text-white text-xs font-bold"
          style={{ backgroundColor: color }}
        >
          {isRail ? (
            <Train className="w-4 h-4" />
          ) : (
            <Bus className="w-4 h-4" />
          )}
        </div>
        <div>
          <p className="font-[family-name:var(--font-hanken)] text-sm font-medium text-[var(--landing-ink)]">
            {lineInfo?.name ?? `Route ${shortName}`}
          </p>
          {variantLabel && (
            <p className="text-xs text-[var(--landing-faint)] truncate max-w-48">{variantLabel}</p>
          )}
          <p className="font-[family-name:var(--landing-mono)] text-[10px] uppercase tracking-[0.05em] text-[var(--landing-faint)] mt-0.5">
            Click to explore this route
          </p>
        </div>
      </div>
    </div>
  );
}
