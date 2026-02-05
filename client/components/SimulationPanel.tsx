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
        <label className="flex items-center gap-2 text-xs font-semibold text-neutral-700 uppercase tracking-wider">
          <CalendarIcon className="w-3.5 h-3.5 text-blue-600" />
          Simulation Date
        </label>
        <input
          type="date"
          value={simulationDate}
          onChange={(e) => setSimulationDate(e.target.value)}
          className="w-full px-4 py-2.5 text-sm bg-white rounded-lg border border-neutral-300 text-neutral-900 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-500 transition-all"
        />
      </div>

      {/* Time Range */}
      <div className="space-y-2">
        <label className="flex items-center gap-2 text-xs font-semibold text-neutral-700 uppercase tracking-wider">
          <ClockIcon className="w-3.5 h-3.5 text-blue-600" />
          Time Range
        </label>
        <div className="flex items-center gap-3">
          <input
            type="time"
            value={simulationStart}
            onChange={(e) => setSimulationStart(e.target.value)}
            className="flex-1 px-4 py-2.5 text-sm bg-white rounded-lg border border-neutral-300 text-neutral-900 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-500 transition-all"
          />
          <div className="w-8 h-px bg-neutral-300"></div>
          <input
            type="time"
            value={simulationEnd}
            onChange={(e) => setSimulationEnd(e.target.value)}
            className="flex-1 px-4 py-2.5 text-sm bg-white rounded-lg border border-neutral-300 text-neutral-900 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-500 transition-all"
          />
        </div>
      </div>

      {/* Routes */}
      <div className="space-y-2">
        <label className="flex items-center gap-2 text-xs font-semibold text-neutral-700 uppercase tracking-wider">
          <RocketIcon className="w-3.5 h-3.5 text-blue-600" />
          Select Routes
        </label>
        <div className="rounded-lg border border-neutral-300 bg-white p-2">
          <select
            multiple
            value={simulationRoutes}
            onChange={(event) => {
              const selected = Array.from(event.target.selectedOptions).map(
                (option) => option.value
              );
              setSimulationRoutes(selected);
            }}
            className="w-full h-32 bg-transparent text-sm text-neutral-900 focus:outline-none"
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
          <div className="mt-2 text-[10px] text-neutral-500">
            Hold Cmd/Ctrl to select multiple.
          </div>
        </div>
      </div>

      {/* Speed Multiplier */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <label className="flex items-center gap-2 text-xs font-semibold text-neutral-700 uppercase tracking-wider">
            <LightningBoltIcon className="w-3.5 h-3.5 text-blue-600" />
            Speed Multiplier
          </label>
          <div className="px-3 py-1.5 rounded-lg bg-blue-100 border border-blue-200">
            <span className="text-sm font-bold text-blue-700">{simulationSpeed}x</span>
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
            className="w-full h-2.5 bg-neutral-200 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-blue-600 [&::-webkit-slider-thumb]:shadow-lg [&::-webkit-slider-thumb]:cursor-pointer hover:[&::-webkit-slider-thumb]:scale-110 [&::-webkit-slider-thumb]:transition-transform"
          />
          <div
            className="absolute top-0 left-0 h-2.5 bg-blue-500 rounded-full pointer-events-none"
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
          className="w-full px-4 py-3 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <span className="flex items-center justify-center gap-2">
            {simulationLoading ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                Loading...
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
          className="w-full px-4 py-3 text-sm font-semibold text-neutral-700 bg-white hover:bg-neutral-100 border border-neutral-300 rounded-lg transition-all"
        >
          Clear Simulation
        </button>
      </div>

      {/* Error Message */}
      {simulationError && (
        <div className="p-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg">
          <p className="font-medium">{simulationError}</p>
        </div>
      )}
    </div>
  );
}
