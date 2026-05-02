"use client";

import { Train, Pencil, MapPin, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

interface DesignEntryChooserProps {
  onPickExtendGO: () => void;
  onPickCreateFresh: () => void;
  onPickStationsOnly: () => void;
  onCancel: () => void;
}

export default function DesignEntryChooser({
  onPickExtendGO,
  onPickCreateFresh,
  onPickStationsOnly,
  onCancel,
}: DesignEntryChooserProps) {
  return (
    <div className="flex flex-1 flex-col gap-5 p-4">
      <div>
        <h2 className="text-[15px] font-semibold text-slate-900 leading-snug">
          How do you want to start?
        </h2>
        <p className="mt-1.5 text-xs leading-relaxed text-slate-500">
          Extend a GO bus or rail line from live data, or sketch a corridor from scratch — you can switch later using the tabs.
        </p>
      </div>

      <div className="flex flex-col gap-2.5">
        <Button
          type="button"
          variant="secondary"
          className="group h-auto w-full shrink-0 flex-col items-start gap-1 whitespace-normal rounded-xl border border-slate-200 bg-slate-50 py-3.5 px-4 text-left text-slate-900 hover:bg-slate-100"
          onClick={onPickExtendGO}
        >
          <span className="flex w-full items-center gap-2 text-sm font-semibold">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white shadow-sm ring-1 ring-slate-200">
              <Train className="h-4 w-4 text-emerald-700" />
            </span>
            Use an existing GO line
            <ArrowRight className="ml-auto size-4 shrink-0 text-slate-400 transition-transform group-hover:translate-x-0.5" />
          </span>
          <span className="pl-10 text-[11px] font-normal leading-snug text-slate-500">
            Pick a GTFS route, add stops or branches, keep GO-style schedules.
          </span>
        </Button>

        <Button
          type="button"
          variant="secondary"
          className="group h-auto w-full shrink-0 flex-col items-start gap-1 whitespace-normal rounded-xl border border-slate-200 bg-white py-3.5 px-4 text-left text-slate-900 hover:bg-slate-50"
          onClick={onPickCreateFresh}
        >
          <span className="flex w-full items-center gap-2 text-sm font-semibold">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 ring-1 ring-blue-100">
              <Pencil className="h-4 w-4 text-blue-700" />
            </span>
            Start fresh
            <ArrowRight className="ml-auto size-4 shrink-0 text-slate-400 transition-transform group-hover:translate-x-0.5" />
          </span>
          <span className="pl-10 text-[11px] font-normal leading-snug text-slate-500">
            New bus or train route — draw on the map, add stops from search.
          </span>
        </Button>
      </div>

      <button
        type="button"
        onClick={onPickStationsOnly}
        className="flex items-center gap-2 rounded-lg border border-dashed border-slate-200 px-3 py-2 text-left text-xs font-medium text-slate-600 transition-colors hover:border-slate-300 hover:bg-slate-50"
      >
        <MapPin className="h-3.5 w-3.5 text-slate-400" />
        Custom stations only
      </button>

      <div className="mt-auto border-t border-slate-100 pt-4">
        <Button type="button" variant="ghost" size="sm" className="w-full text-slate-500" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
