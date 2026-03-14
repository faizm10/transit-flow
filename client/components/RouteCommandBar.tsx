"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { MagnifyingGlassIcon, PlusIcon, RocketIcon, LightningBoltIcon } from "@radix-ui/react-icons";
import { searchStops, loadGOTransitStops, type GTFSStop } from "@/lib/stopSearch";
import { ROUTE_BUILDER_CURRENT_KEY } from "@/hooks/useRouteBuilder";

type SavedStop = {
  id: string;
  name: string;
  lat: number;
  lng: number;
};

type SearchItem =
  | { type: "saved"; id: string; name: string; lat: number; lng: number; subtitle: string }
  | { type: "stop"; id: string; name: string; lat: number; lng: number; subtitle: string };

const SAVED_STOPS_KEY = "route_builder_saved_stops";

type AIGeneratedStop = {
  name: string;
  lat: number;
  lng: number;
  reasoning?: string;
  matched?: boolean;
};

type RouteCommandBarProps = {
  onCreateRoute: () => void;
  onAddStop: (stop: { name: string; lat: number; lng: number }) => void;
  
  onAIRoute: (route: { name: string; stops: AIGeneratedStop[]; reasoning: string }) => void;
  mapCenter?: { lat: number; lng: number };
  enabled: boolean;
};

