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
        } w-96 bg-white border-r border-neutral-200 shadow-xl`}
      >
        <div className="flex flex-col h-full">
          {/* Header */}
          <header className="flex items-center justify-between p-5 border-b border-neutral-200 bg-neutral-50">
            <h2 className="text-base font-semibold text-neutral-900">
              {title}
            </h2>
            <button
              onClick={onClose}
              className="p-2 rounded-lg text-neutral-500 hover:bg-neutral-200 hover:text-neutral-900 transition-all duration-200"
            >
              <Cross1Icon className="w-4 h-4" />
            </button>
          </header>

          {/* Content area */}
          <div className="flex-1 overflow-y-auto p-5">
            {children}
          </div>
        </div>
      </div>
    </>
  );
}
