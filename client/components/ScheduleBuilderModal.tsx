"use client";

import { useEffect, useMemo, useState } from "react";
import type { CustomRoute, Schedule } from "@/hooks/useRouteBuilder";
import { hasScheduleDirection, supportsBidirectionalSchedule } from "@/hooks/useRouteBuilder";
import {
  buildScheduleFromDraft,
  createScheduleDraft,
  getDirectionDraft,
  getDirectionPreview,
  getExistingDirectionSummary,
  normalizeFixedDepartures,
  updateDirectionDraft,
  type DirectionDraft,
  type ScheduleDraft,
} from "@/lib/scheduleBuilder";

export type ScheduleRouteTarget = {
  key: string;
  routeId: string;
  source: "current" | "saved";
  label: string;
  route: CustomRoute;
};

type GoVariantOption = {
  value: string;
  label: string;
  routeShortName?: string;
};

type GoVariantLoadResult = {
  schedule?: Schedule;
  stopTimings?: unknown[];
  timedStopCount?: number;
  routeLabel?: string;
};

type PendingGoSelection = {
  variantId: string;
  label: string;
};

type ScheduleBuilderModalProps = {
  isOpen: boolean;
  routeTargets: ScheduleRouteTarget[];
  initialTargetKey?: string;
  goVariantOptions?: GoVariantOption[];
  getGoVariantData?: (
    variantId: string,
  ) => Promise<GoVariantLoadResult | undefined> | GoVariantLoadResult | undefined;
  onLoadGoVariant?: (
    variantId: string,
    label: string,
    routeShortName?: string,
  ) => Promise<GoVariantLoadResult | undefined> | GoVariantLoadResult | undefined;
  onClose: () => void;
  onSave: (target: ScheduleRouteTarget, schedule: Schedule | undefined) => void;
};

