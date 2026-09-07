"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, Info } from "lucide-react";

import type { ServiceUpdatesResult } from "@/lib/serviceUpdates";

/** Re-check while the tab stays open. Alerts move on the order of minutes. */
const REFRESH_MS = 5 * 60 * 1000;

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
      detail: disrupting > 0
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
  clear:   { dot: "bg-emerald-500", text: "text-slate-700", Icon: CheckCircle2 },
  alert:   { dot: "bg-amber-500",   text: "text-slate-900", Icon: AlertTriangle },
  unknown: { dot: "bg-slate-300",   text: "text-slate-500", Icon: Info },
};

export default function ServiceStatusPill() {
  const [data, setData] = useState<ServiceUpdatesResult | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch("/api/service-updates");
        if (!res.ok) throw new Error(String(res.status));
        const json = (await res.json()) as ServiceUpdatesResult;
        if (!cancelled) setData(json);
      } catch {
        if (!cancelled) setData(null);
      } finally {
        if (!cancelled) setLoaded(true);
      }
    }

    load();
    const timer = setInterval(load, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  // Nothing until the first response: a pill that flips from "All clear" to
  // "2 alerts" a second after load is worse than one that arrives once.
  if (!loaded) return null;

  const { tone, label, detail } = toStatus(data);
  const { dot, text, Icon } = TONE_STYLES[tone];

  return (
    <Link
      href="/service-updates"
      title={detail}
      className="absolute right-4 top-20 z-20 flex items-center gap-2 rounded-xl border border-slate-200 bg-white/95 px-3 py-2 shadow-lg backdrop-blur-xl transition-colors hover:border-slate-300 hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#155ba0]"
    >
      <span className="relative flex h-2 w-2 shrink-0">
        {tone === "alert" && (
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-60 motion-reduce:hidden" />
        )}
        <span className={`relative inline-flex h-2 w-2 rounded-full ${dot}`} />
      </span>
      <span className={`text-xs font-semibold tracking-tight ${text}`}>{label}</span>
      <Icon className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden />
      <span className="sr-only">{detail}. Open service updates.</span>
    </Link>
  );
}
