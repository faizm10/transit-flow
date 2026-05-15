"use client";

import { X, Train, Bus, ArrowRight, MapPin, Trash2, Share2 } from "lucide-react";
import { colorForRoute, GO_RAIL_LINES } from "@/lib/routeColors";

interface RouteInfoCardProps {
  shortName: string;
  variantId: string;
  variantLabel?: string;
  fromStop?: string;
  toStop?: string;
  tripCount?: number;
  color?: string;
  routeType?: "bus" | "train";
  title?: string;
  actionLabel?: string;
  deleteLabel?: string;
  placement?: "bottom-center" | "top-left";
  onDelete?: () => void;
  onShare?: () => void;
  onClose: () => void;
  onExplore: () => void;
}

export default function RouteInfoCard({
  shortName,
  variantId,
  variantLabel,
  fromStop,
  toStop,
  tripCount,
  color: colorOverride,
  routeType,
  title,
  actionLabel = "Explore this route",
  deleteLabel = "Delete route",
  placement = "bottom-center",
  onDelete,
  onShare,
  onClose,
  onExplore,
}: RouteInfoCardProps) {
  const lineInfo = GO_RAIL_LINES[shortName];
  const isRail = routeType ? routeType === "train" : !!lineInfo;
  const color = colorOverride ?? lineInfo?.color ?? colorForRoute(shortName);
  const displayName = title ?? lineInfo?.name ?? (variantLabel || `Route ${shortName}`);
  const shellClass = placement === "top-left"
    ? "absolute left-4 top-20 z-30 w-[min(340px,calc(100vw-32px))] pointer-events-auto animate-in fade-in slide-in-from-left-3 duration-200"
    : "absolute bottom-8 left-1/2 -translate-x-1/2 z-30 w-[min(360px,calc(100vw-32px))] pointer-events-auto animate-in fade-in slide-in-from-bottom-3 duration-200";

  return (
    <div className={shellClass}>
      <div className="bg-white/97 backdrop-blur-xl rounded-2xl border border-slate-200 shadow-xl overflow-hidden">
        {/* Color header strip */}
        <div className="h-1.5 w-full" style={{ backgroundColor: color }} />

        <div className="p-4">
          {/* Header row */}
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center gap-2.5">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center text-white flex-shrink-0"
                style={{ backgroundColor: color }}
              >
                {isRail ? <Train className="w-4.5 h-4.5" /> : <Bus className="w-4.5 h-4.5" />}
              </div>
              <div>
                <p className="font-semibold text-slate-900 leading-tight">{displayName}</p>
                {variantLabel && variantLabel !== displayName && (
                  <p className="text-xs text-slate-400 mt-0.5 truncate max-w-48">{variantLabel}</p>
                )}
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-slate-300 hover:text-slate-500 transition-colors -mt-0.5 -mr-0.5 p-1"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* From → To */}
          {(fromStop || toStop) && (
            <div className="flex items-center gap-1.5 text-sm text-slate-500 mb-3 bg-slate-50 rounded-xl px-3 py-2">
              <MapPin className="w-3.5 h-3.5 flex-shrink-0 text-slate-400" />
              <span className="truncate">{fromStop ?? "—"}</span>
              <ArrowRight className="w-3 h-3 flex-shrink-0 text-slate-300" />
              <span className="truncate">{toStop ?? "—"}</span>
            </div>
          )}

          {/* Trip count */}
          {tripCount !== undefined && (
            <p className="text-xs text-slate-400 mb-3">
              {tripCount.toLocaleString()} trips/week
            </p>
          )}

          {/* Action button */}
          <button
            onClick={onExplore}
            className="w-full flex items-center justify-center gap-1.5 text-sm font-medium rounded-xl py-2.5 transition-colors text-white"
            style={{ backgroundColor: color }}
          >
            {actionLabel} <ArrowRight className="w-3.5 h-3.5" />
          </button>

          {onShare && (
            <button
              onClick={onShare}
              className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100"
            >
              <Share2 className="h-3.5 w-3.5" />
              Share to community
            </button>
          )}

          {onDelete && (
            <button
              onClick={onDelete}
              className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg border border-red-100 bg-red-50 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-100"
            >
              <Trash2 className="h-3.5 w-3.5" />
              {deleteLabel}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
