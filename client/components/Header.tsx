"use client";

import {
  LayersIcon,
  MixerHorizontalIcon,
  PlusIcon,
  RocketIcon,
  TimerIcon,
} from "@radix-ui/react-icons";

type HeaderProps = {
  activePanel: string | null;
  onPanelToggle: (panel: string) => void;
};

export function Header({ activePanel, onPanelToggle }: HeaderProps) {
  return (
    <header className="absolute top-6 left-1/2 -translate-x-1/2 z-20">
      <div className="flex items-center gap-1 p-1.5 rounded-xl bg-white backdrop-blur-xl border border-neutral-200 shadow-lg">
        {/* Networks Button */}
        <button
          onClick={() => onPanelToggle("networks")}
          className={`group px-4 py-2 rounded-lg text-xs font-semibold transition-all duration-200 flex items-center gap-2 ${
            activePanel === "networks"
              ? "bg-blue-100 text-blue-700"
              : "text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900"
          }`}
        >
          <LayersIcon className="w-3.5 h-3.5" />
          <span>Networks</span>
        </button>

        {/* Filters Button */}
        <button
          onClick={() => onPanelToggle("filters")}
          className={`group px-4 py-2 rounded-lg text-xs font-semibold transition-all duration-200 flex items-center gap-2 ${
            activePanel === "filters"
              ? "bg-blue-100 text-blue-700"
              : "text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900"
          }`}
        >
          <MixerHorizontalIcon className="w-3.5 h-3.5" />
          <span>Filters</span>
        </button>

        {/* Divider */}
        <div className="w-px h-6 bg-neutral-200 mx-1"></div>

        {/* Route Builder Button */}
        <button
          onClick={() => onPanelToggle("builder")}
          className={`group px-4 py-2 rounded-lg text-xs font-semibold transition-all duration-200 flex items-center gap-2 ${
            activePanel === "builder"
              ? "bg-blue-100 text-blue-700"
              : "text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900"
          }`}
        >
          <PlusIcon className="w-3.5 h-3.5" />
          <span>Route Builder</span>
        </button>

        {/* Simulation Button */}
        <button
          onClick={() => onPanelToggle("simulation")}
          className={`group px-4 py-2 rounded-lg text-xs font-semibold transition-all duration-200 flex items-center gap-2 ${
            activePanel === "simulation"
              ? "bg-blue-100 text-blue-700"
              : "text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900"
          }`}
        >
          <TimerIcon className="w-3.5 h-3.5" />
          <span>Simulation</span>
        </button>

        {/* Schedule Button */}
        <button
          onClick={() => onPanelToggle("schedule")}
          className={`group px-4 py-2 rounded-lg text-xs font-semibold transition-all duration-200 flex items-center gap-2 ${
            activePanel === "schedule"
              ? "bg-blue-100 text-blue-700"
              : "text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900"
          }`}
        >
          <RocketIcon className="w-3.5 h-3.5" />
          <span>Schedule</span>
        </button>
      </div>
    </header>
  );
}
