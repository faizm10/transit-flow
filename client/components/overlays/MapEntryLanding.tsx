"use client";

import Link from "next/link";
import { Map, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

interface MapEntryLandingProps {
  onStartFresh: () => void;
  onUseExistingNetwork: () => void;
}

export default function MapEntryLanding({
  onStartFresh,
  onUseExistingNetwork,
}: MapEntryLandingProps) {
  return (
    <div className="pointer-events-none absolute inset-0 z-[55] flex items-center justify-center p-6">
      {/* Dim map slightly; keep chrome readable */}
      <div className="pointer-events-none absolute inset-0 bg-slate-900/35 backdrop-blur-[2px]" aria-hidden />

      <div className="pointer-events-auto relative w-full max-w-lg rounded-2xl border border-white/15 bg-white/95 p-8 shadow-2xl shadow-slate-900/20 backdrop-blur-xl">
        <p className="text-center text-xs font-semibold uppercase tracking-widest text-emerald-600">
          TransitFlow
        </p>
        <h1 className="mt-2 text-center text-2xl font-bold tracking-tight text-slate-900 sm:text-[1.65rem]">
          How do you want to begin?
        </h1>
        <p className="mx-auto mt-2 max-w-md text-center text-sm leading-relaxed text-slate-500">
          The map starts blank. Choose whether to model on an empty canvas or load the live GO Transit network.
        </p>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:gap-4">
          <Button
            type="button"
            variant="secondary"
            className="group h-auto min-h-[5.5rem] flex-1 flex-col justify-center gap-1.5 whitespace-normal rounded-xl border-2 border-slate-200 bg-white py-5 px-4 text-slate-900 shadow-sm transition-all hover:border-blue-300 hover:bg-blue-50/50"
            onClick={onStartFresh}
          >
            <span className="flex items-center justify-center gap-2 text-base font-semibold">
              <Sparkles className="size-5 text-blue-600" />
              Start fresh
            </span>
            <span className="text-center text-[11px] font-normal leading-snug text-slate-500">
              Empty map — sketch new bus or rail routes without GO lines on the canvas.
            </span>
          </Button>

          <Button
            type="button"
            variant="secondary"
            className="group h-auto min-h-[5.5rem] flex-1 flex-col justify-center gap-1.5 whitespace-normal rounded-xl border-2 border-slate-200 bg-white py-5 px-4 text-slate-900 shadow-sm transition-all hover:border-emerald-300 hover:bg-emerald-50/50"
            onClick={onUseExistingNetwork}
          >
            <span className="flex items-center justify-center gap-2 text-base font-semibold">
              <Map className="size-5 text-emerald-600" />
              Use existing network
            </span>
            <span className="text-center text-[11px] font-normal leading-snug text-slate-500">
              Show all GO lines — explore, filter, then extend lines if you want.
            </span>
          </Button>
        </div>

        <p className="mt-8 text-center text-[11px] text-slate-400">
          <Link href="/" className="text-slate-500 underline underline-offset-2 hover:text-slate-700">
            Back to home
          </Link>
        </p>
      </div>
    </div>
  );
}
