"use client";

import { useState, useCallback } from "react";
import { ClockIcon, CrossCircledIcon } from "@radix-ui/react-icons";
import type { Schedule } from "@/hooks/useRouteBuilder";

type ScheduleModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onSave: (schedule: Schedule) => void;
  routeName?: string;
};

export function ScheduleModal({
  isOpen,
  onClose,
  onSave,
  routeName = "New Route",
}: ScheduleModalProps) {
  const [startTime, setStartTime] = useState("06:00");
  const [endTime, setEndTime] = useState("22:00");
  const [frequency, setFrequency] = useState("30");
  const [error, setError] = useState<string | null>(null);

  const validateAndSave = useCallback(() => {
    // Validate start < end
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

    // Create schedule object
    const schedule: Schedule = {
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
    };

    onSave(schedule);
  }, [startTime, endTime, frequency, onSave]);

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
