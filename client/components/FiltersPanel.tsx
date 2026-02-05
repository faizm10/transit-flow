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
      <div className="px-4 pb-4 border-b border-neutral-200">
        <div className="relative">
          <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
          <input
            type="text"
            placeholder="Search routes..."
            value={goVariantFilterText}
            onChange={(e) => setGoVariantFilterText(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 text-sm bg-white rounded-lg border border-neutral-300 text-neutral-900 placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-500 transition-all"
          />
        </div>

        <div className="flex gap-2 mt-3">
          <button
            onClick={() => setShowGoTrains(!showGoTrains)}
            className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all border ${
              showGoTrains
                ? "bg-blue-100 text-blue-700 border-blue-200"
                : "bg-white text-neutral-600 border-neutral-300 hover:bg-neutral-50"
            }`}
          >
            Trains
          </button>
          <button
            onClick={() => setShowGoBuses(!showGoBuses)}
            className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all border ${
              showGoBuses
                ? "bg-blue-100 text-blue-700 border-blue-200"
                : "bg-white text-neutral-600 border-neutral-300 hover:bg-neutral-50"
            }`}
          >
            Buses
          </button>
        </div>

        <div className="flex justify-between items-center mt-4 px-1">
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-blue-600"></div>
            <div className="text-xs font-medium text-neutral-600">
              <span className="text-neutral-900 font-semibold">{selectedCount}</span> /{" "}
              {allVariantIds.length} selected
            </div>
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => setSelectedVariantIds(allVariantIds)}
              className="text-xs font-semibold text-blue-600 hover:text-blue-700 transition-colors"
            >
              Select All
            </button>
            <button
              onClick={() => setSelectedVariantIds([])}
              className="text-xs font-semibold text-neutral-500 hover:text-neutral-700 transition-colors"
            >
              Clear
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto pt-2">
        {groupedGoVariants.map(({ routeShortName, items }) => (
          <div key={routeShortName} className="mb-1">
            <div className="px-4 py-2.5 text-xs font-semibold text-neutral-700 bg-neutral-50 sticky top-0 border-b border-neutral-200">
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
                      className={`px-3 py-2.5 rounded-lg flex items-center gap-3 transition-all border ${
                        isSelected
                          ? "bg-blue-50 border-blue-200"
                          : "hover:bg-neutral-50 border-transparent"
                      }`}
                    >
                      <div
                        className={`w-5 h-5 rounded-md flex items-center justify-center transition-all flex-shrink-0 ${
                          isSelected
                            ? "bg-blue-600"
                            : "bg-white border border-neutral-300 group-hover:border-neutral-400"
                        }`}
                      >
                        {isSelected && <CheckIcon className="w-3.5 h-3.5 text-white" />}
                      </div>
                      <span
                        className={`text-sm font-medium transition-colors ${
                          isSelected ? "text-blue-900" : "text-neutral-700 group-hover:text-neutral-900"
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
