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
      {/* Backdrop overlay */}
      <div
        className={`absolute inset-0 bg-black/40 backdrop-blur-sm z-10 transition-opacity duration-300 ${
          isOpen ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
        onClick={onClose}
      />

      {/* Side panel */}
      <div
        className={`absolute top-0 left-0 h-full z-20 transition-all duration-300 transform ${
          isOpen ? "translate-x-0" : "-translate-x-full"
        } w-96 bg-gradient-to-br from-neutral-900/95 to-neutral-950/95 backdrop-blur-xl border-r border-white/10 shadow-2xl`}
      >
        <div className="flex flex-col h-full">
          {/* Header with gradient accent */}
          <header className="relative flex items-center justify-between p-5 border-b border-white/10 bg-gradient-to-r from-white/5 to-transparent">
            <div className="absolute top-0 left-0 w-1 h-full bg-gradient-to-b from-blue-500 via-purple-500 to-pink-500"></div>
            <h2 className="text-base font-bold text-white pl-3 tracking-wide">
              {title}
            </h2>
            <button
              onClick={onClose}
              className="p-2 rounded-xl text-neutral-400 hover:bg-white/10 hover:text-white transition-all duration-200 hover:rotate-90"
            >
              <Cross1Icon className="w-4 h-4" />
            </button>
          </header>

          {/* Content area with custom scrollbar */}
          <div className="flex-1 overflow-y-auto p-5 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent hover:scrollbar-thumb-white/20">
            {children}
          </div>
        </div>
      </div>
    </>
  );
}
