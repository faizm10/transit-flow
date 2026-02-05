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
  toggleVariant: (id: string) => void;
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
  toggleVariant,
}: FiltersPanelProps) {
  const selectedCount = useMemo(() => {
    return selectedVariantIds.length;
  }, [selectedVariantIds]);

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 pb-4 border-b border-white/5">
        <div className="relative">
          <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500" />
          <input
            type="text"
            placeholder="Search routes..."
            value={goVariantFilterText}
            onChange={(e) => setGoVariantFilterText(e.target.value)}
            className="w-full pl-10 pr-4 py-3 text-sm bg-white/5 rounded-xl border border-white/10 text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all"
          />
        </div>

        <div className="flex gap-2 mt-3">
          <button
            onClick={() => setShowGoTrains(!showGoTrains)}
            className={`group flex-1 py-3 rounded-xl text-sm font-semibold transition-all duration-200 relative overflow-hidden ${
              showGoTrains
                ? "bg-gradient-to-r from-emerald-500/25 to-teal-500/25 text-white shadow-lg shadow-emerald-500/10"
                : "bg-white/5 text-neutral-400 hover:bg-white/10 hover:text-white"
            }`}
          >
            {showGoTrains && (
              <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/20 to-transparent pointer-events-none"></div>
            )}
            <span className="relative z-10">Trains</span>
          </button>
          <button
            onClick={() => setShowGoBuses(!showGoBuses)}
            className={`group flex-1 py-3 rounded-xl text-sm font-semibold transition-all duration-200 relative overflow-hidden ${
              showGoBuses
                ? "bg-gradient-to-r from-amber-500/25 to-orange-500/25 text-white shadow-lg shadow-amber-500/10"
                : "bg-white/5 text-neutral-400 hover:bg-white/10 hover:text-white"
            }`}
          >
            {showGoBuses && (
              <div className="absolute inset-0 bg-gradient-to-r from-amber-500/20 to-transparent pointer-events-none"></div>
            )}
            <span className="relative z-10">Buses</span>
          </button>
        </div>

        <div className="flex justify-between items-center mt-4 px-1">
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-blue-500"></div>
            <div className="text-xs font-medium text-neutral-400">
              <span className="text-white font-semibold">{selectedCount}</span> /{" "}
              {allVariantIds.length} selected
            </div>
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => setSelectedVariantIds(allVariantIds)}
              className="text-xs font-semibold text-blue-400 hover:text-blue-300 transition-colors"
            >
              Select All
            </button>
            <button
              onClick={() => setSelectedVariantIds([])}
              className="text-xs font-semibold text-neutral-400 hover:text-white transition-colors"
            >
              Clear
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto pt-2">
        {groupedGoVariants.map(({ routeShortName, items }) => (
          <div key={routeShortName} className="mb-1">
            <div className="px-4 py-2.5 text-xs font-bold text-neutral-300 bg-gradient-to-r from-white/10 to-transparent sticky top-0 backdrop-blur-sm border-b border-white/5">
              Route {routeShortName}
            </div>
            <div className="px-3 py-1 space-y-1">
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
                      className={`px-3 py-2.5 rounded-lg flex items-center gap-3 transition-all duration-200 ${
                        isSelected
                          ? "bg-blue-500/20 border border-blue-500/30"
                          : "hover:bg-white/5 border border-transparent"
                      }`}
                    >
                      <div
                        className={`w-5 h-5 rounded-md flex items-center justify-center transition-all duration-200 flex-shrink-0 ${
                          isSelected
                            ? "bg-gradient-to-br from-blue-500 to-blue-600 shadow-lg"
                            : "bg-white/5 border border-white/10 group-hover:border-white/20"
                        }`}
                      >
                        {isSelected && <CheckIcon className="w-3.5 h-3.5 text-white" />}
                      </div>
                      <span
                        className={`text-sm font-medium transition-colors ${
                          isSelected ? "text-white" : "text-neutral-300 group-hover:text-white"
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
