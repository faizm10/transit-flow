"use client";

import { useEffect, useState, type RefObject } from "react";
import { Train } from "lucide-react";
import type { MapHandle } from "@/components/Map";

interface OpenRailwayMapOverlayControlsProps {
  mapLoaded: boolean;
  isTrainDesignMode: boolean;
  isDrawing: boolean;
  mapRef: RefObject<MapHandle | null>;
}

/** Floating toggle for the OpenRailwayMap tile layer. Parent should only mount when the overlay feature is on. */
export default function OpenRailwayMapOverlayControls({
  mapLoaded,
  isTrainDesignMode,
  isDrawing,
  mapRef,
}: OpenRailwayMapOverlayControlsProps) {
  const [railMapVisible, setRailMapVisible] = useState(true);

  useEffect(() => {
    if (!mapLoaded) return;
    mapRef.current?.setRailMapVisible(isTrainDesignMode && railMapVisible);
  }, [mapLoaded, isTrainDesignMode, railMapVisible, mapRef]);

  if (!isTrainDesignMode || isDrawing) return null;

  return (
    <div className="absolute right-4 top-24 z-20 flex flex-col items-end gap-2">
      <button
        type="button"
        onClick={() => setRailMapVisible((visible) => !visible)}
        className={`pointer-events-auto flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold shadow-md backdrop-blur-xl transition-colors ${
          railMapVisible
            ? "border-[var(--landing-border-2)] bg-[var(--landing-wash)]/95 text-[var(--landing-accent)]"
            : "border-[var(--landing-border-2)] bg-[var(--landing-elevated)] text-[var(--landing-muted)] hover:bg-[var(--landing-wash)]"
        }`}
      >
        <Train className="h-3.5 w-3.5" />
        Rail map
      </button>
      <div className="max-w-56 rounded-lg border border-[var(--landing-border-2)] bg-[var(--landing-elevated)] px-2.5 py-1.5 text-[10px] leading-snug text-[var(--landing-muted)] shadow-sm backdrop-blur-md">
        Rail routing data © OpenStreetMap contributors, ODbL
      </div>
    </div>
  );
}
