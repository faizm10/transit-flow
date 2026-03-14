"use client";

import { useMemo } from "react";
import { MagnifyingGlassIcon, CheckIcon } from "@radix-ui/react-icons";

type GroupedVariant = {
  displayKey: string;
  variantIds: string[];
  labels: string[];
};

type FiltersPanelProps = {
  goVariantFilterText: string;
  setGoVariantFilterText: (text: string) => void;
  showGoBuses: boolean;
  setShowGoBuses: (value: boolean) => void;
  showGoTrains: boolean;
  setShowGoTrains: (value: boolean) => void;
  groupedGoVariants: Array<{ routeShortName: string; items: GroupedVariant[] }>;
  selectedVariantIds: string[];
  allVariantIds: string[];
  setVariantGroup: (variantIds: string[], enabled: boolean) => void;
  setSelectedVariantIds: (ids: string[]) => void;

};

export function FiltersPanel({
  goVariantFilterText,
  setGoVariantFilterText,
  showGoBuses,
  setShowGoBuses,
  showGoTrains,
  setShowGoTrains,
  groupedGoVariants,
  selectedVariantIds,
  allVariantIds,
  setVariantGroup,
  setSelectedVariantIds,
}: FiltersPanelProps) {
  const selectedCount = useMemo(() => {
    return selectedVariantIds.length;
  }, [selectedVariantIds]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="space-y-3 rounded-[24px] border border-white/45 bg-white/42 p-4 shadow-[var(--glass-shadow-soft)]">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.24em] text-slate-500">
            Route variants
          </div>
          <p className="mt-2 text-xs text-slate-700">
            Narrow active services by family, mode, or specific branch.
          </p>
        </div>
        <div className="relative">
          <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search routes..."
            value={goVariantFilterText}
            onChange={(e) => setGoVariantFilterText(e.target.value)}
            className="w-full rounded-2xl border border-white/45 bg-white/72 py-2.5 pl-10 pr-4 text-xs text-slate-900 placeholder-slate-400 transition-all focus:border-sky-300 focus:outline-none focus:ring-4 focus:ring-sky-100/60"
          />
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => setShowGoTrains(!showGoTrains)}
            className={`flex-1 rounded-2xl border py-2 text-xs font-semibold transition-all ${
              showGoTrains
                ? "border-sky-200 bg-sky-100/85 text-sky-800"
                : "border-white/45 bg-white/55 text-slate-600 hover:bg-white/75"
            }`}
          >
            Trains
          </button>
          <button
            onClick={() => setShowGoBuses(!showGoBuses)}
            className={`flex-1 rounded-2xl border py-2 text-xs font-semibold transition-all ${
              showGoBuses
                ? "border-sky-200 bg-sky-100/85 text-sky-800"
                : "border-white/45 bg-white/55 text-slate-600 hover:bg-white/75"
            }`}
          >
            Buses
          </button>
        </div>

        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-2">
            <div className="h-1.5 w-1.5 rounded-full bg-sky-600"></div>
            <div className="text-xs font-medium text-slate-600">
              <span className="font-semibold text-slate-900">{selectedCount}</span> /{" "}
              {allVariantIds.length} selected
            </div>
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => setSelectedVariantIds(allVariantIds)}
              className="text-xs font-semibold text-sky-700 transition-colors hover:text-sky-900"
            >
              Select All
            </button>
            <button
              onClick={() => setSelectedVariantIds([])}
              className="text-xs font-semibold text-slate-500 transition-colors hover:text-slate-800"
            >
              Clear
            </button>
          </div>
        </div>
      </div>

      <div className="mt-4 min-h-0 flex-1 overflow-y-auto pr-1">
        {groupedGoVariants.map(({ routeShortName, items }) => (
          <div
            key={routeShortName}
            className="mb-3 overflow-hidden rounded-[24px] border border-white/45 bg-white/36 shadow-[var(--glass-shadow-soft)]"
          >
            <div className="sticky top-0 border-b border-white/40 bg-white/70 px-4 py-2.5 text-[11px] font-semibold text-slate-700 backdrop-blur-xl">
              Route {routeShortName}
            </div>
            <div className="space-y-1 px-3 py-2.5">
              {items.map(({ displayKey, variantIds }) => {
                const isSelected = variantIds.every((id) =>
                  selectedVariantIds.includes(id)
                );
                return (
                  <button
                    key={displayKey}
                    onClick={() => setVariantGroup(variantIds, !isSelected)}
                    className="w-full text-left group"
                  >
                    <div
                      className={`flex items-center gap-3 rounded-2xl border px-3 py-2.5 transition-all ${
                        isSelected
                          ? "border-sky-200 bg-sky-100/75"
                          : "border-transparent bg-white/20 hover:bg-white/50"
                      }`}
                    >
                      <div
                        className={`flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-md transition-all ${
                          isSelected
                            ? "bg-sky-600"
                            : "border border-white/55 bg-white/80 group-hover:border-slate-300"
                        }`}
                      >
                        {isSelected && <CheckIcon className="w-3.5 h-3.5 text-white" />}
                      </div>
                      <span
                        className={`text-xs font-medium transition-colors ${
                          isSelected ? "text-slate-950" : "text-slate-700 group-hover:text-slate-950"
                        }`}
                      >
                        {displayKey}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
