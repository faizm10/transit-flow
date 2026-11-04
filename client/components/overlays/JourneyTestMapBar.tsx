"use client";

import { ArrowLeft, MapPin, X } from "lucide-react";

interface JourneyTestMapBarProps {
  /** "picking": waiting for a map click. "map": showing compared journeys. */
  view: "picking" | "map";
  routeName: string;
  routeColor: string;
  onBack: () => void;
  onClose: () => void;
}

/**
 * Floating bar shown while the "Test this route" modal is hidden so the user
 * can use the map: either to click a place, or to read the drawn journeys.
 */
export default function JourneyTestMapBar({ view, routeName, routeColor, onBack, onClose }: JourneyTestMapBarProps) {
  return (
    <div
      role="status"
      className="fixed left-1/2 top-4 z-40 flex max-w-[calc(100%-2rem)] max-md:top-14 -translate-x-1/2 items-center gap-3 rounded-xl border border-[var(--landing-border)] bg-[var(--landing-elevated)] px-3 py-2 text-xs shadow-lg"
    >
      {view === "picking" ? (
        <span className="flex items-center gap-2 text-[var(--landing-ink)]">
          <MapPin className="h-3.5 w-3.5 shrink-0 text-[var(--landing-accent)]" aria-hidden />
          Click the map to choose a place
        </span>
      ) : (
        <span className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-[var(--landing-muted)]">
          <span className="flex items-center gap-1.5">
            <span aria-hidden className="h-1 w-5 rounded-full" style={{ backgroundColor: routeColor }} />
            With {routeName}
          </span>
          <span className="flex items-center gap-1.5">
            <span aria-hidden className="h-0 w-5 border-t-[3px] border-dashed border-[#6b7280]" />
            Existing network
          </span>
        </span>
      )}
      <span className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1 rounded-md px-2 py-1 font-medium text-[var(--landing-accent)] transition-colors hover:bg-[var(--landing-wash)]"
        >
          <ArrowLeft className="h-3 w-3" aria-hidden />
          {view === "picking" ? "Cancel" : "Back to results"}
        </button>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close journey test"
          className="flex h-6 w-6 items-center justify-center rounded-md text-[var(--landing-faint)] transition-colors hover:bg-[var(--landing-wash)] hover:text-[var(--landing-ink)]"
        >
          <X className="h-3.5 w-3.5" aria-hidden />
        </button>
      </span>
    </div>
  );
}
