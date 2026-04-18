"use client";

import { useState, useEffect } from "react";
import { Train, Bus, ChevronDown, ChevronUp, MapPin, ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { GO_RAIL_LINES } from "@/lib/routeColors";
import { EnrichedRoute } from "@/lib/gtfs";

interface BrowsePanelProps {
  onRouteSelect: (shortName: string, variantIds: string[]) => void;
  onRouteClear: () => void;
}

export default function BrowsePanel({ onRouteSelect, onRouteClear }: BrowsePanelProps) {
  const [routes, setRoutes] = useState<EnrichedRoute[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedCard, setExpandedCard] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/routes")
      .then((r) => r.json())
      .then((d) => { setRoutes(d.routes ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const railRoutes = routes.filter((r) => r.is_rail);
  const busRoutes = routes.filter((r) => !r.is_rail);

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 pt-4 pb-3 border-b border-slate-100">
        <h2 className="font-semibold text-slate-900 text-base">GO Transit Routes</h2>
        <p className="text-xs text-slate-500 mt-0.5">Tap a route to highlight it on the map</p>
      </div>

      <Tabs defaultValue="trains" className="flex flex-col flex-1 min-h-0">
        <TabsList className="mx-4 mt-3 mb-1 grid grid-cols-2 h-9">
          <TabsTrigger value="trains" className="text-xs gap-1.5">
            <Train className="w-3.5 h-3.5" /> Train lines
          </TabsTrigger>
          <TabsTrigger value="buses" className="text-xs gap-1.5">
            <Bus className="w-3.5 h-3.5" /> Bus routes
          </TabsTrigger>
        </TabsList>

        {/* Train lines */}
        <TabsContent value="trains" className="flex-1 overflow-y-auto px-3 pb-4 mt-0">
          {loading ? (
            <SkeletonList count={7} />
          ) : (
            <div className="flex flex-col gap-2 mt-2">
              {railRoutes.map((route) => {
                const lineInfo = GO_RAIL_LINES[route.short_name];
                const isExpanded = expandedCard === route.short_name;
                const variantIds = route.variants.map((v) => v.variant_id);

                return (
                  <div
                    key={route.short_name}
                    className="rounded-xl border border-slate-100 bg-white overflow-hidden transition-shadow hover:shadow-sm"
                  >
                    <button
                      className="w-full flex items-center gap-3 p-3 text-left"
                      onClick={() => {
                        if (isExpanded) {
                          setExpandedCard(null);
                          onRouteClear();
                        } else {
                          setExpandedCard(route.short_name);
                          onRouteSelect(route.short_name, variantIds);
                        }
                      }}
                    >
                      {/* Color swatch */}
                      <div
                        className="w-10 h-10 rounded-xl flex-shrink-0 flex items-center justify-center text-white font-bold text-sm"
                        style={{ backgroundColor: lineInfo?.color ?? route.color }}
                      >
                        {route.short_name}
                      </div>

                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-slate-900 text-sm truncate">
                          {lineInfo?.name ?? route.long_name}
                        </p>
                        {route.from_stop && route.to_stop && (
                          <p className="text-xs text-slate-400 mt-0.5 truncate">
                            {route.from_stop} → {route.to_stop}
                          </p>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                          {route.total_trips.toLocaleString()} trips
                        </Badge>
                        {isExpanded ? (
                          <ChevronUp className="w-4 h-4 text-slate-400" />
                        ) : (
                          <ChevronDown className="w-4 h-4 text-slate-400" />
                        )}
                      </div>
                    </button>

                    {isExpanded && (
                      <div className="px-3 pb-3 border-t border-slate-50">
                        <p className="text-xs text-slate-500 mt-2 mb-1.5 font-medium">Route variants</p>
                        <div className="flex flex-col gap-1">
                          {route.variants.slice(0, 6).map((v) => (
                            <div
                              key={v.variant_id}
                              className="flex items-center justify-between text-xs text-slate-600 py-1 px-2 rounded-lg hover:bg-slate-50"
                            >
                              <span className="truncate">{v.label}</span>
                              <span className="text-slate-400 flex-shrink-0 ml-2">
                                {v.trip_count} trips
                              </span>
                            </div>
                          ))}
                          {route.variants.length > 6 && (
                            <p className="text-xs text-slate-400 px-2 pt-1">
                              +{route.variants.length - 6} more variants
                            </p>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* Bus routes */}
        <TabsContent value="buses" className="flex-1 overflow-y-auto px-3 pb-4 mt-0">
          {loading ? (
            <SkeletonList count={10} />
          ) : (
            <div className="flex flex-col gap-1.5 mt-2">
              {busRoutes.map((route) => {
                const variantIds = route.variants.map((v) => v.variant_id);
                return (
                  <button
                    key={route.short_name}
                    className="w-full flex items-center gap-3 p-2.5 rounded-xl border border-transparent hover:border-slate-100 hover:bg-slate-50 text-left transition-colors"
                    onClick={() => {
                      if (expandedCard === route.short_name) {
                        setExpandedCard(null);
                        onRouteClear();
                      } else {
                        setExpandedCard(route.short_name);
                        onRouteSelect(route.short_name, variantIds);
                      }
                    }}
                  >
                    <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-bold flex-shrink-0">
                      {route.short_name.slice(0, 3)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800 truncate">
                        {route.long_name || route.short_name}
                      </p>
                      {route.from_stop && route.to_stop && (
                        <p className="text-xs text-slate-400 truncate">
                          {route.from_stop} → {route.to_stop}
                        </p>
                      )}
                    </div>
                    <ArrowRight className="w-3.5 h-3.5 text-slate-300 flex-shrink-0" />
                  </button>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function SkeletonList({ count }: { count: number }) {
  return (
    <div className="flex flex-col gap-2 mt-2">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="h-16 rounded-xl bg-slate-100 animate-pulse" />
      ))}
    </div>
  );
}