export function RouteCommandBar({
  onCreateRoute,
  onAddStop,
  onAIRoute,
  mapCenter,
  enabled,
}: RouteCommandBarProps) {
  const [focused, setFocused] = useState(false);
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchItem[]>([]);
  const [allStops, setAllStops] = useState<GTFSStop[]>([]);
  const [savedStops, setSavedStops] = useState<SavedStop[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [pinActive, setPinActive] = useState(false);
  const [routeContext, setRouteContext] = useState<{
    count: number;
    startName?: string;
    endName?: string;
  }>({ count: 0 });

  // Load stops on mount
  useEffect(() => {
    loadGOTransitStops().then(setAllStops);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const readSaved = () => {
      try {
        const raw = window.localStorage.getItem(SAVED_STOPS_KEY);
        const parsed = raw ? (JSON.parse(raw) as SavedStop[]) : [];
        setSavedStops(Array.isArray(parsed) ? parsed : []);
      } catch {
        setSavedStops([]);
      }
    };
    readSaved();
    const handleSaved = () => readSaved();
    window.addEventListener("route-builder-saved-stop", handleSaved);
    return () => {
      window.removeEventListener("route-builder-saved-stop", handleSaved);
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const readContext = () => {
      try {
        const raw = window.localStorage.getItem(ROUTE_BUILDER_CURRENT_KEY);
        if (!raw) {
          setRouteContext({ count: 0 });
          return;
        }
        const parsed = JSON.parse(raw);
        const stops = Array.isArray(parsed?.stops) ? parsed.stops : [];
        const startName = stops[0]?.name;
        const endName = stops[stops.length - 1]?.name;
        setRouteContext({
          count: stops.length,
          startName,
          endName,
        });
      } catch {
        setRouteContext({ count: 0 });
      }
    };
    readContext();
    const interval = window.setInterval(readContext, 500);
    return () => window.clearInterval(interval);
  }, []);

  // Search when query changes
  useEffect(() => {
    if (!query.trim() || allStops.length === 0) {
      setSearchResults([]);
      return;
    }

    const center = mapCenter || { lat: 43.6532, lng: -79.3832 }; // Default to Toronto
    const results = searchStops(
      allStops,
      center.lat,
      center.lng,
      query,
      5
    );
    const savedMatches = savedStops
      .filter((stop) => stop.name.toLowerCase().includes(query.toLowerCase()))
      .map((stop) => ({
        type: "saved" as const,
        id: stop.id,
        name: stop.name,
        lat: stop.lat,
        lng: stop.lng,
        subtitle: "Saved stop",
      }));
    const goMatches = results.map((stop) => ({
      type: "stop" as const,
      id: stop.stop_id,
      name: stop.stop_name,
      lat: stop.stop_lat,
      lng: stop.stop_lon,
      subtitle: `${stop.stop_lat.toFixed(4)}, ${stop.stop_lon.toFixed(4)}`,
    }));
    setSearchResults([...savedMatches, ...goMatches].slice(0, 8));
    setSelectedIndex(0);
  }, [query, allStops, mapCenter, savedStops]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleComplete = () => setPinActive(false);
    window.addEventListener("route-builder-pin-complete", handleComplete);
    return () => {
      window.removeEventListener("route-builder-pin-complete", handleComplete);
    };
  }, []);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!query.trim() || aiGenerating) return;

      // If there are search results, add the selected stop
      if (searchResults.length > 0) {
        const selected = searchResults[selectedIndex];
        onAddStop({
          name: selected.name,
          lat: selected.lat,
          lng: selected.lng,
        });
        setQuery("");
        setSearchResults([]);
        return;
      }

      // Otherwise, use AI to generate route from prompt
      setAiGenerating(true);
      setAiError(null);

      try {
        let currentRoute: {
          name?: string;
          stops?: Array<{ name?: string; lat: number; lng: number }>;
        } | null = null;

        if (typeof window !== "undefined") {
          try {
            const raw = window.localStorage.getItem(ROUTE_BUILDER_CURRENT_KEY);
            if (raw) {
              const parsed = JSON.parse(raw);
              if (parsed && Array.isArray(parsed.stops)) {
                currentRoute = {
                  name: parsed.name,
                  stops: parsed.stops,
                };
              }
            }
          } catch {
            // ignore storage parse errors
          }
        }

        const response = await fetch("/api/route-agent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt: query, currentRoute }),
        });

        const data = await response.json();

        if (!response.ok) {
          const details =
            typeof data?.details === "string" ? ` — ${data.details}` : "";
          throw new Error((data.error || "Failed to generate route") + details);
        }

        if (data.success && data.route) {
          onAIRoute(data.route);
          setQuery("");
          setSearchResults([]);
        } else {
          console.warn("AI route generation returned no route:", data);
          const raw = typeof data?.rawResponse === "string" ? data.rawResponse.slice(0, 600) : "";
          throw new Error(
            data?.error
              ? `${data.error}${raw ? ` — ${raw}` : ""}`
              : "Invalid response from AI"
          );
        }
      } catch (error) {
        console.error("AI route generation error:", error);
        setAiError(error instanceof Error ? error.message : "Failed to generate route");
      } finally {
        setAiGenerating(false);
      }
    },
    [query, searchResults, selectedIndex, aiGenerating, onAddStop, onAIRoute]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((prev) =>
          Math.min(prev + 1, searchResults.length - 1)
        );
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((prev) => Math.max(prev - 1, 0));
      } else if (e.key === "Escape") {
        setQuery("");
        setSearchResults([]);
        inputRef.current?.blur();
      }
    },
    [searchResults.length]
  );

  if (!enabled) return null;

  return (
    <div className="fixed bottom-[5.5rem] left-1/2 z-50 w-full max-w-2xl -translate-x-1/2 px-4 md:bottom-8">
      <div className="relative">
        {/* Search results dropdown */}
        {searchResults.length > 0 && focused && (
          <div className="absolute bottom-full mb-3 w-full overflow-hidden rounded-[26px] border border-white/50 bg-[var(--glass-surface-strong)] shadow-[var(--glass-shadow)] backdrop-blur-2xl">
            {searchResults.map((stop, index) => (
              <button
                key={`${stop.type}-${stop.id}`}
                onClick={() => {
                  onAddStop({
                    name: stop.name,
                    lat: stop.lat,
                    lng: stop.lng,
                  });
                  setQuery("");
                  setSearchResults([]);
                }}
                className={`w-full border-b border-white/35 px-4 py-3 text-left transition-all last:border-b-0 ${
                  index === selectedIndex
                    ? "border-l-2 border-l-sky-600 bg-sky-100/75"
                    : "border-l-2 border-l-transparent hover:bg-white/45"
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl border ${
                    stop.type === "saved"
                      ? "border-emerald-200 bg-emerald-100/80"
                      : "border-sky-200 bg-sky-100/80"
                  }`}>
                    <PlusIcon className="w-4 h-4 text-blue-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="truncate text-sm font-medium text-slate-900">
                      {stop.name}
                    </div>
                    <div className="text-xs text-slate-500">
                      {stop.subtitle}
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}

        {/* Command bar */}
        <form onSubmit={handleSubmit} className="relative">
          <div
            className={`relative flex items-center gap-3 rounded-[28px] border bg-[var(--glass-surface-strong)] shadow-[var(--glass-shadow)] backdrop-blur-2xl transition-all duration-200 ${
              aiGenerating
                ? "border-sky-300 ring-4 ring-sky-100/70"
                : focused
                ? "border-sky-300 ring-4 ring-sky-100/60"
                : "border-white/50 hover:border-white/70"
            }`}
          >
            <div className="flex-shrink-0 pl-4">
              {aiGenerating ? (
                <div className="relative">
                  <LightningBoltIcon className="w-5 h-5 text-blue-600 animate-pulse" />
                  <div className="absolute inset-0 rounded-full bg-blue-400 opacity-20 animate-ping" />
                </div>
              ) : (
                <MagnifyingGlassIcon
                  className={`w-5 h-5 transition-colors ${
                    focused ? "text-sky-600" : "text-slate-400"
                  }`}
                />
              )}
            </div>
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onFocus={() => setFocused(true)}
              onBlur={() => setTimeout(() => setFocused(false), 200)}
              onKeyDown={handleKeyDown}
              placeholder={
                aiGenerating
                  ? "AI is thinking..."
                  : routeContext.count === 0
                    ? "Enter start stop..."
                    : routeContext.count === 1
                      ? "Enter end stop..."
                      : "Enter stop..."
              }
                disabled={aiGenerating}
                className="flex-1 bg-transparent px-0 py-4 text-sm text-white placeholder-white/55 focus:outline-none disabled:opacity-60"
              />
            <div className="flex-shrink-0 pr-2">
              <button
                type="button"
                onClick={() => {
                  setPinActive(true);
                  window.dispatchEvent(new CustomEvent("route-builder-pin-start"));
                }}
                className={`mr-2 rounded-2xl px-3 py-2 text-xs font-semibold transition-all ${
                  pinActive
                    ? "bg-emerald-600 text-white"
                    : "border border-white/45 bg-white/55 text-slate-700 hover:bg-white/80"
                }`}
              >
                Pin
              </button>
              {query.trim() ? (
                <button
                  type="submit"
                  disabled={aiGenerating}
                  className={`rounded-2xl px-4 py-2.5 text-xs font-semibold transition-all ${
                    aiGenerating
                      ? "bg-blue-600 text-white opacity-60 cursor-wait"
                      : searchResults.length > 0
                      ? "bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm"
                      : "bg-blue-600 text-white hover:bg-blue-700 shadow-sm"
                  }`}
                >
                  {aiGenerating ? (
                    <>
                      <LightningBoltIcon className="w-3.5 h-3.5 inline mr-1.5 animate-spin" />
                      Generating...
                    </>
                  ) : searchResults.length > 0 ? (
                    "Add Stop"
                  ) : (
                    <>
                      <LightningBoltIcon className="w-3.5 h-3.5 inline mr-1.5" />
                      Generate
                    </>
                  )}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={onCreateRoute}
                  className="rounded-2xl border border-white/45 bg-white/60 px-4 py-2.5 text-xs font-semibold text-slate-700 transition-all hover:bg-white/80"
                >
                  <RocketIcon className="w-3.5 h-3.5 inline mr-1.5" />
                  New Route
                </button>
              )}
            </div>
          </div>
        </form>

        {/* Helper text or error */}
        {aiError ? (
          <div className="mt-3 rounded-2xl border border-red-200 bg-red-50/90 px-3 py-2.5 text-center text-xs font-medium text-red-700 backdrop-blur-xl">
            {aiError}
          </div>
        ) : (
          <div className="mt-3 text-center text-xs text-slate-500">
            {aiGenerating ? (
              <span className="font-medium text-sky-600">
                <LightningBoltIcon className="w-3 h-3 inline mr-1 animate-pulse" />
                AI is generating your route...
              </span>
            ) : pinActive ? (
              <span className="font-medium text-emerald-600">
                Click on the map to pin a stop.
              </span>
            ) : focused ? (
              <span className="text-slate-600">↑↓ Navigate • Enter to select • Esc to cancel</span>
            ) : (
              <span className="text-slate-600">
                <LightningBoltIcon className="w-3 h-3 inline mr-1" />
                Search stops or <strong className="font-semibold text-slate-800">describe a route in plain English</strong>
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
