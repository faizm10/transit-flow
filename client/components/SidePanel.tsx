"use client";

import { Cross1Icon } from "@radix-ui/react-icons";

type SidePanelProps = {
  title: string;
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
};

export function SidePanel({
  title,
  isOpen,
  onClose,
  children,
}: SidePanelProps) {
  return (
    <>
      <div
        className={`absolute inset-0 z-20 bg-slate-900/18 backdrop-blur-[2px] transition-opacity duration-300 md:hidden ${
          isOpen ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        onClick={onClose}
      />

      <aside
        className={`absolute z-30 transition-all duration-300 ${
          isOpen
            ? "pointer-events-auto translate-y-0 opacity-100 md:translate-x-0"
            : "pointer-events-none translate-y-6 opacity-0 md:-translate-x-8"
        } inset-x-3 bottom-20 top-[72px] md:inset-x-auto md:bottom-auto md:left-[104px] md:top-1/2 md:max-h-[calc(100vh-3rem)] md:w-[380px] md:-translate-y-1/2 lg:left-[112px] lg:w-[400px]`}
      >
        <div className="flex h-full flex-col overflow-hidden rounded-[32px] border border-white/50 bg-[var(--glass-surface-strong)] shadow-[var(--glass-shadow)] backdrop-blur-2xl">
          <header className="flex items-start justify-between gap-3 border-b border-white/40 px-5 py-5">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.28em] text-slate-500">
                Inspector
              </div>
              <h2 className="mt-2 text-lg font-semibold text-slate-950">{title}</h2>
            </div>
            <button
              onClick={onClose}
              className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-white/45 bg-white/40 text-slate-500 transition hover:bg-white/70 hover:text-slate-950"
              aria-label={`Close ${title}`}
            >
              <Cross1Icon className="h-4 w-4" />
            </button>
          </header>

          <div className="min-h-0 flex-1 overflow-hidden px-5 py-5">{children}</div>
        </div>
      </aside>
    </>
  );
}
