"use client";

import { useCallback, useEffect, useState, type RefObject } from "react";
import Link from "next/link";
import { Sparkles, Star, X, ArrowRight, ChevronDown } from "lucide-react";
import type { MapHandle } from "@/components/Map";
import { fetchNetworkGaps, type NetworkGap } from "@/lib/networkGaps";

const CORRIDOR_COLOR = "#f59e0b"; // amber

const DEMAND_STYLE: Record<NetworkGap["demandLabel"], string> = {
  high: "bg-amber-100 text-amber-800",
  moderate: "bg-slate-100 text-slate-600",
  light: "bg-slate-100 text-slate-500",
};

function mins(m: number): string {
  return m >= 60 ? `${Math.floor(m / 60)}h${String(m % 60).padStart(2, "0")}` : `${m}m`;
}

function compactStat(gap: NetworkGap): string {
  const direct = `~${mins(gap.freeFlowMin)} if direct`;
  if (!gap.current.reachable) return `no route today · ${direct}`;
  const t = gap.current.transfers;
  return `${mins(gap.current.minutes)} now · ${direct} · ${t} transfer${t !== 1 ? "s" : ""}`;
}

interface GapFinderBetaProps {
  mapRef: RefObject<MapHandle | null>;
  mapLoaded: boolean;
  /** Hand off to the route builder with this corridor as the starting point. */
  onDesignRoute: (gap: NetworkGap) => void;
  /** Fires when the panel opens/closes so the page can clear other panels. */
  onOpenChange?: (open: boolean) => void;
  /** Hidden while the user is drawing so it doesn't fight the draw guide. */
  hidden?: boolean;
}

