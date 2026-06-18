"use client";

import { useState, useRef, useEffect } from "react";
import { Globe, ChevronDown, Upload, Check, Train, Map } from "lucide-react";
import type { FeedMeta, FeedMode } from "@/hooks/useFeed";

interface FeedSelectorProps {
  readyFeeds: FeedMeta[];
  activeFeedId: string | null;
  feedMode: FeedMode;
  onFeedChange: (feedId: string | null) => void;
  onModeChange: (mode: FeedMode) => void;
  /** When true, renders as a compact nav pill (for use inside the top bar) */
  navStyle?: boolean;
}

const MODES: { value: FeedMode; label: string; desc: string }[] = [
  { value: "go",   label: "GO Transit", desc: "Show only GO Transit routes"  },
  { value: "city", label: "City only",  desc: "Show only your city feed"     },
  { value: "both", label: "Both",       desc: "Overlay GO + city routes"     },
];

export default function FeedSelector({
  readyFeeds,
  activeFeedId,
  feedMode,
  onFeedChange,
  onModeChange,
  navStyle = false,
}: FeedSelectorProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const activeCity = readyFeeds.find(f => f.id === activeFeedId);
  const hasFeeds   = readyFeeds.length > 0;

  const modeLabel =
    feedMode === "go"   ? "GO Transit" :
    feedMode === "city" ? (activeCity?.cityName ?? "City feed") :
                          `GO + ${activeCity?.cityName ?? "City"}`;

  return (
    <div ref={ref} className="relative">
      {navStyle ? (
        /* ── Nav-bar pill style ───────────────────────────────────── */
        <button
          onClick={() => setOpen(o => !o)}
          className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-sm font-medium transition-all
            ${open
              ? "bg-slate-900 text-white shadow-sm"
              : "text-slate-600 hover:bg-slate-100"
            }`}
        >
          <Globe className="w-3.5 h-3.5" />
          City Feeds
          {hasFeeds && (
            <span className="ml-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-blue-500 text-[10px] font-bold text-white leading-none">
              {readyFeeds.length}
            </span>
          )}
          <ChevronDown className={`w-3 h-3 transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
      ) : (
        /* ── Floating pill style (legacy) ────────────────────────── */
        <button
          onClick={() => setOpen(o => !o)}
          className="flex items-center gap-1.5 bg-[#1a1a2e]/90 border border-white/10 text-white text-xs font-medium px-3 py-2 rounded-lg shadow-lg backdrop-blur-sm hover:bg-[#16213e] transition-colors"
        >
          <Globe className="w-3.5 h-3.5 text-blue-400" />
          <span>{modeLabel}</span>
          <ChevronDown className={`w-3 h-3 transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
      )}

      {open && (
        <div className="absolute top-full mt-2 right-0 w-72 bg-white border border-slate-200 rounded-2xl shadow-2xl z-50 overflow-hidden">

          {/* Header */}
          <div className="px-4 pt-3.5 pb-2 border-b border-slate-100">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Network layers</p>
          </div>

          {/* Mode picker */}
          <div className="p-3 border-b border-slate-100 space-y-1">
            {MODES.map(m => {
              const disabled = m.value !== "go" && !activeFeedId;
              return (
                <button
                  key={m.value}
                  disabled={disabled}
                  onClick={() => { if (!disabled) { onModeChange(m.value); setOpen(false); } }}
                  className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-xl text-sm transition-colors
                    ${feedMode === m.value && !disabled
                      ? "bg-slate-900 text-white"
                      : disabled
                        ? "opacity-35 cursor-not-allowed text-slate-600"
                        : "text-slate-700 hover:bg-slate-50"
                    }`}
                >
                  <div className="flex items-center gap-2">
                    {m.value === "go"   && <Train className="w-3.5 h-3.5 shrink-0" />}
                    {m.value === "city" && <Map className="w-3.5 h-3.5 shrink-0" />}
                    {m.value === "both" && <Globe className="w-3.5 h-3.5 shrink-0" />}
                    <span className="font-medium">{m.label}</span>
                  </div>
                  {feedMode === m.value && !disabled && <Check className="w-3.5 h-3.5 shrink-0" />}
                </button>
              );
            })}
          </div>

          {/* City feed picker */}
          <div className="p-3">
            <p className="px-1 mb-2 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Your city feeds</p>

            {hasFeeds ? (
              <div className="space-y-1">
                {readyFeeds.map(feed => (
                  <button
                    key={feed.id}
                    onClick={() => { onFeedChange(feed.id); setOpen(false); }}
                    className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-xl text-sm transition-colors
                      ${activeFeedId === feed.id
                        ? "bg-blue-50 text-blue-700 border border-blue-100"
                        : "text-slate-700 hover:bg-slate-50"
                      }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <Globe className="w-3.5 h-3.5 shrink-0 text-blue-500" />
                      <span className="font-medium truncate">{feed.cityName}</span>
                      {feed.routeCount !== null && (
                        <span className="text-xs text-slate-400 shrink-0">{feed.routeCount} routes</span>
                      )}
                    </div>
                    {activeFeedId === feed.id && <Check className="w-3.5 h-3.5 shrink-0 text-blue-500" />}
                  </button>
                ))}
              </div>
            ) : (
              <div className="text-center py-4 px-3">
                <Globe className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                <p className="text-sm font-medium text-slate-600 mb-0.5">No city feeds yet</p>
                <p className="text-xs text-slate-400">Upload a GTFS ZIP to explore any city&apos;s transit network on this map.</p>
              </div>
            )}

            {/* Upload CTA */}
            <a
              href="/gtfs"
              onClick={() => setOpen(false)}
              className="mt-3 flex items-center justify-center gap-2 w-full rounded-xl bg-slate-900 hover:bg-slate-700 text-white text-sm font-medium px-3 py-2.5 transition-colors"
            >
              <Upload className="w-3.5 h-3.5" />
              {hasFeeds ? "Upload another feed" : "Upload a city GTFS feed"}
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
