"use client";

import { useCallback, useEffect, useState, type RefObject } from "react";
import Link from "next/link";
import { Sparkles, Star, X, ArrowRight, ChevronDown } from "lucide-react";
import type { MapHandle } from "@/components/Map";
import { fetchNetworkGaps, type NetworkGap } from "@/lib/networkGaps";

const CORRIDOR_COLOR = "#f59e0b"; // amber — the on-map corridor highlight

const DEMAND_STYLE: Record<NetworkGap["demandLabel"], string> = {
  high: "bg-[color-mix(in_oklab,var(--landing-amber)_16%,transparent)] text-[var(--landing-amber)]",
  moderate: "bg-[var(--landing-wash)] text-[var(--landing-muted)]",
  light: "bg-[var(--landing-wash)] text-[var(--landing-faint)]",
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
        className="tf-map-panel tf-map-label pointer-events-auto absolute left-4 top-4 z-30 flex items-center gap-2 px-3 py-2 text-[var(--landing-ink)] transition-colors hover:bg-[var(--landing-wash)]"
      >
        <Sparkles className="h-3.5 w-3.5 text-[var(--landing-amber)]" />
        Gap Finder
        <span className="border border-[var(--landing-border-2)] px-1 py-0.5 text-[9px] tracking-[0.1em] text-[var(--landing-faint)]">
          BETA
        </span>
      </button>
    );
  }

  return (
    <div className="tf-map-panel pointer-events-auto absolute bottom-4 left-4 top-20 z-30 flex w-80 max-w-[calc(100vw-2rem)] flex-col overflow-hidden">
      {/* header */}
      <div className="flex items-center gap-2 border-b border-[var(--landing-border)] px-4 py-3">
        <Sparkles className="h-4 w-4 shrink-0 text-[var(--landing-amber)]" />
        <div className="min-w-0 flex-1">
          <p className="font-[family-name:var(--font-hanken)] text-sm font-medium text-[var(--landing-ink)]">
            Gap Finder
          </p>
          <p className="text-[11px] text-[var(--landing-faint)]">
            Corridors GO serves worst, ranked
          </p>
        </div>
        <span className="border border-[var(--landing-border-2)] px-1 py-0.5 text-[10px] tracking-[0.1em] text-[var(--landing-faint)]">
          BETA
        </span>
        <button
          onClick={closePanel}
          aria-label="Close Gap Finder"
          className="-mr-1 p-1 text-[var(--landing-faint)] transition-colors hover:bg-[var(--landing-wash)] hover:text-[var(--landing-ink)]"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* list */}
      <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
        {error && (
          <p className="px-3 py-6 text-center text-sm text-[var(--landing-faint)]">
            Couldn&apos;t load the corridor list.
          </p>
        )}
        {!error && !gaps && (
          <p className="px-3 py-6 text-center text-sm text-[var(--landing-faint)]">
            Loading…
          </p>
        )}
        {gaps?.map((gap, i) => {
          const isSel = gap.id === selectedId;
          return (
            <div key={gap.id}>
              <button
                onClick={() => selectGap(gap)}
                className={`flex w-full items-start gap-2.5 px-3 py-2.5 text-left transition-colors ${
                  isSel ? "bg-[var(--landing-wash)]" : "hover:bg-[var(--landing-wash)]"
                }`}
              >
                <span className="mt-0.5 w-4 shrink-0 text-center font-[family-name:var(--landing-mono)] text-[11px] tabular-nums text-[var(--landing-faint)]">
                  {i + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    {gap.priority && (
                      <Star
                        className="h-3 w-3 shrink-0 fill-[var(--landing-amber)] text-[var(--landing-amber)]"
                        aria-label="Priority corridor"
                      />
                    )}
                    <span className="truncate text-[13px] font-semibold text-[var(--landing-ink)]">
                      {gap.headline}
                    </span>
                    <span
                      className={`shrink-0 px-1.5 text-[10px] font-medium ${DEMAND_STYLE[gap.demandLabel]}`}
                    >
                      {gap.demandLabel}
                    </span>
                  </span>
                  <span className="mt-0.5 block text-[11.5px] leading-snug text-[var(--landing-muted)]">
                    {compactStat(gap)}
                  </span>
                </span>
                <ChevronDown
                  className={`mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--landing-faint)] transition-transform ${
                    isSel ? "rotate-180" : ""
                  }`}
                />
              </button>

              {isSel && (
                <div className="mb-1 ml-9 mr-3 flex items-center justify-between gap-2 bg-[var(--landing-wash)] px-3 py-2">
                  <span className="text-[11px] text-[var(--landing-muted)]">
                    Drawn on the map
                  </span>
                  <button
                    onClick={() => handleDesign(gap)}
                    className="inline-flex shrink-0 items-center gap-1 bg-[var(--landing-accent)] px-2.5 py-1 font-[family-name:var(--landing-mono)] text-[10px] uppercase tracking-[0.06em] font-semibold text-white transition-opacity hover:opacity-90"
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

      <div className="border-t border-[var(--landing-border)] px-4 py-2 text-[10.5px] leading-snug text-[var(--landing-faint)]">
        Phase&nbsp;1 estimate — fastest scheduled path vs a straight line. Not yet
        time-of-day aware.{" "}
        <Link
          href="/blog/gap-finder"
          target="_blank"
          className="font-medium text-[var(--landing-accent)] underline-offset-2 hover:underline"
        >
          How it works →
        </Link>
      </div>
    </div>
  );
}
