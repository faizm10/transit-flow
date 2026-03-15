"use client";

import { useMemo } from "react";
import type { CustomRoute } from "@/hooks/useRouteBuilder";
import {
  POPULATION_CENTERS,
  summarizeScenario,
} from "@/lib/plannerAnalytics";

type PlannerPanelProps = {
  currentRoutes: CustomRoute[];
  showDemandLayer: boolean;
  onToggleDemandLayer: () => void;
};

export function PlannerPanel({
  currentRoutes,
  showDemandLayer,
  onToggleDemandLayer,
}: PlannerPanelProps) {
  const currentSummary = useMemo(() => summarizeScenario(currentRoutes), [currentRoutes]);
  const populationFormatter = useMemo(
    () => new Intl.NumberFormat("en-CA", { notation: "compact", maximumFractionDigits: 1 }),
    [],
  );
  const percentFormatter = useMemo(
    () => new Intl.NumberFormat("en-CA", { maximumFractionDigits: 1 }),
    [],
  );

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-y-auto overscroll-contain pr-1 pb-2">
      <section className="rounded-[22px] border border-white/45 bg-white/38 p-3.5 shadow-[var(--glass-shadow-soft)]">
        <div className="mb-2.5 text-[10px] font-semibold uppercase tracking-[0.24em] text-slate-500">
          Network summary
        </div>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          <SummaryCard label="Routes" value={String(currentSummary.routeCount)} />
          <SummaryCard label="Stops" value={String(currentSummary.stopCount)} />
          <SummaryCard label="Service hours" value={String(currentSummary.totalServiceHours)} />
          <SummaryCard
            label="Avg headway"
            value={
              currentSummary.averageHeadwayMinutes != null
                ? `${currentSummary.averageHeadwayMinutes} min`
                : "—"
            }
          />
          <SummaryCard label="Direct links" value={String(currentSummary.directConnections)} />
          <SummaryCard
            label="Population served"
            value={populationFormatter.format(currentSummary.populationServed)}
          />
          <SummaryCard
            label="Cities served"
            value={String(currentSummary.citiesServed)}
          />
          <SummaryCard
            label="Coverage"
            value={`${percentFormatter.format(currentSummary.populationCoveragePercent)}%`}
          />
        </div>
      </section>

      <section className="rounded-[22px] border border-white/45 bg-white/38 p-3.5 shadow-[var(--glass-shadow-soft)]">
        <div className="mb-2.5 flex items-center justify-between">
          <div className="text-[10px] font-semibold uppercase tracking-[0.24em] text-slate-500">
            Demand layer
          </div>
          <button
            onClick={onToggleDemandLayer}
            className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
              showDemandLayer
                ? "bg-emerald-100 text-emerald-700"
                : "bg-white/70 text-slate-600"
            }`}
          >
            {showDemandLayer ? "On" : "Off"}
          </button>
        </div>
        <div className="space-y-2">
          <div className="rounded-2xl border border-white/40 bg-white/55 px-3 py-2.5 text-[13px] leading-5 text-slate-700">
            {populationFormatter.format(currentSummary.populationServed)} of{" "}
            {populationFormatter.format(currentSummary.trackedPopulation)} residents served across{" "}
            {currentSummary.citiesServed} of {POPULATION_CENTERS.length} tracked cities.
          </div>
          <div className="grid gap-2 lg:grid-cols-2">
            <div className="rounded-2xl border border-white/40 bg-white/55 px-3 py-2.5">
              <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-emerald-600">
                Top served
              </div>
              <div className="space-y-1.5">
                {currentSummary.topServedCities.length === 0 ? (
                  <div className="text-xs text-slate-500">No cities served yet.</div>
                ) : (
                  currentSummary.topServedCities.map((city) => (
                    <CityRow
                      key={city.id}
                      name={city.name}
                      population={populationFormatter.format(city.population)}
                    />
                  ))
                )}
              </div>
            </div>
            <div className="rounded-2xl border border-white/40 bg-white/55 px-3 py-2.5">
              <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">
                Largest gaps
              </div>
              <div className="space-y-1.5">
                {currentSummary.topUnservedCities.length === 0 ? (
                  <div className="text-xs text-slate-500">All tracked cities are covered.</div>
                ) : (
                  currentSummary.topUnservedCities.map((city) => (
                    <CityRow
                      key={city.id}
                      name={city.name}
                      population={populationFormatter.format(city.population)}
                    />
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-[22px] border border-white/45 bg-white/38 p-3.5 shadow-[var(--glass-shadow-soft)]">
        <div className="mb-2.5 text-[10px] font-semibold uppercase tracking-[0.24em] text-slate-500">
          Service diagnostics
        </div>
        <div className="space-y-1.5">
          {currentSummary.warnings.length === 0 ? (
            <div className="rounded-2xl border border-white/40 bg-white/55 px-3 py-2.5 text-[13px] text-slate-600">
              No major service warnings in this network.
            </div>
          ) : (
            currentSummary.warnings.map((warning) => (
              <div
                key={`${warning.routeId}-${warning.message}`}
                className="rounded-2xl border border-white/40 bg-white/55 px-3 py-2.5 text-[13px]"
              >
                <div className="font-semibold text-slate-900">{warning.routeName}</div>
                <div className="mt-0.5 text-slate-600">{warning.message}</div>
              </div>
            ))
          )}
        </div>
      </section>

      <section className="rounded-[22px] border border-white/45 bg-white/38 p-3.5 shadow-[var(--glass-shadow-soft)]">
        <div className="mb-2.5 text-[10px] font-semibold uppercase tracking-[0.24em] text-slate-500">
          Corridor diagnostics
        </div>
        <div className="space-y-1.5">
          {currentSummary.topCorridors.length === 0 ? (
            <div className="rounded-2xl border border-white/40 bg-white/55 px-3 py-2.5 text-[13px] text-slate-600">
              No overlapping corridors detected yet.
            </div>
          ) : (
            currentSummary.topCorridors.map((corridor) => (
              <div
                key={corridor.label}
                className="flex items-center justify-between rounded-2xl border border-white/40 bg-white/55 px-3 py-2.5 text-[13px]"
              >
                <span className="max-w-[70%] truncate text-slate-700">{corridor.label}</span>
                <span className="font-semibold text-slate-900">{corridor.routeCount} routes</span>
              </div>
            ))
          )}
        </div>
      </section>

      <section className="rounded-[22px] border border-white/45 bg-white/38 p-3.5 shadow-[var(--glass-shadow-soft)]">
        <div className="mb-2.5 text-[10px] font-semibold uppercase tracking-[0.24em] text-slate-500">
          Node diagnostics
        </div>
        <div className="space-y-1.5">
          {currentSummary.topNodes.length === 0 ? (
            <div className="rounded-2xl border border-white/40 bg-white/55 px-3 py-2.5 text-[13px] text-slate-600">
              Build multi-route hubs to see node diagnostics.
            </div>
          ) : (
            currentSummary.topNodes.map((node) => (
              <div
                key={node.nodeName}
                className="rounded-2xl border border-white/40 bg-white/55 px-3 py-2.5 text-[13px]"
              >
                <div className="font-semibold text-slate-900">{node.nodeName}</div>
                <div className="mt-0.5 text-slate-600">
                  {node.routeCount} routes · {node.directDestinations} direct destinations
                  {node.averageHeadwayMinutes != null ? ` · ${node.averageHeadwayMinutes} min avg` : ""}
                </div>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/40 bg-white/55 px-3 py-2.5">
      <div className="text-[9px] uppercase tracking-[0.18em] text-slate-500">{label}</div>
      <div className="mt-1.5 text-[1.05rem] font-semibold text-slate-950">{value}</div>
    </div>
  );
}

function CityRow({ name, population }: { name: string; population: string }) {
  return (
    <div className="flex items-center justify-between rounded-2xl border border-white/40 bg-white/70 px-3 py-2 text-[13px]">
      <span className="truncate text-slate-700">{name}</span>
      <span className="font-semibold text-slate-900">{population}</span>
    </div>
  );
}
