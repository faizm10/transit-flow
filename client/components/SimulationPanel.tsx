"use client";

import { CalendarIcon, ClockIcon, RocketIcon, LightningBoltIcon } from "@radix-ui/react-icons";

type SimulationPanelProps = {
  simulationDate: string;
  setSimulationDate: (date: string) => void;
  simulationStart: string;
  setSimulationStart: (time: string) => void;
  simulationEnd: string;
  setSimulationEnd: (time: string) => void;
  simulationSpeed: number;
  setSimulationSpeed: (speed: number) => void;
  simulationRoutes: string[];
  setSimulationRoutes: (routes: string[]) => void;
  simulationRouteOptions: Array<{ value: string; label: string }>;
  loadSimulation: () => void;
  simulationLoading: boolean;
  simulationError: string | null;
  clearSimulationTrackers: () => void;
  resetSimulationInputs: () => void;
};

export function SimulationPanel({
  simulationDate,
  setSimulationDate,
  simulationStart,
  setSimulationStart,
  simulationEnd,
  setSimulationEnd,
  simulationSpeed,
  setSimulationSpeed,
  simulationRoutes,
  setSimulationRoutes,
  simulationRouteOptions,
  loadSimulation,
  simulationLoading,
  simulationError,
  clearSimulationTrackers,
  resetSimulationInputs,
}: SimulationPanelProps) {
  return (
    <div className="space-y-5">
      {/* Date Input */}
      <div className="space-y-2">
        <label className="flex items-center gap-2 text-xs font-bold text-white uppercase tracking-wider">
          <CalendarIcon className="w-3.5 h-3.5 text-blue-400" />
          Simulation Date
        </label>
        <input
          type="date"
          value={simulationDate}
          onChange={(e) => setSimulationDate(e.target.value)}
          className="w-full px-4 py-3 text-sm bg-white/5 rounded-xl border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all hover:bg-white/10"
        />
      </div>

      {/* Time Range */}
      <div className="space-y-2">
        <label className="flex items-center gap-2 text-xs font-bold text-white uppercase tracking-wider">
          <ClockIcon className="w-3.5 h-3.5 text-purple-400" />
          Time Range
        </label>
        <div className="flex items-center gap-3">
          <input
            type="time"
            value={simulationStart}
            onChange={(e) => setSimulationStart(e.target.value)}
            className="flex-1 px-4 py-3 text-sm bg-white/5 rounded-xl border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500/50 transition-all hover:bg-white/10"
          />
          <div className="w-8 h-px bg-gradient-to-r from-purple-500 to-blue-500"></div>
          <input
            type="time"
            value={simulationEnd}
            onChange={(e) => setSimulationEnd(e.target.value)}
            className="flex-1 px-4 py-3 text-sm bg-white/5 rounded-xl border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500/50 transition-all hover:bg-white/10"
          />
        </div>
      </div>

      {/* Routes */}
      <div className="space-y-2">
        <label className="flex items-center gap-2 text-xs font-bold text-white uppercase tracking-wider">
          <RocketIcon className="w-3.5 h-3.5 text-green-400" />
          Select Routes
        </label>
        <div className="rounded-xl border border-white/10 bg-white/5 p-2">
          <select
            multiple
            value={simulationRoutes}
            onChange={(event) => {
              const selected = Array.from(event.target.selectedOptions).map(
                (option) => option.value
              );
              setSimulationRoutes(selected);
            }}
            className="w-full h-32 bg-transparent text-sm text-white/90 focus:outline-none"
          >
            {simulationRouteOptions.length === 0 ? (
              <option value="21">21</option>
            ) : (
              simulationRouteOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))
            )}
          </select>
          <div className="mt-2 text-[10px] text-white/45">
            Hold Cmd/Ctrl to select multiple.
          </div>
        </div>
      </div>

      {/* Speed Multiplier */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <label className="flex items-center gap-2 text-xs font-bold text-white uppercase tracking-wider">
            <LightningBoltIcon className="w-3.5 h-3.5 text-amber-400" />
            Speed Multiplier
          </label>
          <div className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-amber-500/20 to-orange-500/20 border border-amber-500/30">
            <span className="text-sm font-bold text-amber-300">{simulationSpeed}x</span>
          </div>
        </div>
        <div className="relative">
          <input
            type="range"
            min="1"
            max="1000"
            step="1"
            value={simulationSpeed}
            onChange={(e) => setSimulationSpeed(Number(e.target.value))}
            className="w-full h-2.5 bg-white/5 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-gradient-to-br [&::-webkit-slider-thumb]:from-amber-400 [&::-webkit-slider-thumb]:to-orange-500 [&::-webkit-slider-thumb]:shadow-lg [&::-webkit-slider-thumb]:shadow-amber-500/50 [&::-webkit-slider-thumb]:cursor-pointer hover:[&::-webkit-slider-thumb]:scale-110 [&::-webkit-slider-thumb]:transition-transform"
          />
          <div
            className="absolute top-0 left-0 h-2.5 bg-gradient-to-r from-amber-500/50 to-orange-500/50 rounded-full pointer-events-none"
            style={{ width: `${((simulationSpeed - 1) / 999) * 100}%` }}
          ></div>
        </div>
        <div className="flex justify-between text-xs text-neutral-500">
          <span>1x</span>
          <span>500x</span>
          <span>1000x</span>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex flex-col gap-3 pt-3">
        <button
          onClick={loadSimulation}
          disabled={simulationLoading}
          className="group relative w-full px-4 py-3.5 text-sm font-bold text-white rounded-xl transition-all duration-200 overflow-hidden disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <div className="absolute inset-0 bg-gradient-to-r from-blue-600 to-purple-600 group-hover:from-blue-500 group-hover:to-purple-500 transition-all"></div>
          <div className="absolute inset-0 bg-gradient-to-r from-blue-400/0 via-white/20 to-blue-400/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000"></div>
          <span className="relative z-10 flex items-center justify-center gap-2">
            {simulationLoading ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                Loading Simulation...
              </>
            ) : (
              <>
                <RocketIcon className="w-4 h-4" />
                Start Simulation
              </>
            )}
          </span>
        </button>

        <button
          onClick={clearSimulationTrackers}
          className="w-full px-4 py-3 text-sm font-semibold text-neutral-300 bg-white/5 rounded-xl hover:bg-white/10 hover:text-white border border-white/10 hover:border-white/20 transition-all duration-200"
        >
          Clear Simulation
        </button>
      </div>

      {/* Error Message */}
      {simulationError && (
        <div className="relative p-4 text-sm text-red-200 bg-gradient-to-r from-red-500/20 to-pink-500/20 border border-red-500/30 rounded-xl overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-r from-red-500/10 to-transparent pointer-events-none"></div>
          <p className="relative z-10 font-medium">{simulationError}</p>
        </div>
      )}
    </div>
  );
}