export default function GapFinderBeta({
  mapRef,
  mapLoaded,
  onDesignRoute,
  onOpenChange,
  hidden,
}: GapFinderBetaProps) {
  const [open, setOpen] = useState(false);
  const [gaps, setGaps] = useState<NetworkGap[] | null>(null);
  const [error, setError] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    if (!open || gaps || error) return;
    const ctrl = new AbortController();
    fetchNetworkGaps(ctrl.signal)
      .then((f) => setGaps(f.gaps))
      .catch(() => {
        if (!ctrl.signal.aborted) setError(true);
      });
    return () => ctrl.abort();
  }, [open, gaps, error]);

  const drawCorridor = useCallback(
    (gap: NetworkGap) => {
      const map = mapRef.current;
      if (!map) return;
      map.showPreviewRoute(
        [
          [gap.from.lon, gap.from.lat],
          [gap.to.lon, gap.to.lat],
        ],
        CORRIDOR_COLOR
      );
      const lons = [gap.from.lon, gap.to.lon];
      const lats = [gap.from.lat, gap.to.lat];
      map.getMap()?.fitBounds(
        [
          [Math.min(...lons), Math.min(...lats)],
          [Math.max(...lons), Math.max(...lats)],
        ],
        { padding: 150, maxZoom: 11, duration: 800 }
      );
    },
    [mapRef]
  );

  const clearCorridor = useCallback(() => {
    mapRef.current?.clearPreviewRoute();
    setSelectedId(null);
  }, [mapRef]);

  const selectGap = useCallback(
    (gap: NetworkGap) => {
      if (selectedId === gap.id) {
        clearCorridor();
        return;
      }
      setSelectedId(gap.id);
      drawCorridor(gap);
    },
    [selectedId, clearCorridor, drawCorridor]
  );

  const openPanel = useCallback(() => {
    setOpen(true);
    onOpenChange?.(true);
  }, [onOpenChange]);

  const handleDesign = useCallback(
    (gap: NetworkGap) => {
      onDesignRoute(gap);
      setOpen(false);
      onOpenChange?.(false);
      // leave the corridor line up as a reference for the builder
    },
    [onDesignRoute, onOpenChange]
  );

  const closePanel = useCallback(() => {
    setOpen(false);
    onOpenChange?.(false);
    clearCorridor();
  }, [onOpenChange, clearCorridor]);

  if (!mapLoaded || hidden) return null;

  if (!open) {
    return (
      <button
        onClick={openPanel}
        className="pointer-events-auto absolute left-4 top-4 z-30 flex items-center gap-2 rounded-xl border border-slate-200 bg-white/95 px-3 py-2 text-xs font-semibold text-slate-700 shadow-lg backdrop-blur-xl transition-colors hover:bg-white"
      >
        <Sparkles className="h-3.5 w-3.5 text-amber-500" />
        Gap Finder
        <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold tracking-wide text-amber-800">
          BETA
        </span>
      </button>
    );
  }

  return (
    <div className="pointer-events-auto absolute bottom-4 left-4 top-20 z-30 flex w-80 max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white/97 shadow-xl backdrop-blur-xl">
      {/* header */}
      <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-3">
        <Sparkles className="h-4 w-4 shrink-0 text-amber-500" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-slate-900">Gap Finder</p>
          <p className="text-[11px] text-slate-400">Corridors GO serves worst, ranked</p>
        </div>
        <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-amber-800">
          BETA
        </span>
        <button
          onClick={closePanel}
          aria-label="Close Gap Finder"
          className="-mr-1 rounded-lg p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* list */}
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {error && (
          <p className="px-3 py-6 text-center text-sm text-slate-400">
            Couldn&apos;t load the corridor list.
          </p>
        )}
        {!error && !gaps && (
          <p className="px-3 py-6 text-center text-sm text-slate-400">Loading…</p>
        )}
        {gaps?.map((gap, i) => {
          const isSel = gap.id === selectedId;
          return (
            <div key={gap.id}>
              <button
                onClick={() => selectGap(gap)}
                className={`flex w-full items-start gap-2.5 rounded-xl px-3 py-2.5 text-left transition-colors ${
                  isSel ? "bg-amber-50" : "hover:bg-slate-50"
                }`}
              >
                <span className="mt-0.5 w-4 shrink-0 text-center text-[11px] font-semibold tabular-nums text-slate-300">
                  {i + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    {gap.priority && (
                      <Star
                        className="h-3 w-3 shrink-0 fill-amber-400 text-amber-400"
                        aria-label="Priority corridor"
                      />
                    )}
                    <span className="truncate text-[13px] font-semibold text-slate-900">
                      {gap.headline}
                    </span>
                    <span
                      className={`shrink-0 rounded-full px-1.5 text-[10px] font-medium ${DEMAND_STYLE[gap.demandLabel]}`}
                    >
                      {gap.demandLabel}
                    </span>
                  </span>
                  <span className="mt-0.5 block text-[11.5px] leading-snug text-slate-500">
                    {compactStat(gap)}
                  </span>
                </span>
                <ChevronDown
                  className={`mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-300 transition-transform ${
                    isSel ? "rotate-180" : ""
                  }`}
                />
              </button>

              {isSel && (
                <div className="mb-1 ml-9 mr-3 flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2">
                  <span className="text-[11px] text-slate-500">
                    Drawn on the map
                  </span>
                  <button
                    onClick={() => handleDesign(gap)}
                    className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-[#155ba0] px-2.5 py-1 text-[11px] font-semibold text-white transition-colors hover:bg-[#124f8c]"
                  >
                    Design this route
                    <ArrowRight className="h-3 w-3" />
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="border-t border-slate-100 px-4 py-2 text-[10.5px] leading-snug text-slate-400">
        Phase&nbsp;1 estimate — fastest scheduled path vs a straight line. Not yet
        time-of-day aware.{" "}
        <Link
          href="/blog/gap-finder"
          target="_blank"
          className="font-medium text-[#007A33] underline-offset-2 hover:underline"
        >
          How it works →
        </Link>
      </div>
    </div>
  );
}
