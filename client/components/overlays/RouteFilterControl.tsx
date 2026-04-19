"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Bus, ListFilter, Pencil, Train, X } from "lucide-react";
import { colorForRoute, GO_RAIL_LINES } from "@/lib/routeColors";
import { type CustomRoute, type EnrichedRoute, type RouteFilters } from "@/lib/gtfs";

interface RouteFilterControlProps {
  customRoutes: CustomRoute[];
  routeFilters: RouteFilters;
  onRouteFilterChange: (filters: RouteFilters) => void;
}

export default function RouteFilterControl({
  customRoutes,
  routeFilters,
  onRouteFilterChange,
}: RouteFilterControlProps) {
  const [open, setOpen] = useState(false);
  const [routes, setRoutes] = useState<EnrichedRoute[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/routes")
      .then((r) => r.json())
      .then((d) => {
        setRoutes(d.routes ?? []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const railRoutes = routes.filter((route) => route.is_rail);
  const busRoutes = routes.filter((route) => !route.is_rail);
  const allGoRouteShortNames = routes.map((route) => route.short_name);
  const allCustomRouteIds = customRoutes.map((route) => route.id);
  const visibleGoCount = routeFilters.goRouteShortNames === null
    ? routes.length
    : routes.filter((route) => routeFilters.goRouteShortNames?.includes(route.short_name)).length;
  const visibleCustomCount = routeFilters.customRouteIds === null
    ? customRoutes.length
    : customRoutes.filter((route) => routeFilters.customRouteIds?.includes(route.id)).length;
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
    <div className="absolute right-4 top-20 z-30 pointer-events-none">
      <div className="pointer-events-auto flex flex-col items-end gap-2">
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white/95 px-3 py-2 text-sm font-semibold text-slate-800 shadow-md backdrop-blur-xl transition-shadow hover:shadow-lg"
          aria-expanded={open}
        >
          <ListFilter className="h-4 w-4 text-[#155ba0]" />
          Filter
          <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-500">
            {loading ? "..." : `${visibleRouteCount}/${totalRouteCount}`}
          </span>
        </button>

        {open && (
          <div className="w-[min(360px,calc(100vw-32px))] rounded-lg border border-slate-200 bg-white/95 shadow-xl backdrop-blur-xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2.5">
              <div>
                <p className="text-sm font-semibold text-slate-900">Filter map routes</p>
                <p className="text-[11px] text-slate-500">
                  {loading ? "Loading routes" : `${visibleRouteCount} of ${totalRouteCount} visible`}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex items-center gap-1 border-b border-slate-100 px-3 py-2">
              <button
                type="button"
                className="rounded-md px-2 py-1 text-[11px] font-semibold text-[#155ba0] hover:bg-slate-50"
                onClick={() => onRouteFilterChange({ goRouteShortNames: null, customRouteIds: null })}
              >
                Show all
              </button>
              <button
                type="button"
                className="rounded-md px-2 py-1 text-[11px] font-semibold text-slate-500 hover:bg-slate-50"
                onClick={() => onRouteFilterChange({ goRouteShortNames: [], customRouteIds: [] })}
              >
                Hide all
              </button>
            </div>

            <div className="max-h-[min(62vh,520px)] overflow-y-auto px-2 py-2">
              <RouteSection title="Train lines" icon={<Train className="h-3.5 w-3.5" />}>
                {railRoutes.map((route) => (
                  <RouteFilterRow
                    key={route.short_name}
                    label={GO_RAIL_LINES[route.short_name]?.name ?? route.long_name}
                    shortName={route.short_name}
                    color={GO_RAIL_LINES[route.short_name]?.color ?? route.color}
                    checked={isGoRouteVisible(route.short_name)}
                    onChange={(checked) => toggleGoRoute(route.short_name, checked)}
                  />
                ))}
              </RouteSection>

              <RouteSection title="Bus routes" icon={<Bus className="h-3.5 w-3.5" />}>
                {busRoutes.map((route) => (
                  <RouteFilterRow
                    key={route.short_name}
                    label={route.long_name || route.short_name}
                    shortName={route.short_name}
                    color={colorForRoute(route.short_name)}
                    checked={isGoRouteVisible(route.short_name)}
                    onChange={(checked) => toggleGoRoute(route.short_name, checked)}
                  />
                ))}
              </RouteSection>

              <RouteSection title="Custom routes" icon={<Pencil className="h-3.5 w-3.5" />}>
                {customRoutes.length === 0 ? (
                  <p className="px-2 py-2 text-xs text-slate-400">No saved custom routes yet.</p>
                ) : (
                  customRoutes.map((route) => (
                    <RouteFilterRow
                      key={route.id}
                      label={route.name || "Custom route"}
                      shortName={route.type === "train" ? "TR" : "BU"}
                      color={route.color}
                      checked={isCustomRouteVisible(route.id)}
                      onChange={(checked) => toggleCustomRoute(route.id, checked)}
                    />
                  ))
                )}
              </RouteSection>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function RouteSection({
  title,
  icon,
  children,
}: {
  title: string;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="mb-3 last:mb-0">
      <div className="mb-1.5 flex items-center gap-1.5 px-1 text-[11px] font-semibold uppercase tracking-normal text-slate-500">
        {icon}
        {title}
      </div>
      <div className="flex flex-col gap-1">{children}</div>
    </section>
  );
}

function RouteFilterRow({
  label,
  shortName,
  color,
  checked,
  onChange,
}: {
  label: string;
  shortName: string;
  color: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className={`flex cursor-pointer items-center gap-2 rounded-lg px-2 py-2 transition-colors hover:bg-slate-50 ${
      checked ? "text-slate-800" : "text-slate-400"
    }`}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.currentTarget.checked)}
        className="h-4 w-4 rounded border-slate-300 accent-[#155ba0]"
      />
      <span
        className="flex h-7 w-9 flex-shrink-0 items-center justify-center rounded-md text-[11px] font-bold text-white"
        style={{ backgroundColor: color }}
      >
        {shortName.slice(0, 3)}
      </span>
      <span className="min-w-0 flex-1 truncate text-xs font-medium">{label}</span>
    </label>
  );
}
