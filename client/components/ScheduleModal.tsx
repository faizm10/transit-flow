"use client";

import { useState, useCallback } from "react";
import { ClockIcon, CrossCircledIcon } from "@radix-ui/react-icons";
import type { Schedule } from "@/hooks/useRouteBuilder";

type OptimizerSuggestion = {
  suggestedStartTime: string;
  suggestedEndTime: string;
  suggestedIntervalMinutes: number;
  reasoning: string;
};

type ScheduleModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onSave: (schedule: Schedule) => void;
  routeName?: string;
  // Optional context for AI optimizer
  routeContext?: {
    startStopName?: string;
    endStopName?: string;
    durationMinutes?: number;
    stopsCount?: number;
    nearbyGoRouteNames?: string[];
  };
};

export function ScheduleModal({
  isOpen,
  onClose,
  onSave,
  routeName = "New Route",
  routeContext,
}: ScheduleModalProps) {
  const [startTime, setStartTime] = useState("06:00");
  const [endTime, setEndTime] = useState("22:00");
  const [frequency, setFrequency] = useState("30");
  const [error, setError] = useState<string | null>(null);

  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiSuggestion, setAiSuggestion] = useState<OptimizerSuggestion | null>(null);

  const validateAndSave = useCallback(() => {
    const [startHour, startMin] = startTime.split(":").map(Number);
    const [endHour, endMin] = endTime.split(":").map(Number);
    const startMinutes = startHour * 60 + startMin;
    const endMinutes = endHour * 60 + endMin;

    if (startMinutes >= endMinutes) {
      setError("End time must be after start time");
      return;
    }

    const freqNum = parseInt(frequency, 10);
    if (isNaN(freqNum) || freqNum <= 0 || freqNum > 180) {
      setError("Frequency must be between 1 and 180 minutes");
      return;
    }

    setError(null);

    const schedule: Schedule = {
      primary: {
        type: "frequency",
        dayConfigs: {
          monday: { enabled: true, startTime, endTime, intervalMinutes: freqNum },
          tuesday: { enabled: true, startTime, endTime, intervalMinutes: freqNum },
          wednesday: { enabled: true, startTime, endTime, intervalMinutes: freqNum },
          thursday: { enabled: true, startTime, endTime, intervalMinutes: freqNum },
          friday: { enabled: true, startTime, endTime, intervalMinutes: freqNum },
          saturday: { enabled: true, startTime, endTime, intervalMinutes: freqNum },
          sunday: { enabled: true, startTime, endTime, intervalMinutes: freqNum },
        },
      },
    };

    onSave(schedule);
  }, [startTime, endTime, frequency, onSave]);

  const handleOptimize = useCallback(async () => {
    setAiLoading(true);
    setAiError(null);
    setAiSuggestion(null);
    try {
      const res = await fetch("/api/schedule-optimizer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          routeName,
          startStopName: routeContext?.startStopName ?? "",
          endStopName: routeContext?.endStopName ?? "",
          durationMinutes: routeContext?.durationMinutes ?? 30,
          stopsCount: routeContext?.stopsCount ?? 2,
          nearbyGoRouteNames: routeContext?.nearbyGoRouteNames ?? [],
        }),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? "Optimizer failed");
      }
      const suggestion = (await res.json()) as OptimizerSuggestion;
      setAiSuggestion(suggestion);
    } catch (err) {
      setAiError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setAiLoading(false);
    }
  }, [routeName, routeContext]);

  const applySuggestion = useCallback(() => {
    if (!aiSuggestion) return;
    setStartTime(aiSuggestion.suggestedStartTime);
    setEndTime(aiSuggestion.suggestedEndTime);
    setFrequency(String(aiSuggestion.suggestedIntervalMinutes));
    setAiSuggestion(null);
  }, [aiSuggestion]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-md mx-4 rounded-xl border border-neutral-200 bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-neutral-200 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
              <ClockIcon className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <div className="text-sm font-semibold text-neutral-900">Set Schedule</div>
              <div className="text-xs text-neutral-500">{routeName}</div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="flex-shrink-0 w-8 h-8 rounded-lg hover:bg-neutral-100 flex items-center justify-center transition-all"
          >
            <CrossCircledIcon className="w-4 h-4 text-neutral-400 hover:text-neutral-700" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5">
          {/* Start Time */}
          <div className="space-y-2">
            <label className="block text-xs font-semibold text-neutral-700 uppercase tracking-wider">
              Start Time
            </label>
            <input
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className="w-full px-4 py-2.5 text-sm bg-white rounded-lg border border-neutral-300 text-neutral-900 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-500 transition-all"
            />
          </div>

          {/* End Time */}
          <div className="space-y-2">
            <label className="block text-xs font-semibold text-neutral-700 uppercase tracking-wider">
              End Time
            </label>
            <input
              type="time"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              className="w-full px-4 py-2.5 text-sm bg-white rounded-lg border border-neutral-300 text-neutral-900 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-500 transition-all"
            />
          </div>

          {/* Frequency */}
          <div className="space-y-2">
            <label className="block text-xs font-semibold text-neutral-700 uppercase tracking-wider">
              Frequency (minutes)
            </label>
            <div className="relative">
              <input
                type="number"
                value={frequency}
                onChange={(e) => setFrequency(e.target.value)}
                min="1"
                max="180"
                className="w-full px-4 py-2.5 text-sm bg-white rounded-lg border border-neutral-300 text-neutral-900 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-500 transition-all"
              />
              <div className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-neutral-500 font-medium">
                mins
              </div>
            </div>
            <div className="text-xs text-neutral-600">
              Service every {frequency} minutes
            </div>
          </div>

          {/* AI Optimizer */}
          <div className="rounded-lg border border-violet-200 bg-violet-50 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-violet-800">
                ✨ AI Schedule Optimizer
              </span>
              <button
                onClick={handleOptimize}
                disabled={aiLoading}
                className="px-3 py-1 rounded-lg bg-violet-600 text-white text-[11px] font-semibold hover:bg-violet-700 disabled:opacity-50 transition-colors"
              >
                {aiLoading ? "Thinking…" : "Optimize"}
              </button>
            </div>
            {aiError && (
              <p className="text-[11px] text-red-600">{aiError}</p>
            )}
            {aiSuggestion && (
              <div className="rounded-lg bg-white border border-violet-200 p-2 space-y-1.5">
                <p className="text-[11px] text-neutral-700 leading-relaxed">
                  {aiSuggestion.reasoning}
                </p>
                <div className="flex gap-2 text-[10px] text-violet-700 font-medium">
                  <span>{aiSuggestion.suggestedStartTime}–{aiSuggestion.suggestedEndTime}</span>
                  <span>·</span>
                  <span>Every {aiSuggestion.suggestedIntervalMinutes} min</span>
                </div>
                <button
                  onClick={applySuggestion}
                  className="w-full px-3 py-1.5 rounded-lg bg-violet-600 text-white text-[11px] font-semibold hover:bg-violet-700 transition-colors"
                >
                  Apply Suggestion
                </button>
              </div>
            )}
            {!aiSuggestion && !aiError && !aiLoading && (
              <p className="text-[11px] text-violet-600">
                Click Optimize to get AI-powered schedule recommendations based on commuter patterns.
              </p>
            )}
          </div>

          {/* Error */}
          {error && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700 font-medium">
              {error}
            </div>
          )}

          {/* Info */}
          <div className="p-3 rounded-lg bg-blue-50 border border-blue-200 text-xs text-blue-700">
            Schedule will apply to all days of the week
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center gap-3 border-t border-neutral-200 px-6 py-4 bg-neutral-50">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2.5 rounded-lg bg-white text-sm font-semibold text-neutral-700 hover:bg-neutral-100 border border-neutral-300 transition-all"
          >
            Cancel
          </button>
          <button
            onClick={validateAndSave}
            className="flex-1 px-4 py-2.5 rounded-lg bg-blue-600 text-sm font-semibold text-white hover:bg-blue-700 transition-all shadow-sm"
          >
            Save Schedule
          </button>
        </div>
      </div>
    </div>
  );
}
