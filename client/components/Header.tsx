"use client";

import {
  CubeIcon,
  GlobeIcon,
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
      <div className="flex items-center gap-1 p-1.5 rounded-2xl bg-neutral-900/90 backdrop-blur-xl border border-white/10 shadow-2xl shadow-black/50">
        {/* Networks Button */}
        <button
          onClick={() => onPanelToggle("networks")}
          className={`group relative px-5 py-2.5 rounded-xl text-xs font-bold transition-all duration-200 flex items-center gap-2.5 overflow-hidden ${
            activePanel === "networks"
              ? "text-white"
              : "text-neutral-400 hover:text-white"
          }`}
        >
          {activePanel === "networks" && (
            <div className="absolute inset-0 bg-gradient-to-r from-blue-600 to-blue-500 shadow-lg shadow-blue-500/50"></div>
          )}
          <LayersIcon className={`w-4 h-4 relative z-10 ${activePanel === "networks" ? "" : "group-hover:scale-110 transition-transform"}`} />
          <span className="relative z-10">Networks</span>
        </button>

        {/* Filters Button */}
        <button
          onClick={() => onPanelToggle("filters")}
          className={`group relative px-5 py-2.5 rounded-xl text-xs font-bold transition-all duration-200 flex items-center gap-2.5 overflow-hidden ${
            activePanel === "filters"
              ? "text-white"
              : "text-neutral-400 hover:text-white"
          }`}
        >
          {activePanel === "filters" && (
            <div className="absolute inset-0 bg-gradient-to-r from-cyan-600 to-blue-500 shadow-lg shadow-cyan-500/50"></div>
          )}
          <MixerHorizontalIcon className={`w-4 h-4 relative z-10 ${activePanel === "filters" ? "" : "group-hover:scale-110 transition-transform"}`} />
          <span className="relative z-10">Filters</span>
        </button>

        {/* Divider */}
        <div className="w-px h-6 bg-gradient-to-b from-transparent via-white/20 to-transparent mx-1"></div>

        {/* Route Builder Button */}
        <button
          onClick={() => onPanelToggle("builder")}
          className={`group relative px-5 py-2.5 rounded-xl text-xs font-bold transition-all duration-200 flex items-center gap-2.5 overflow-hidden ${
            activePanel === "builder"
              ? "text-white"
              : "text-neutral-400 hover:text-white"
          }`}
        >
          {activePanel === "builder" && (
            <div className="absolute inset-0 bg-gradient-to-r from-purple-600 to-pink-500 shadow-lg shadow-purple-500/50"></div>
          )}
          <PlusIcon className={`w-4 h-4 relative z-10 ${activePanel === "builder" ? "" : "group-hover:scale-110 transition-transform"}`} />
          <span className="relative z-10">Route Builder</span>
        </button>

        {/* Simulation Button */}
        <button
          onClick={() => onPanelToggle("simulation")}
          className={`group relative px-5 py-2.5 rounded-xl text-xs font-bold transition-all duration-200 flex items-center gap-2.5 overflow-hidden ${
            activePanel === "simulation"
              ? "text-white"
              : "text-neutral-400 hover:text-white"
          }`}
        >
          {activePanel === "simulation" && (
            <div className="absolute inset-0 bg-gradient-to-r from-amber-600 to-orange-500 shadow-lg shadow-amber-500/50"></div>
          )}
          <TimerIcon className={`w-4 h-4 relative z-10 ${activePanel === "simulation" ? "" : "group-hover:scale-110 transition-transform"}`} />
          <span className="relative z-10">Simulation</span>
        </button>

        {/* Schedule Button */}
        <button
          onClick={() => onPanelToggle("schedule")}
          className={`group relative px-5 py-2.5 rounded-xl text-xs font-bold transition-all duration-200 flex items-center gap-2.5 overflow-hidden ${
            activePanel === "schedule"
              ? "text-white"
              : "text-neutral-400 hover:text-white"
          }`}
        >
          {activePanel === "schedule" && (
            <div className="absolute inset-0 bg-gradient-to-r from-indigo-600 to-sky-500 shadow-lg shadow-indigo-500/50"></div>
          )}
          <RocketIcon className={`w-4 h-4 relative z-10 ${activePanel === "schedule" ? "" : "group-hover:scale-110 transition-transform"}`} />
          <span className="relative z-10">Schedule</span>
        </button>
      </div>
    </header>
  );
}
