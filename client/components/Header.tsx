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

const PANELS = [
  { id: "networks", label: "Networks", shortLabel: "Net", icon: LayersIcon },
  { id: "filters", label: "Filters", shortLabel: "Filt", icon: MixerHorizontalIcon },
  { id: "builder", label: "Builder", shortLabel: "Build", icon: PlusIcon },
  { id: "simulation", label: "Simulation", shortLabel: "Sim", icon: TimerIcon },
  { id: "schedule", label: "Schedule", shortLabel: "Sched", icon: RocketIcon },
] as const;

export function Header({
  activePanel,
  onPanelToggle,
}: HeaderProps) {
  return (
    <>
      <div className="absolute left-3 top-4 z-20 hidden md:block lg:left-4">
        <nav className="flex flex-col gap-2 rounded-[30px] border border-white/45 bg-[var(--glass-surface)] p-2 shadow-[var(--glass-shadow)] backdrop-blur-2xl">
          {PANELS.map(({ id, label, icon: Icon }) => {
            const isActive = activePanel === id;
            return (
              <button
                key={id}
                onClick={() => onPanelToggle(id)}
                className={`group flex w-[72px] flex-col items-center gap-2 rounded-[22px] px-3 py-3 text-center transition ${
                  isActive
                    ? "bg-white/70 text-slate-950 shadow-[var(--glass-shadow-soft)]"
                    : "text-slate-600 hover:bg-white/45 hover:text-slate-950"
                }`}
              >
                <span
                  className={`flex h-10 w-10 items-center justify-center rounded-2xl border transition ${
                    isActive
                      ? "border-sky-200 bg-sky-100/80 text-sky-700"
                      : "border-white/35 bg-white/35 text-slate-500"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                </span>
                <span className="text-[11px] font-semibold">{label}</span>
              </button>
            );
          })}
        </nav>
      </div>

      <div className="absolute inset-x-0 bottom-4 z-20 px-4 md:hidden">
        <nav className="grid grid-cols-6 gap-2 rounded-[28px] border border-white/45 bg-[var(--glass-surface)] p-2 shadow-[var(--glass-shadow)] backdrop-blur-2xl">
          {PANELS.map(({ id, shortLabel, icon: Icon }) => {
            const isActive = activePanel === id;
            return (
              <button
                key={id}
                onClick={() => onPanelToggle(id)}
                className={`flex flex-col items-center gap-1 rounded-2xl px-2 py-2 transition ${
                  isActive
                    ? "bg-white/70 text-slate-950"
                    : "text-slate-600 hover:bg-white/45"
                }`}
              >
                <Icon className="h-4 w-4" />
                <span className="text-[10px] font-semibold">{shortLabel}</span>
              </button>
            );
          })}
        </nav>
      </div>
    </>
  );
}
