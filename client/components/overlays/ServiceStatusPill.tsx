"use client";

import Link from "next/link";
import { AlertTriangle, CheckCircle2, ChevronRight, Info } from "lucide-react";

import type { ServiceUpdatesResult } from "@/lib/serviceUpdates";
import { SlateChipSwitch } from "@/components/ui/slate-chip-switch";

type Tone = "clear" | "alert" | "unknown";

interface Status {
  tone: Tone;
  label: string;
  detail: string;
}

/**
 * Reads the same feed as /service-updates and states only what that feed can
 * support.
 *
 * The distinction that matters is between "nothing is wrong" and "we cannot
 * tell". Only the Metrolinx API is authoritative enough to claim all-clear:
 * the gotransit.com scrape is a best-effort fallback whose selectors drift
 * with the site, so zero alerts from it means the scrape found nothing, which
 * is not the same as nothing being wrong. Saying "All clear" on that basis
 * would be the kind of green light people plan journeys around.
 */
function toStatus(data: ServiceUpdatesResult | null): Status {
  if (!data || data.source === "error") {
    return {
      tone: "unknown",
      label: "Status unavailable",
      detail: "Could not reach GO service updates",
    };
  }

  const count = data.alerts.length;
  if (count > 0) {
    const disrupting = data.alerts.filter(
      (a) => a.type === "delay" || a.type === "cancellation"
    ).length;
    return {
      tone: "alert",
      label: count === 1 ? "1 service alert" : `${count} service alerts`,
      detail:
        disrupting > 0
          ? `${disrupting} affecting service`
          : "No delays or cancellations reported",
    };
  }

  if (data.source === "metrolinx-api") {
    return {
      tone: "clear",
      label: "All clear",
      detail: "No active GO service alerts",
    };
  }

  return {
    tone: "unknown",
    label: "Service updates",
    detail: "Live alerts unavailable — showing scraped data",
  };
}

const TONE_STYLES: Record<Tone, { dot: string; text: string; Icon: typeof Info }> = {
  clear: {
    dot: "bg-[var(--landing-accent)]",
    text: "text-[var(--landing-ink)]",
    Icon: CheckCircle2,
  },
  alert: {
    dot: "bg-[var(--landing-amber)]",
    text: "text-[var(--landing-ink)]",
    Icon: AlertTriangle,
  },
  unknown: {
    dot: "bg-[var(--landing-faint)]",
    text: "text-[var(--landing-muted)]",
    Icon: Info,
  },
};

interface ServiceStatusPillProps {
  data: ServiceUpdatesResult | null;
  /** Parent's fetch state — nothing renders until the first response lands. */
  loaded: boolean;
  /** Show the "Show on map" toggle row (true when rail lines actually have alerts). */
  canToggle: boolean;
  showOnMap: boolean;
  onShowOnMapChange: (next: boolean) => void;
}

/**
 * One floating card, top-right of the map: the live service-status line (links
 * to /service-updates) and, when rail lines have alerts, a switch that overlays
 * them on the map.
 */
export default function ServiceStatusPill({
  data,
  loaded,
  canToggle,
  showOnMap,
  onShowOnMapChange,
}: ServiceStatusPillProps) {
  // Nothing until the first response: a card that flips from "All clear" to
  // "2 alerts" a second after load is worse than one that arrives once.
  if (!loaded) return null;

  const { tone, label, detail } = toStatus(data);
  const { dot, text, Icon } = TONE_STYLES[tone];

  return (
    <div className="tf-map-panel absolute right-4 top-20 z-20 w-64 overflow-hidden">
      <Link
        href="/service-updates"
        title={detail}
        className="flex items-center gap-2 px-3 py-2.5 transition-colors hover:bg-[var(--landing-wash)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--landing-accent)]"
      >
        <span className="relative flex h-2 w-2 shrink-0">
          {tone === "alert" && (
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--landing-amber)] opacity-50 motion-reduce:hidden" />
          )}
          <span className={`relative inline-flex h-2 w-2 rounded-full ${dot}`} />
        </span>
        <span
          className={`flex-1 truncate font-[family-name:var(--landing-mono)] text-[0.6875rem] uppercase tracking-[0.06em] font-semibold ${text}`}
        >
          {label}
        </span>
        <Icon className="h-3.5 w-3.5 shrink-0 text-[var(--landing-faint)]" aria-hidden />
        <ChevronRight
          className="-mr-1 h-3.5 w-3.5 shrink-0 text-[var(--landing-faint)]"
          aria-hidden
        />
        <span className="sr-only">{detail}. Open service updates.</span>
      </Link>

      {canToggle && (
        <div className="flex items-center gap-2 border-t border-[var(--landing-border)] px-3 py-2">
          <AlertTriangle
            className={`h-3.5 w-3.5 shrink-0 ${
              showOnMap ? "text-[var(--landing-amber)]" : "text-[var(--landing-faint)]"
            }`}
            aria-hidden
          />
          <label
            htmlFor="service-alerts-on-map"
            className={`flex-1 cursor-pointer font-[family-name:var(--landing-mono)] text-[0.6875rem] uppercase tracking-[0.06em] font-medium ${
              showOnMap ? "text-[var(--landing-amber)]" : "text-[var(--landing-muted)]"
            }`}
          >
            Show on map
          </label>
          <SlateChipSwitch
            id="service-alerts-on-map"
            checked={showOnMap}
            onCheckedChange={onShowOnMapChange}
            label="Show GO service alerts on the map"
            className="text-[13px]"
          />
        </div>
      )}
    </div>
  );
}
