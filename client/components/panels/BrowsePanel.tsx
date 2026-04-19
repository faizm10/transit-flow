"use client";

import { useEffect, useState } from "react";
import { Bus, ChevronDown, ChevronUp, Pencil, Train } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { GO_RAIL_LINES } from "@/lib/routeColors";
import { type CustomRoute, type EnrichedRoute, type RouteFilters } from "@/lib/gtfs";

interface BrowsePanelProps {
  onRouteSelect: (shortName: string, variantIds: string[]) => void;
  onRouteClear: () => void;
  customRoutes: CustomRoute[];
  routeFilters: RouteFilters;
  onRouteFilterChange: (filters: RouteFilters) => void;
}

export default function BrowsePanel({
  onRouteSelect,
  onRouteClear,
  customRoutes,
  routeFilters,
  onRouteFilterChange,
}: BrowsePanelProps) {
  const [routes, setRoutes] = useState<EnrichedRoute[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedCard, setExpandedCard] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/routes")
      .then((r) => r.json())
      .then((d) => {
        setRoutes(d.routes ?? []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const railRoutes = routes.filter((r) => r.is_rail);
  const busRoutes = routes.filter((r) => !r.is_rail);
  const allGoRouteShortNames = routes.map((r) => r.short_name);
  const allCustomRouteIds = customRoutes.map((r) => r.id);
  const visibleGoCount = routeFilters.goRouteShortNames === null
    ? routes.length
    : routes.filter((r) => routeFilters.goRouteShortNames?.includes(r.short_name)).length;
  const visibleCustomCount = routeFilters.customRouteIds === null
    ? customRoutes.length
    : customRoutes.filter((r) => routeFilters.customRouteIds?.includes(r.id)).length;
  const visibleRouteCount = visibleGoCount + visibleCustomCount;
  const totalRouteCount = routes.length + customRoutes.length;

  function isGoRouteVisible(shortName: string) {
    return routeFilters.goRouteShortNames === null || routeFilters.goRouteShortNames.includes(shortName);
  }

  function isCustomRouteVisible(id: string) {
    return routeFilters.customRouteIds === null || routeFilters.customRouteIds.includes(id);
  }

  function toggleGoRoute(shortName: string, visible: boolean) {
    const current = routeFilters.goRouteShortNames ?? allGoRouteShortNames;
    const next = visible
      ? Array.from(new Set([...current, shortName]))
      : current.filter((name) => name !== shortName);

    onRouteFilterChange({ ...routeFilters, goRouteShortNames: next });
  }

  function toggleCustomRoute(id: string, visible: boolean) {
    const current = routeFilters.customRouteIds ?? allCustomRouteIds;
    const next = visible
      ? Array.from(new Set([...current, id]))
      : current.filter((routeId) => routeId !== id);

    onRouteFilterChange({ ...routeFilters, customRouteIds: next });
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 pt-4 pb-3 border-b border-slate-100">
        <h2 className="font-semibold text-slate-900 text-base">GO Transit Routes</h2>
        <p className="text-xs text-slate-500 mt-0.5">Tap to highlight. Use checks to filter the map.</p>

        <div className="mt-3 flex items-center justify-between gap-2 rounded-lg border border-slate-100 bg-slate-50 px-2.5 py-2">
          <span className="text-[11px] font-medium text-slate-600">
            {totalRouteCount === 0 ? "Loading routes" : `${visibleRouteCount} of ${totalRouteCount} visible`}
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              className="rounded-md px-2 py-1 text-[11px] font-semibold text-[#155ba0] hover:bg-white"
              onClick={() => onRouteFilterChange({ goRouteShortNames: null, customRouteIds: null })}
            >
              All
            </button>
            <button
              type="button"
              className="rounded-md px-2 py-1 text-[11px] font-semibold text-slate-500 hover:bg-white"
              onClick={() => onRouteFilterChange({ goRouteShortNames: [], customRouteIds: [] })}
            >
              None
            </button>
          </div>
        </div>
      </div>

      <Tabs defaultValue="trains" className="flex flex-col flex-1 min-h-0">
        <TabsList className="mx-4 mt-3 mb-1 grid grid-cols-3 h-9">
          <TabsTrigger value="trains" className="text-xs gap-1.5">
            <Train className="w-3.5 h-3.5" /> Train
          </TabsTrigger>
          <TabsTrigger value="buses" className="text-xs gap-1.5">
            <Bus className="w-3.5 h-3.5" /> Bus
          </TabsTrigger>
          <TabsTrigger value="custom" className="text-xs gap-1.5">
            <Pencil className="w-3.5 h-3.5" /> Custom
          </TabsTrigger>
        </TabsList>

        <TabsContent value="trains" className="flex-1 overflow-y-auto px-3 pb-4 mt-0">
          {loading ? (
            <SkeletonList count={7} />
          ) : (
            <div className="flex flex-col gap-2 mt-2">
              {railRoutes.map((route) => {
                const lineInfo = GO_RAIL_LINES[route.short_name];
                const isExpanded = expandedCard === route.short_name;
                const variantIds = route.variants.map((v) => v.variant_id);
                const visible = isGoRouteVisible(route.short_name);

                return (
                  <div
                    key={route.short_name}
                    className={`rounded-xl border border-slate-100 bg-white overflow-hidden transition-shadow hover:shadow-sm ${
                      visible ? "" : "opacity-55"
                    }`}
                  >
                    <div className="flex items-center">
                      <button
                        className="min-w-0 flex-1 flex items-center gap-3 p-3 text-left"
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
                            {route.total_trips.toLocaleString()} trips/week
                          </Badge>
                          {isExpanded ? (
                            <ChevronUp className="w-4 h-4 text-slate-400" />
                          ) : (
                            <ChevronDown className="w-4 h-4 text-slate-400" />
                          )}
                        </div>
                      </button>

                      <VisibilityCheckbox
                        checked={visible}
                        label={`Show ${lineInfo?.name ?? route.long_name} on map`}
                        onChange={(checked) => toggleGoRoute(route.short_name, checked)}
                      />
                    </div>

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
                                {(v.weekly_trip_count ?? v.trip_count).toLocaleString()} trips/week
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

        <TabsContent value="buses" className="flex-1 overflow-y-auto px-3 pb-4 mt-0">
          {loading ? (
            <SkeletonList count={10} />
          ) : (
            <div className="flex flex-col gap-1.5 mt-2">
              {busRoutes.map((route) => {
                const variantIds = route.variants.map((v) => v.variant_id);
                const visible = isGoRouteVisible(route.short_name);

                return (
                  <div
                    key={route.short_name}
                    className={`flex items-center rounded-xl border transition-colors ${
                      visible
                        ? "border-transparent hover:border-slate-100 hover:bg-slate-50"
                        : "border-transparent bg-slate-50 opacity-55"
                    }`}
                  >
                    <button
                      className="min-w-0 flex-1 flex items-center gap-3 p-2.5 text-left"
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
                    </button>
                    <VisibilityCheckbox
                      checked={visible}
                      label={`Show ${route.long_name || route.short_name} on map`}
                      onChange={(checked) => toggleGoRoute(route.short_name, checked)}
                    />
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="custom" className="flex-1 overflow-y-auto px-3 pb-4 mt-0">
          <div className="flex flex-col gap-1.5 mt-2">
            {customRoutes.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-200 p-4 text-xs text-slate-500">
                Saved custom routes will appear here.
              </div>
            ) : (
              customRoutes.map((route) => {
                const visible = isCustomRouteVisible(route.id);

                return (
                  <div
                    key={route.id}
                    className={`flex items-center rounded-xl border transition-colors ${
                      visible
                        ? "border-transparent hover:border-slate-100 hover:bg-slate-50"
                        : "border-transparent bg-slate-50 opacity-55"
                    }`}
                  >
                    <button
                      className="min-w-0 flex-1 flex items-center gap-3 p-2.5 text-left"
                      onClick={() => onRouteSelect(route.name || "Custom route", [])}
                    >
                      <div
                        className="w-8 h-8 rounded-lg text-white flex items-center justify-center text-xs font-bold flex-shrink-0"
                        style={{ backgroundColor: route.color }}
                      >
                        {route.type === "train" ? "TR" : "BU"}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-800 truncate">
                          {route.name || "Custom route"}
                        </p>
                        <p className="text-xs text-slate-400 truncate">
                          {route.type === "train" ? "Custom train route" : "Custom bus route"}
                        </p>
                      </div>
                    </button>

                    <VisibilityCheckbox
                      checked={visible}
                      label={`Show ${route.name || "custom route"} on map`}
                      onChange={(checked) => toggleCustomRoute(route.id, checked)}
                    />
                  </div>
                );
              })
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function VisibilityCheckbox({
  checked,
  label,
  onChange,
}: {
  checked: boolean;
  label: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label
      className="flex self-stretch items-center px-3 cursor-pointer"
      onClick={(event) => event.stopPropagation()}
    >
      <span className="sr-only">{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.currentTarget.checked)}
        className="h-4 w-4 rounded border-slate-300 accent-[#155ba0]"
      />
    </label>
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