export function ScheduleBuilderModal({
  isOpen,
  routeTargets,
  initialTargetKey,
  goVariantOptions = [],
  getGoVariantData,
  onLoadGoVariant,
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
  const [isLoadingGoData, setIsLoadingGoData] = useState(false);
  const [pendingGoSelection, setPendingGoSelection] = useState<PendingGoSelection | null>(null);
  const [pendingGoSchedule, setPendingGoSchedule] = useState<Schedule | undefined>(undefined);
  const [pendingGoResolved, setPendingGoResolved] = useState(false);
  const selectedTarget =
    routeTargets.find((target) => target.key === selectedTargetKey) ??
    (selectedTargetKey ? null : fallbackTarget);

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

  useEffect(() => {
    if (!isOpen) return;
    if (pendingGoSelection) return;

    const variantId = selectedTarget?.route.baseVariantId;
    if (!variantId) {
      setIsLoadingGoData(false);
      return;
    }

    let cancelled = false;

    const run = async () => {
      try {
        const data = await getGoVariantData?.(variantId);
        if (!data) throw new Error("Failed to load GO stop timetable");
        if (cancelled) return;
        setIsLoadingGoData(false);
      } catch {
        if (cancelled) return;
        setIsLoadingGoData(false);
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [getGoVariantData, isOpen, pendingGoSelection, selectedTarget?.route.baseVariantId]);

  useEffect(() => {
    if (!pendingGoSelection) return;
    if (!pendingGoResolved) return;

    const matchedTarget = routeTargets.find(
      (target) => target.route.baseVariantId === pendingGoSelection.variantId,
    );
    if (!matchedTarget) return;

    setSelectedTargetKey(matchedTarget.key);
    setDraft(createScheduleDraft(pendingGoSchedule ?? matchedTarget.route.schedule));
    setPendingGoSelection(null);
    setPendingGoSchedule(undefined);
    setPendingGoResolved(false);
    setIsLoadingGoData(false);
  }, [pendingGoResolved, pendingGoSchedule, pendingGoSelection, routeTargets]);

  const activeDirectionDraft = getDirectionDraft(draft);
  const preview = useMemo(
    () => getDirectionPreview(draft, draft.selectedDirection),
    [draft],
  );
  const primarySummary = useMemo(
    () => getExistingDirectionSummary(selectedTarget?.route.schedule, "primary"),
    [selectedTarget],
  );
  const oppositeSummary = useMemo(
    () => getExistingDirectionSummary(selectedTarget?.route.schedule, "opposite"),
    [selectedTarget],
  );

  if (!isOpen) return null;

  const fixedPreview =
    activeDirectionDraft.mode === "fixed"
      ? normalizeFixedDepartures(activeDirectionDraft.fixedText)
      : preview.departures;
  const hasTargets = routeTargets.length > 0;
  const directionLabels = buildDirectionLabels(selectedTarget?.route);
  const supportsOppositeDirection = supportsBidirectionalSchedule(selectedTarget?.route);
  const showGoTimingPreview = Boolean(selectedTarget?.route.baseVariantId);
  const showLoadingState = isLoadingGoData || Boolean(pendingGoSelection);
  const displayRouteName =
    pendingGoSelection?.label ?? selectedTarget?.route.name ?? "Choose a route";
  const selectValue = pendingGoSelection
    ? `go:${pendingGoSelection.variantId}`
    : selectedTargetKey;

  const updateSelectedDirectionDraft = (updater: (current: DirectionDraft) => DirectionDraft) => {
    setDraft((prev) =>
      updateDirectionDraft(prev, prev.selectedDirection, updater(getDirectionDraft(prev))),
    );
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center">
      <button
        type="button"
        aria-label="Close schedule builder"
        onClick={onClose}
        className="absolute inset-0 bg-slate-950/45 backdrop-blur-sm"
      />

      <div
        className="relative z-10 flex max-h-[88vh] w-[1120px] max-w-[95vw] flex-col overflow-hidden rounded-[28px] border border-white/50 bg-[rgba(248,250,252,0.97)] text-slate-900 shadow-[0_30px_80px_rgba(15,23,42,0.28)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="border-b border-slate-200 px-5 py-4">
          <div className="text-[10px] font-semibold uppercase tracking-[0.24em] text-slate-500">
            Schedule Builder
          </div>
          <div className="mt-2 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h3 className="text-lg font-semibold text-slate-950">
                {displayRouteName}
              </h3>
              <p className="mt-1 text-sm text-slate-600">
                Configure primary and opposite direction departures independently.
              </p>
            </div>
            <div className="w-full max-w-[360px]">
              <div>
                <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Route or GO line
                </div>
                <select
                  value={selectValue}
                  onChange={async (event) => {
                    const nextValue = event.target.value;
                    if (nextValue.startsWith("go:")) {
                      const variantId = nextValue.slice(3);
                      const selectedOption = goVariantOptions.find((option) => option.value === variantId);
                      if (!selectedOption || !onLoadGoVariant) return;
                      const previousTarget = selectedTarget;
                      setPendingGoSelection({
                        variantId: selectedOption.value,
                        label: selectedOption.label,
                      });
                      setPendingGoSchedule(undefined);
                      setPendingGoResolved(false);
                      setSelectedTargetKey(nextValue);
                      setDraft(createScheduleDraft(undefined));
                      setIsLoadingGoData(true);
                      try {
                        const result = await onLoadGoVariant(
                          selectedOption.value,
                          selectedOption.label,
                          selectedOption.routeShortName,
                        );
                        setPendingGoSchedule(result?.schedule);
                        setPendingGoResolved(true);
                      } catch {
                        setPendingGoSelection(null);
                        setPendingGoSchedule(undefined);
                        setPendingGoResolved(false);
                        setSelectedTargetKey(previousTarget?.key ?? fallbackTarget?.key ?? "");
                        setDraft(createScheduleDraft(previousTarget?.route.schedule));
                        setIsLoadingGoData(false);
                      }
                      return;
                    }
                    const nextTarget = routeTargets.find((target) => target.key === nextValue);
                    setPendingGoSelection(null);
                    setIsLoadingGoData(Boolean(nextTarget?.route.baseVariantId));
                    setSelectedTargetKey(nextValue);
                    setDraft(createScheduleDraft(nextTarget?.route.schedule));
                  }}
                  disabled={!hasTargets && goVariantOptions.length === 0}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-200 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                >
                  {routeTargets.length > 0 && (
                    <optgroup label="Routes">
                      {routeTargets.map((target) => (
                        <option key={target.key} value={target.key}>
                          {target.source === "current" ? "Current route" : "Saved route"} · {target.label}
                        </option>
                      ))}
                    </optgroup>
                  )}
                  {goVariantOptions.length > 0 && (
                    <optgroup label="GO Transit lines">
                      {goVariantOptions.map((option) => (
                        <option key={option.value} value={`go:${option.value}`}>
                          {option.label}
                        </option>
                      ))}
                    </optgroup>
                  )}
                  {!hasTargets && goVariantOptions.length === 0 && (
                    <option value="">No routes available</option>
                  )}
                </select>
              </div>
            </div>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {showLoadingState ? (
            <div className="grid gap-5 lg:grid-cols-[380px_minmax(0,1fr)]">
              <div className="space-y-4">
                <LoadingCard title="Loading route" />
                <LoadingCard rows={2} title="Direction" />
                <div className="flex gap-2 rounded-[20px] border border-slate-200 bg-white p-1">
                  <div className="h-12 flex-1 animate-pulse rounded-2xl bg-slate-100" />
                  <div className="h-12 flex-1 animate-pulse rounded-2xl bg-slate-100" />
                </div>
                <LoadingCard rows={5} title="Loading schedule" />
              </div>
              <div className="space-y-4">
                <LoadingStats />
                <div className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-[0_10px_30px_rgba(15,23,42,0.06)]">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                    Preview
                  </div>
                  <div className="mt-4 grid max-h-[28rem] grid-cols-3 gap-2 overflow-y-auto">
                    {Array.from({ length: 12 }).map((_, index) => (
                      <div
                        key={index}
                        className="h-14 animate-pulse rounded-xl border border-slate-200 bg-slate-100"
                      />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ) : !selectedTarget ? (
            <div className="rounded-[24px] border border-slate-200 bg-white p-6 text-sm text-slate-500 shadow-[0_10px_30px_rgba(15,23,42,0.06)]">
              Create or save a route first, then add a schedule here.
            </div>
          ) : (
            <div className="grid gap-5 lg:grid-cols-[380px_minmax(0,1fr)]">
              <div className="space-y-4">
                <SummaryCard
                  route={selectedTarget.route}
                  source={selectedTarget.source}
                  primarySummary={primarySummary}
                  oppositeSummary={oppositeSummary}
                  directionLabels={directionLabels}
                  showOpposite={supportsOppositeDirection}
                />

                {supportsOppositeDirection ? (
                  <div className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-[0_10px_30px_rgba(15,23,42,0.06)]">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                      Direction
                    </div>
                    <div className="mt-3 grid gap-2">
                      <DirectionButton
                        active={draft.selectedDirection === "primary"}
                        label={directionLabels.primary}
                        status={hasScheduleDirection(selectedTarget.route.schedule, "primary") ? "Configured" : "Empty"}
                        onClick={() =>
                          setDraft((prev) => ({ ...prev, selectedDirection: "primary" }))
                        }
                      />
                      <DirectionButton
                        active={draft.selectedDirection === "opposite"}
                        label={directionLabels.opposite}
                        status={hasScheduleDirection(selectedTarget.route.schedule, "opposite") ? "Configured" : "Empty"}
                        onClick={() =>
                          setDraft((prev) => ({ ...prev, selectedDirection: "opposite" }))
                        }
                      />
                    </div>
                  </div>
                ) : (
                  <div className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-[0_10px_30px_rgba(15,23,42,0.06)]">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                      Direction
                    </div>
                    <div className="mt-2 text-sm font-semibold text-slate-900">
                      {directionLabels.primary}
                    </div>
                    <div className="mt-1 text-sm text-slate-600">
                      GO-derived routes use the existing reverse direction from GO data, so only this direction is editable here.
                    </div>
                  </div>
                )}

                <div className="flex gap-2 rounded-[20px] border border-slate-200 bg-white p-1">
                  <TabButton
                    active={activeDirectionDraft.mode === "frequency"}
                    label="Frequency"
                    onClick={() =>
                      updateSelectedDirectionDraft((current) => ({ ...current, mode: "frequency" }))
                    }
                  />
                  <TabButton
                    active={activeDirectionDraft.mode === "fixed"}
                    label="Fixed Times"
                    onClick={() =>
                      updateSelectedDirectionDraft((current) => ({ ...current, mode: "fixed" }))
                    }
                  />
                </div>

                {activeDirectionDraft.mode === "frequency" ? (
                  <div className="space-y-4 rounded-[24px] border border-slate-200 bg-white p-4 shadow-[0_10px_30px_rgba(15,23,42,0.06)]">
                    <div>
                      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                        Service pattern
                      </div>
                      <div className="mt-1 text-sm text-slate-600">
                        Build a repeating pattern for {directionLabels[draft.selectedDirection].toLowerCase()}.
                      </div>
                    </div>

                    <label className="block">
                      <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                        Applies to
                      </div>
                      <select
                        value={activeDirectionDraft.frequency.dayGroup}
                        onChange={(event) =>
                          updateSelectedDirectionDraft((current) => ({
                            ...current,
                            frequency: {
                              ...current.frequency,
                              dayGroup: event.target.value as DirectionDraft["frequency"]["dayGroup"],
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
                        value={activeDirectionDraft.frequency.startTime}
                        onChange={(value) =>
                          updateSelectedDirectionDraft((current) => ({
                            ...current,
                            frequency: { ...current.frequency, startTime: value },
                          }))
                        }
                      />
                      <FieldTime
                        label="End time"
                        value={activeDirectionDraft.frequency.endTime}
                        onChange={(value) =>
                          updateSelectedDirectionDraft((current) => ({
                            ...current,
                            frequency: { ...current.frequency, endTime: value },
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
                        value={
                          activeDirectionDraft.frequency.intervalMinutes === 0
                            ? ""
                            : String(activeDirectionDraft.frequency.intervalMinutes)
                        }
                        onChange={(event) =>
                          updateSelectedDirectionDraft((current) => ({
                            ...current,
                            frequency: {
                              ...current.frequency,
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
                        Enter departures for {directionLabels[draft.selectedDirection].toLowerCase()}.
                      </div>
                    </div>

                    <textarea
                      value={activeDirectionDraft.fixedText}
                      onChange={(event) =>
                        updateSelectedDirectionDraft((current) => ({
                          ...current,
                          fixedText: event.target.value,
                        }))
                      }
                      placeholder="06:00&#10;06:30&#10;07:00"
                      className="h-72 w-full rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-200"
                    />
                  </div>
                )}
              </div>

              <div className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-3">
                  <InfoCard label="Editing" value={directionLabels[draft.selectedDirection]} />
                  <InfoCard
                    label="Schedule type"
                    value={showGoTimingPreview ? "GO departures" : activeDirectionDraft.mode === "frequency" ? "Frequency" : "Fixed"}
                  />
                  <InfoCard
                    label="Preview departures"
                    value={String(preview.departures.length)}
                  />
                </div>

                <div className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-[0_10px_30px_rgba(15,23,42,0.06)]">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                    Preview
                  </div>
                  {showGoTimingPreview ? (
                    <>
                      <div className="mt-2 text-sm text-slate-600">
                        Scheduled GO departures · {preview.departures.length} departures
                      </div>
                      <div className="mt-4 grid max-h-[28rem] grid-cols-3 gap-2 overflow-y-auto">
                        {fixedPreview.length === 0 ? (
                          <div className="col-span-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
                            No departures available.
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
                    </>
                  ) : preview.validationError ? (
                    <>
                      <div className="mt-2 text-sm text-slate-600">{preview.summary}</div>
                    <div className="mt-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                      {preview.validationError}
                    </div>
                    </>
                  ) : (
                    <>
                    <div className="mt-2 text-sm text-slate-600">{preview.summary}</div>
                    <div className="mt-4 grid max-h-[28rem] grid-cols-3 gap-2 overflow-y-auto">
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
                    </>
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
            disabled={!selectedTarget || showLoadingState}
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
                const primaryPreview = getDirectionPreview(draft, "primary");
                const oppositePreview = getDirectionPreview(draft, "opposite");
                const primaryDraft = getDirectionDraft(draft, "primary");
                const oppositeDraft = getDirectionDraft(draft, "opposite");
                if (
                  (primaryDraft.mode === "fixed" &&
                    primaryDraft.fixedText.trim().length > 0 &&
                    primaryPreview.validationError) ||
                  (primaryDraft.mode === "frequency" && primaryPreview.validationError) ||
                  (oppositeDraft.mode === "fixed" &&
                    oppositeDraft.fixedText.trim().length > 0 &&
                    oppositePreview.validationError) ||
                  (oppositeDraft.mode === "frequency" && oppositePreview.validationError)
                ) {
                  return;
                }
                const built = buildScheduleFromDraft(draft);
                onSave(
                  selectedTarget,
                  supportsOppositeDirection
                    ? built
                    : built
                      ? { primary: built.primary }
                      : undefined,
                );
              }}
              disabled={!selectedTarget || showLoadingState}
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

function LoadingStats() {
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {Array.from({ length: 3 }).map((_, index) => (
        <div
          key={index}
          className="rounded-[20px] border border-slate-200 bg-white p-4 shadow-[0_10px_24px_rgba(15,23,42,0.06)]"
        >
          <div className="h-3 w-24 animate-pulse rounded bg-slate-100" />
          <div className="mt-4 h-8 w-28 animate-pulse rounded bg-slate-100" />
        </div>
      ))}
    </div>
  );
}

function LoadingCard({ rows = 4, title = "Loading" }: { rows?: number; title?: string }) {
  return (
    <div className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-[0_10px_30px_rgba(15,23,42,0.06)]">
      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
        {title}
      </div>
      <div className="mt-3 space-y-3">
        {Array.from({ length: rows }).map((_, index) => (
          <div key={index} className="h-12 animate-pulse rounded-2xl bg-slate-100" />
        ))}
      </div>
    </div>
  );
}

function buildDirectionLabels(route?: CustomRoute | null) {
  const start = route?.stops[0]?.name ?? "Start";
  const end = route?.stops[route.stops.length - 1]?.name ?? "End";
  return {
    primary: `${start} → ${end}`,
    opposite: `${end} → ${start}`,
  };
}

function DirectionButton({
  active,
  label,
  status,
  onClick,
}: {
  active: boolean;
  label: string;
  status: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-[20px] border px-4 py-3 text-left transition ${
        active
          ? "border-sky-200 bg-sky-50 shadow-[0_10px_24px_rgba(14,165,233,0.12)]"
          : "border-slate-200 bg-slate-50 hover:bg-slate-100"
      }`}
    >
      <div className="text-sm font-semibold text-slate-900">{label}</div>
      <div className="mt-1 text-xs uppercase tracking-[0.16em] text-slate-500">{status}</div>
    </button>
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
  primarySummary,
  oppositeSummary,
  directionLabels,
  showOpposite,
}: {
  route: CustomRoute;
  source: "current" | "saved";
  primarySummary: ReturnType<typeof getExistingDirectionSummary>;
  oppositeSummary: ReturnType<typeof getExistingDirectionSummary>;
  directionLabels: ReturnType<typeof buildDirectionLabels>;
  showOpposite: boolean;
}) {
  return (
    <div className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-[0_10px_30px_rgba(15,23,42,0.06)]">
      <div>
        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
          Existing schedule
        </div>
        <div className="mt-1 text-sm font-semibold text-slate-950">{route.name}</div>
        <div className="mt-1 text-sm text-slate-600">
          {source === "current" ? "Current route" : "Saved route"} · {route.stops.length} stops
        </div>
      </div>

      <div className="mt-4 grid gap-3">
        <DirectionSummaryCard
          title={directionLabels.primary}
          summary={primarySummary}
        />
        {showOpposite && (
          <DirectionSummaryCard
            title={directionLabels.opposite}
            summary={oppositeSummary}
          />
        )}
      </div>
    </div>
  );
}

function DirectionSummaryCard({
  title,
  summary,
}: {
  title: string;
  summary: ReturnType<typeof getExistingDirectionSummary>;
}) {
  return (
    <div className="rounded-[20px] border border-slate-200 bg-slate-50 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="text-sm font-semibold text-slate-900">{title}</div>
        <div className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-medium text-slate-700">
          {summary.type}
        </div>
      </div>
      <div className="mt-3 grid gap-2">
        {summary.lines.map((line) => (
          <div
            key={`${title}-${line.label}`}
            className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm"
          >
            <span className="text-slate-500">{line.label}</span>
            <span className="text-right font-medium text-slate-900">{line.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
