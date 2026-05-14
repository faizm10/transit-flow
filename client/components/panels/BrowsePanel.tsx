"use client";

import { useEffect, useMemo, useState } from "react";
import { Bus, ChevronDown, ChevronUp, Pencil, Search, Train, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { GO_RAIL_LINES } from "@/lib/routeColors";
import { type CustomRoute, type EnrichedRoute, type RouteFilters } from "@/lib/gtfs";

interface BrowsePanelProps {
  onRouteSelect: (shortName: string, variantIds: string[]) => void;
  onRouteClear: () => void;
  customRoutes: CustomRoute[];
  routeFilters: RouteFilters;
  onRouteFilterChange: (filters: RouteFilters) => void;
  onDeleteCustomRoute: (routeId: string, routeName: string) => void;
}

function matchesSearch(route: EnrichedRoute, lineName: string | undefined, q: string) {
  if (!q.trim()) return true;
  const s = q.toLowerCase();
  return (
    route.short_name.toLowerCase().includes(s) ||
    route.long_name.toLowerCase().includes(s) ||
    (lineName?.toLowerCase().includes(s) ?? false) ||
    route.from_stop.toLowerCase().includes(s) ||
    route.to_stop.toLowerCase().includes(s)
  );
}

function matchesCustomSearch(route: CustomRoute, q: string) {
  if (!q.trim()) return true;
  const s = q.toLowerCase();
  return (route.name || "custom route").toLowerCase().includes(s);
}

function tripsLabel(route: EnrichedRoute) {
  const n = route.weekly_trips ?? route.total_trips;
  return `${n.toLocaleString()}/wk`;
}

export default function BrowsePanel({
  onRouteSelect,
  onRouteClear,
  customRoutes,
  routeFilters,
  onRouteFilterChange,
  onDeleteCustomRoute,
}: BrowsePanelProps) {
  const [routes, setRoutes] = useState<EnrichedRoute[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedCard, setExpandedCard] = useState<string | null>(null);
  const [search, setSearch] = useState("");

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

  const filteredRail = useMemo(
    () =>
      railRoutes.filter((r) => matchesSearch(r, GO_RAIL_LINES[r.short_name]?.name, search)),
    [railRoutes, search],
  );
  const filteredBus = useMemo(
    () => busRoutes.filter((r) => matchesSearch(r, undefined, search)),
    [busRoutes, search],
  );
  const filteredCustom = useMemo(
    () => customRoutes.filter((r) => matchesCustomSearch(r, search)),
    [customRoutes, search],
  );

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
    <div className="flex h-full flex-col">
      <header className="shrink-0 border-b border-slate-100 px-3 pb-2.5 pt-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold tracking-tight text-slate-900">GO Transit routes</h2>
            <p className="text-[10px] leading-snug text-slate-500">
              Row highlights on map · checkbox toggles visibility
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-0.5 rounded-md bg-slate-100 p-0.5 text-[10px] font-semibold">
            <button
              type="button"
              className="rounded px-1.5 py-0.5 text-[#155ba0] hover:bg-white"
              onClick={() => onRouteFilterChange({ goRouteShortNames: null, customRouteIds: null })}
            >
              All
            </button>
            <span className="text-slate-300">|</span>
            <button
              type="button"
              className="rounded px-1.5 py-0.5 text-slate-600 hover:bg-white"
              onClick={() => onRouteFilterChange({ goRouteShortNames: [], customRouteIds: [] })}
            >
              None
            </button>
          </div>
        </div>
        <p className="mt-1.5 text-[10px] tabular-nums text-slate-400">
          {totalRouteCount === 0 ? "Loading…" : `${visibleRouteCount}/${totalRouteCount} visible on map`}
        </p>
      </header>

      <Tabs defaultValue="trains" className="flex min-h-0 flex-1 flex-col">
        <div className="shrink-0 space-y-2 px-3 pt-2">
          <TabsList className="grid h-8 w-full grid-cols-3 gap-0 bg-slate-100 p-0.5">
            <TabsTrigger value="trains" className="gap-1 text-[11px] font-medium data-[state=active]:shadow-sm">
              <Train className="h-3 w-3 shrink-0" aria-hidden />
              Train
            </TabsTrigger>
            <TabsTrigger value="buses" className="gap-1 text-[11px] font-medium data-[state=active]:shadow-sm">
              <Bus className="h-3 w-3 shrink-0" aria-hidden />
              Bus
            </TabsTrigger>
            <TabsTrigger value="custom" className="gap-1 text-[11px] font-medium data-[state=active]:shadow-sm">
              <Pencil className="h-3 w-3 shrink-0" aria-hidden />
              Custom
            </TabsTrigger>
          </TabsList>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-slate-400" aria-hidden />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter…"
              className="h-7 border-slate-200 bg-slate-50/80 pl-7 text-xs placeholder:text-slate-400"
              aria-label="Filter routes by name"
            />
          </div>
        </div>

        <TabsContent value="trains" className="mt-0 flex min-h-0 flex-1 flex-col overflow-hidden px-2 pb-2">
          {loading ? (
            <SkeletonList count={9} />
          ) : filteredRail.length === 0 ? (
            <EmptyFilter />
          ) : (
            <div className="mt-1 min-h-0 flex-1 overflow-y-auto rounded-lg border border-slate-100 bg-white">
              <ul className="divide-y divide-slate-100">
                {filteredRail.map((route) => {
                  const lineInfo = GO_RAIL_LINES[route.short_name];
                  const title = lineInfo?.name ?? route.long_name;
                  const isExpanded = expandedCard === route.short_name;
                  const variantIds = route.variants.map((v) => v.variant_id);
                  const visible = isGoRouteVisible(route.short_name);

                  return (
                    <li key={route.short_name}>
                      <div
                        className={`flex min-h-9 items-stretch ${
                          visible ? "" : "bg-slate-50/80 opacity-60"
                        }`}
                      >
                        <button
                          type="button"
                          aria-expanded={isExpanded}
                          className="flex min-w-0 flex-1 items-center gap-2 py-1.5 pl-2 pr-1 text-left transition-colors hover:bg-slate-50"
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
                          <span
                            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[10px] font-bold text-white shadow-sm"
                            style={{ backgroundColor: lineInfo?.color ?? route.color }}
                          >
                            {route.short_name}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="flex min-w-0 items-baseline gap-1.5">
                              <span className="truncate text-xs font-medium text-slate-900">{title}</span>
                              <span className="shrink-0 tabular-nums text-[10px] text-slate-400">
                                {tripsLabel(route)}
                              </span>
                            </span>
                          </span>
                          {isExpanded ? (
                            <ChevronUp className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden />
                          ) : (
                            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden />
                          )}
                        </button>
                        <VisibilityCheckbox
                          checked={visible}
                          label={`Show ${title} on map`}
                          onChange={(checked) => toggleGoRoute(route.short_name, checked)}
                        />
                      </div>
                      {isExpanded && (
                        <div className="border-t border-slate-50 bg-slate-50/50 px-2 py-1.5">
                          {route.from_stop && route.to_stop && (
                            <p className="mb-1.5 truncate text-[10px] text-slate-500">
                              {route.from_stop} → {route.to_stop}
                            </p>
                          )}
                          <p className="mb-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-400">
                            Variants
                          </p>
                          <ul className="space-y-0.5">
                            {route.variants.slice(0, 8).map((v) => (
                              <li
                                key={v.variant_id}
                                className="flex items-center justify-between gap-2 rounded px-1.5 py-0.5 text-[11px] text-slate-600"
                              >
                                <span className="min-w-0 truncate">{v.label}</span>
                                <span className="shrink-0 tabular-nums text-[10px] text-slate-400">
                                  {(v.weekly_trip_count ?? v.trip_count).toLocaleString()}/wk
                                </span>
                              </li>
                            ))}
                          </ul>
                          {route.variants.length > 8 && (
                            <p className="mt-1 px-1.5 text-[10px] text-slate-400">
                              +{route.variants.length - 8} more
                            </p>
                          )}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </TabsContent>

        <TabsContent value="buses" className="mt-0 flex min-h-0 flex-1 flex-col overflow-hidden px-2 pb-2">
          {loading ? (
            <SkeletonList count={10} />
          ) : filteredBus.length === 0 ? (
            <EmptyFilter />
          ) : (
            <div className="mt-1 min-h-0 flex-1 overflow-y-auto rounded-lg border border-slate-100 bg-white">
              <ul className="divide-y divide-slate-100">
                {filteredBus.map((route) => {
                  const variantIds = route.variants.map((v) => v.variant_id);
                  const visible = isGoRouteVisible(route.short_name);
                  const isExpanded = expandedCard === route.short_name;
                  const title = route.long_name || route.short_name;

                  return (
                    <li key={route.short_name}>
                      <div
                        className={`flex min-h-9 items-stretch ${
                          visible ? "" : "bg-slate-50/80 opacity-60"
                        }`}
                      >
                        <button
                          type="button"
                          aria-expanded={isExpanded}
                          className="flex min-w-0 flex-1 items-center gap-2 py-1.5 pl-2 pr-1 text-left transition-colors hover:bg-slate-50"
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
                          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-blue-600/10 text-[10px] font-bold text-blue-800">
                            {route.short_name.slice(0, 3)}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="flex min-w-0 items-baseline gap-1.5">
                              <span className="truncate text-xs font-medium text-slate-900">{title}</span>
                              <span className="shrink-0 tabular-nums text-[10px] text-slate-400">
                                {tripsLabel(route)}
                              </span>
                            </span>
                          </span>
                          {isExpanded ? (
                            <ChevronUp className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden />
                          ) : (
                            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden />
                          )}
                        </button>
                        <VisibilityCheckbox
                          checked={visible}
                          label={`Show ${title} on map`}
                          onChange={(checked) => toggleGoRoute(route.short_name, checked)}
                        />
                      </div>
                      {isExpanded && (route.variants.length > 0 || (route.from_stop && route.to_stop)) && (
                        <div className="border-t border-slate-50 bg-slate-50/50 px-2 py-1.5">
                          {route.from_stop && route.to_stop && (
                            <p className="mb-1.5 truncate text-[10px] text-slate-500">
                              {route.from_stop} → {route.to_stop}
                            </p>
                          )}
                          {route.variants.length > 0 && (
                            <>
                              <p className="mb-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-400">
                                Variants
                              </p>
                              <ul className="space-y-0.5">
                                {route.variants.slice(0, 8).map((v) => (
                                  <li
                                    key={v.variant_id}
                                    className="flex items-center justify-between gap-2 rounded px-1.5 py-0.5 text-[11px] text-slate-600"
                                  >
                                    <span className="min-w-0 truncate">{v.label}</span>
                                    <span className="shrink-0 tabular-nums text-[10px] text-slate-400">
                                      {(v.weekly_trip_count ?? v.trip_count).toLocaleString()}/wk
                                    </span>
                                  </li>
                                ))}
                              </ul>
                              {route.variants.length > 8 && (
                                <p className="mt-1 px-1.5 text-[10px] text-slate-400">
                                  +{route.variants.length - 8} more
                                </p>
                              )}
                            </>
                          )}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </TabsContent>

        <TabsContent value="custom" className="mt-0 flex min-h-0 flex-1 flex-col overflow-hidden px-2 pb-2">
          {customRoutes.length === 0 ? (
            <div className="mt-2 rounded-lg border border-dashed border-slate-200 px-3 py-3 text-center text-[11px] leading-relaxed text-slate-500">
              Custom routes from <span className="font-medium text-slate-600">Design</span> appear here.
            </div>
          ) : filteredCustom.length === 0 ? (
            <EmptyFilter />
          ) : (
            <div className="mt-1 min-h-0 flex-1 overflow-y-auto rounded-lg border border-slate-100 bg-white">
              <ul className="divide-y divide-slate-100">
                {filteredCustom.map((route) => {
                  const visible = isCustomRouteVisible(route.id);

                  return (
                    <li
                      key={route.id}
                      className={`flex min-h-9 items-center ${
                        visible ? "" : "bg-slate-50/80 opacity-60"
                      }`}
                    >
                      <button
                        type="button"
                        className="flex min-w-0 flex-1 items-center gap-2 py-1.5 pl-2 pr-1 text-left transition-colors hover:bg-slate-50"
                        onClick={() => onRouteSelect(route.name || "Custom route", [])}
                      >
                        <span
                          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[9px] font-bold text-white shadow-sm"
                          style={{ backgroundColor: route.color }}
                        >
                          {route.type === "train" ? "R" : "B"}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-xs font-medium text-slate-900">
                          {route.name || "Custom route"}
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          onDeleteCustomRoute(route.id, route.name || "Custom route");
                        }}
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600"
                        aria-label={`Delete ${route.name || "custom route"}`}
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                      <VisibilityCheckbox
                        checked={visible}
                        label={`Show ${route.name || "custom route"} on map`}
                        onChange={(checked) => toggleCustomRoute(route.id, checked)}
                      />
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function EmptyFilter() {
  return (
    <div className="mt-4 flex flex-col items-center gap-1 py-6 text-center">
      <Search className="h-6 w-6 text-slate-200" aria-hidden />
      <p className="text-xs font-medium text-slate-500">No routes match</p>
      <p className="text-[10px] text-slate-400">Try a shorter search</p>
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
      className="flex cursor-pointer items-center self-stretch px-2 hover:bg-slate-50/80"
      onClick={(event) => event.stopPropagation()}
    >
      <span className="sr-only">{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.currentTarget.checked)}
        className="h-3.5 w-3.5 rounded border-slate-300 accent-[#155ba0]"
      />
    </label>
  );
}

function SkeletonList({ count }: { count: number }) {
  return (
    <div className="mt-1 space-y-1.5">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="h-9 animate-pulse rounded-lg bg-slate-100" />
      ))}
    </div>
  );
}
