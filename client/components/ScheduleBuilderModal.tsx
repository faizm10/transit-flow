"use client";

import { useEffect, useMemo, useState } from "react";
import type { CustomRoute, Schedule } from "@/hooks/useRouteBuilder";
import {
  buildScheduleFromDraft,
  createScheduleDraft,
  getSchedulePreview,
  normalizeFixedDepartures,
  type ScheduleDraft,
} from "@/lib/scheduleBuilder";

export type ScheduleRouteTarget = {
  key: string;
  routeId: string;
  source: "current" | "saved";
  label: string;
  route: CustomRoute;
};

type ScheduleBuilderModalProps = {
  isOpen: boolean;
  routeTargets: ScheduleRouteTarget[];
  initialTargetKey?: string;
  onClose: () => void;
  onSave: (target: ScheduleRouteTarget, schedule: Schedule | undefined) => void;
};

export function ScheduleBuilderModal({
  isOpen,
  routeTargets,
  initialTargetKey,
  onClose,
  onSave,
}: ScheduleBuilderModalProps) {
  const fallbackTarget = routeTargets[0] ?? null;
  const initialTarget =
    routeTargets.find((target) => target.key === initialTargetKey) ?? fallbackTarget;

  const [selectedTargetKey, setSelectedTargetKey] = useState(initialTarget?.key ?? "");
  const [draft, setDraft] = useState<ScheduleDraft>(() =>
    createScheduleDraft(initialTarget?.route.schedule),
  );

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  const selectedTarget =
    routeTargets.find((target) => target.key === selectedTargetKey) ?? fallbackTarget;
  const preview = useMemo(() => getSchedulePreview(draft), [draft]);
  const existingSummary = useMemo(
    () => (selectedTarget ? buildExistingScheduleSummary(selectedTarget.route) : null),
    [selectedTarget],
  );

  if (!isOpen) return null;

  const fixedPreview =
    draft.mode === "fixed" ? normalizeFixedDepartures(draft.fixedText) : preview.departures;
  const hasTargets = routeTargets.length > 0;

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center">
      <button
        type="button"
        aria-label="Close schedule builder"
        onClick={onClose}
        className="absolute inset-0 bg-slate-950/45 backdrop-blur-sm"
      />

      <div
        className="relative z-10 flex max-h-[86vh] w-[960px] max-w-[94vw] flex-col overflow-hidden rounded-[28px] border border-white/50 bg-[rgba(248,250,252,0.97)] text-slate-900 shadow-[0_30px_80px_rgba(15,23,42,0.28)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="border-b border-slate-200 px-5 py-4">
          <div className="text-[10px] font-semibold uppercase tracking-[0.24em] text-slate-500">
            Schedule Builder
          </div>
          <div className="mt-2 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h3 className="text-lg font-semibold text-slate-950">
                {selectedTarget?.route.name ?? "Choose a route"}
              </h3>
              <p className="mt-1 text-sm text-slate-600">
                Build a frequency pattern or enter fixed departures.
              </p>
            </div>
            <div className="w-full max-w-[320px]">
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                Route
              </div>
              <select
                value={selectedTarget?.key ?? ""}
                onChange={(event) => {
                  const nextTarget = routeTargets.find((target) => target.key === event.target.value);
                  setSelectedTargetKey(event.target.value);
                  setDraft(createScheduleDraft(nextTarget?.route.schedule));
                }}
                disabled={!hasTargets}
                className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-200 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
              >
                {routeTargets.map((target) => (
                  <option key={target.key} value={target.key}>
                    {target.source === "current" ? "Current route" : "Saved route"} · {target.label}
                  </option>
                ))}
                {!hasTargets && <option value="">No routes available</option>}
              </select>
            </div>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {!selectedTarget || !existingSummary ? (
            <div className="rounded-[24px] border border-slate-200 bg-white p-6 text-sm text-slate-500 shadow-[0_10px_30px_rgba(15,23,42,0.06)]">
              Create or save a route first, then add a schedule here.
            </div>
          ) : (
            <div className="grid gap-5 lg:grid-cols-[340px_minmax(0,1fr)]">
              <div className="space-y-4">
                <SummaryCard
                  route={selectedTarget.route}
                  source={selectedTarget.source}
                  existingSummary={existingSummary}
                />

                <div className="flex gap-2 rounded-[20px] border border-slate-200 bg-white p-1">
                  <TabButton
                    active={draft.mode === "frequency"}
                    label="Frequency"
                    onClick={() => setDraft((prev) => ({ ...prev, mode: "frequency" }))}
                  />
                  <TabButton
                    active={draft.mode === "fixed"}
                    label="Fixed Times"
                    onClick={() => setDraft((prev) => ({ ...prev, mode: "fixed" }))}
                  />
                </div>

                {draft.mode === "frequency" ? (
                  <div className="space-y-4 rounded-[24px] border border-slate-200 bg-white p-4 shadow-[0_10px_30px_rgba(15,23,42,0.06)]">
                    <div>
                      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                        Service pattern
                      </div>
                      <div className="mt-1 text-sm text-slate-600">
                        Use one simple repeating service rule for the selected days.
                      </div>
                    </div>

                    <label className="block">
                      <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                        Applies to
                      </div>
                      <select
                        value={draft.frequency.dayGroup}
                        onChange={(event) =>
                          setDraft((prev) => ({
                            ...prev,
                            frequency: {
                              ...prev.frequency,
                              dayGroup: event.target.value as ScheduleDraft["frequency"]["dayGroup"],
                            },
                          }))
                        }
                        className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-200"
                      >
                        <option value="weekday">Weekdays</option>
                        <option value="weekend">Weekends</option>
                        <option value="all">Every day</option>
                      </select>
                    </label>

                    <div className="grid grid-cols-2 gap-3">
                      <FieldTime
                        label="Start time"
                        value={draft.frequency.startTime}
                        onChange={(value) =>
                          setDraft((prev) => ({
                            ...prev,
                            frequency: { ...prev.frequency, startTime: value },
                          }))
                        }
                      />
                      <FieldTime
                        label="End time"
                        value={draft.frequency.endTime}
                        onChange={(value) =>
                          setDraft((prev) => ({
                            ...prev,
                            frequency: { ...prev.frequency, endTime: value },
                          }))
                        }
                      />
                    </div>

                    <label className="block">
                      <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                        Headway (minutes)
                      </div>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={draft.frequency.intervalMinutes === 0 ? "" : String(draft.frequency.intervalMinutes)}
                        onChange={(event) =>
                          setDraft((prev) => ({
                            ...prev,
                            frequency: {
                              ...prev.frequency,
                              intervalMinutes:
                                event.target.value.trim() === ""
                                  ? 0
                                  : Number(event.target.value.replace(/[^\d]/g, "")),
                            },
                          }))
                        }
                        placeholder="30"
                        className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-200"
                      />
                    </label>
                  </div>
                ) : (
                  <div className="space-y-4 rounded-[24px] border border-slate-200 bg-white p-4 shadow-[0_10px_30px_rgba(15,23,42,0.06)]">
                    <div>
                      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                        Fixed departures
                      </div>
                      <div className="mt-1 text-sm text-slate-600">
                        Enter one departure per line or separate values with commas.
                      </div>
                    </div>

                    <textarea
                      value={draft.fixedText}
                      onChange={(event) =>
                        setDraft((prev) => ({ ...prev, fixedText: event.target.value }))
                      }
                      placeholder="06:00&#10;06:30&#10;07:00"
                      className="h-72 w-full rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-200"
                    />
                  </div>
                )}
              </div>

              <div className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <InfoCard
                    label="Schedule type"
                    value={draft.mode === "frequency" ? "Frequency" : "Fixed"}
                  />
                  <InfoCard label="Preview departures" value={String(preview.departures.length)} />
                </div>

                <div className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-[0_10px_30px_rgba(15,23,42,0.06)]">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                    Preview
                  </div>
                  <div className="mt-2 text-sm text-slate-600">{preview.summary}</div>
                  {preview.validationError ? (
                    <div className="mt-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                      {preview.validationError}
                    </div>
                  ) : (
                    <div className="mt-4 grid max-h-80 grid-cols-3 gap-2 overflow-y-auto">
                      {fixedPreview.length === 0 ? (
                        <div className="col-span-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
                          No departures yet.
                        </div>
                      ) : (
                        fixedPreview.map((time) => (
                          <div
                            key={time}
                            className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-center text-sm text-slate-800"
                          >
                            {time}
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 px-5 py-4">
          <button
            type="button"
            onClick={() => setDraft(createScheduleDraft(selectedTarget?.route.schedule))}
            disabled={!selectedTarget}
            className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Reset
          </button>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                if (!selectedTarget) return;
                const nextSchedule = buildScheduleFromDraft(draft);
                if (draft.mode === "fixed" && draft.fixedText.trim().length > 0 && !nextSchedule) {
                  return;
                }
                if (draft.mode === "frequency" && preview.validationError) {
                  return;
                }
                onSave(selectedTarget, nextSchedule);
              }}
              disabled={!selectedTarget}
              className="rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function TabButton({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 rounded-2xl px-3 py-2 text-sm font-semibold transition ${
        active ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"
      }`}
    >
      {label}
    </button>
  );
}

function FieldTime({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
        {label}
      </div>
      <input
        type="time"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-200"
      />
    </label>
  );
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[20px] border border-slate-200 bg-white p-4 shadow-[0_10px_24px_rgba(15,23,42,0.06)]">
      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
        {label}
      </div>
      <div className="mt-2 text-lg font-semibold text-slate-950">{value}</div>
    </div>
  );
}

function SummaryCard({
  route,
  source,
  existingSummary,
}: {
  route: CustomRoute;
  source: "current" | "saved";
  existingSummary: ReturnType<typeof buildExistingScheduleSummary>;
}) {
  if (!existingSummary) return null;

  return (
    <div className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-[0_10px_30px_rgba(15,23,42,0.06)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
            Existing schedule
          </div>
          <div className="mt-1 text-sm font-semibold text-slate-950">{route.name}</div>
          <div className="mt-1 text-sm text-slate-600">
            {source === "current" ? "Current route" : "Saved route"} · {route.stops.length} stops
          </div>
        </div>
        <div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-700">
          {existingSummary.type}
        </div>
      </div>

      <div className="mt-4 grid gap-2">
        {existingSummary.lines.map((line) => (
          <div
            key={line.label}
            className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm"
          >
            <span className="text-slate-500">{line.label}</span>
            <span className="text-right font-medium text-slate-900">{line.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function buildExistingScheduleSummary(route: CustomRoute) {
  if (!route.schedule) {
    return {
      type: "No schedule",
      lines: [
        { label: "Status", value: "No schedule saved yet" },
        { label: "Stops", value: `${route.stops.length}` },
      ],
    };
  }

  if (route.schedule.type === "fixed") {
    const departures = Array.from(new Set(route.schedule.departures)).sort();
    const sample = departures.slice(0, 4).join(", ");
    return {
      type: "Fixed Times",
      lines: [
        { label: "Departures", value: `${departures.length}` },
        { label: "Sample", value: sample || "None" },
      ],
    };
  }

  const draft = createScheduleDraft(route.schedule);
  const preview = getSchedulePreview(draft);
  const dayLabel =
    draft.frequency.dayGroup === "all"
      ? "Every day"
      : draft.frequency.dayGroup === "weekend"
        ? "Weekend"
        : "Weekday";

  return {
    type: "Frequency",
    lines: [
      { label: "Days", value: dayLabel },
      {
        label: "Service span",
        value: `${draft.frequency.startTime} - ${draft.frequency.endTime}`,
      },
      { label: "Headway", value: `${draft.frequency.intervalMinutes} min` },
      { label: "Preview", value: `${preview.departures.length} departures` },
    ],
  };
}
