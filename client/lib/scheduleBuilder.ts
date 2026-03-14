import type { Schedule, ScheduleFrequency, DayKey } from "@/hooks/useRouteBuilder";

export type ScheduleMode = "frequency" | "fixed";
export type ScheduleDayGroup = "weekday" | "weekend" | "all";

export type FrequencyDraft = {
  dayGroup: ScheduleDayGroup;
  startTime: string;
  endTime: string;
  intervalMinutes: number;
};

export type ScheduleDraft = {
  mode: ScheduleMode;
  frequency: FrequencyDraft;
  fixedText: string;
};

export type SchedulePreview = {
  departures: string[];
  summary: string;
  validationError: string | null;
};

const DAY_KEYS: DayKey[] = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];

const WEEKDAY_KEYS: DayKey[] = ["monday", "tuesday", "wednesday", "thursday", "friday"];
const WEEKEND_KEYS: DayKey[] = ["saturday", "sunday"];

function parseTimeToMinutes(value: string): number | null {
  const [hours, minutes] = value.split(":").map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  return hours * 60 + minutes;
}

function formatMinutesToTime(minutes: number): string {
  const safe = Math.max(0, Math.round(minutes));
  const hours = Math.floor(safe / 60) % 24;
  const mins = safe % 60;
  return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
}

function buildFrequencyDepartures(config: FrequencyDraft): string[] {
  const start = parseTimeToMinutes(config.startTime);
  const end = parseTimeToMinutes(config.endTime);
  const interval = Math.round(config.intervalMinutes);

  if (start == null || end == null || end < start || interval <= 0) {
    return [];
  }

  const departures: string[] = [];
  for (let minute = start; minute <= end; minute += interval) {
    departures.push(formatMinutesToTime(minute));
  }
  return departures;
}

export function normalizeFixedDepartures(text: string): string[] {
  const tokens = text
    .split(/[\n,\s]+/g)
    .map((token) => token.trim())
    .filter(Boolean);

  const validTimes = tokens
    .map((token) => {
      const parsed = parseTimeToMinutes(token);
      return parsed == null ? null : formatMinutesToTime(parsed);
    })
    .filter((value): value is string => Boolean(value));

  return Array.from(new Set(validTimes)).sort();
}

function normalizeFrequencySchedule(
  schedule: ScheduleFrequency,
): Record<
  DayKey,
  {
    enabled: boolean;
    startTime: string;
    endTime: string;
    intervalMinutes: number;
  }
> {
  const defaults = DAY_KEYS.reduce(
    (acc, day) => {
      acc[day] = {
        enabled: false,
        startTime: "06:00",
        endTime: "22:00",
        intervalMinutes: 30,
      };
      return acc;
    },
    {} as Record<
      DayKey,
      { enabled: boolean; startTime: string; endTime: string; intervalMinutes: number }
    >,
  );

  if (schedule.dayConfigs && Object.keys(schedule.dayConfigs).length > 0) {
    DAY_KEYS.forEach((day) => {
      const existing = schedule.dayConfigs?.[day];
      if (!existing) return;
      defaults[day] = {
        enabled: Boolean(existing.enabled),
        startTime: existing.startTime || "06:00",
        endTime: existing.endTime || "22:00",
        intervalMinutes: Number(existing.intervalMinutes || 30),
      };
    });
    return defaults;
  }

  const startTime = schedule.startTime || "06:00";
  const endTime = schedule.endTime || "22:00";
  const intervalMinutes = Number(schedule.intervalMinutes || 30);
  const days = schedule.days || "weekday";
  const enabledDays =
    days === "all" ? DAY_KEYS : days === "weekend" ? WEEKEND_KEYS : WEEKDAY_KEYS;

  enabledDays.forEach((day) => {
    defaults[day] = { enabled: true, startTime, endTime, intervalMinutes };
  });

  return defaults;
}

function detectDayGroup(
  normalized: ReturnType<typeof normalizeFrequencySchedule>,
): ScheduleDayGroup {
  const weekdayEnabled = WEEKDAY_KEYS.every((day) => normalized[day].enabled);
  const weekendEnabled = WEEKEND_KEYS.every((day) => normalized[day].enabled);
  const weekdayDisabled = WEEKDAY_KEYS.every((day) => !normalized[day].enabled);
  const weekendDisabled = WEEKEND_KEYS.every((day) => !normalized[day].enabled);

  if (weekdayEnabled && weekendEnabled) return "all";
  if (weekdayEnabled && weekendDisabled) return "weekday";
  if (weekendEnabled && weekdayDisabled) return "weekend";
  return "weekday";
}

function representativeConfig(
  normalized: ReturnType<typeof normalizeFrequencySchedule>,
  group: ScheduleDayGroup,
) {
  if (group === "weekend") {
    return normalized.saturday.enabled ? normalized.saturday : normalized.sunday;
  }
  if (group === "all") {
    return normalized.monday.enabled
      ? normalized.monday
      : DAY_KEYS.map((day) => normalized[day]).find((config) => config.enabled) ?? normalized.monday;
  }
  return normalized.monday.enabled
    ? normalized.monday
    : normalized.tuesday;
}

export function createScheduleDraft(schedule?: Schedule): ScheduleDraft {
  if (!schedule) {
    return {
      mode: "frequency",
      frequency: {
        dayGroup: "weekday",
        startTime: "06:00",
        endTime: "22:00",
        intervalMinutes: 30,
      },
      fixedText: "",
    };
  }

  if (schedule.type === "fixed") {
    const departures = Array.from(new Set(schedule.departures)).sort();
    return {
      mode: "fixed",
      frequency: {
        dayGroup: "weekday",
        startTime: departures[0] ?? "06:00",
        endTime: departures[departures.length - 1] ?? "22:00",
        intervalMinutes: 30,
      },
      fixedText: departures.join("\n"),
    };
  }

  const normalized = normalizeFrequencySchedule(schedule);
  const dayGroup = detectDayGroup(normalized);
  const config = representativeConfig(normalized, dayGroup);

  return {
    mode: "frequency",
    frequency: {
      dayGroup,
      startTime: config.startTime,
      endTime: config.endTime,
      intervalMinutes: config.intervalMinutes,
    },
    fixedText: "",
  };
}

export function getSchedulePreview(draft: ScheduleDraft): SchedulePreview {
  if (draft.mode === "fixed") {
    const departures = normalizeFixedDepartures(draft.fixedText);
    if (draft.fixedText.trim().length > 0 && departures.length === 0) {
      return {
        departures: [],
        summary: "No valid departures",
        validationError: "Enter times in HH:MM format.",
      };
    }
    return {
      departures,
      summary: departures.length === 0 ? "No departures entered" : `${departures.length} departures`,
      validationError: null,
    };
  }

  const departures = buildFrequencyDepartures(draft.frequency);
  if (departures.length === 0) {
    return {
      departures: [],
      summary: "Invalid service window",
      validationError: "Set a valid start time, end time, and headway.",
    };
  }

  const dayLabel =
    draft.frequency.dayGroup === "all"
      ? "Daily"
      : draft.frequency.dayGroup === "weekend"
        ? "Weekend"
        : "Weekday";

  return {
    departures,
    summary: `${dayLabel} service · ${departures.length} departures · every ${draft.frequency.intervalMinutes} min`,
    validationError: null,
  };
}

export function buildScheduleFromDraft(draft: ScheduleDraft): Schedule | undefined {
  if (draft.mode === "fixed") {
    const departures = normalizeFixedDepartures(draft.fixedText);
    return departures.length > 0 ? { type: "fixed", departures } : undefined;
  }

  const preview = getSchedulePreview(draft);
  if (preview.validationError) return undefined;

  const enabledDays =
    draft.frequency.dayGroup === "all"
      ? DAY_KEYS
      : draft.frequency.dayGroup === "weekend"
        ? WEEKEND_KEYS
        : WEEKDAY_KEYS;

  const dayConfigs: ScheduleFrequency["dayConfigs"] = {};
  DAY_KEYS.forEach((day) => {
    dayConfigs[day] = {
      enabled: enabledDays.includes(day),
      startTime: draft.frequency.startTime,
      endTime: draft.frequency.endTime,
      intervalMinutes: draft.frequency.intervalMinutes,
    };
  });

  return {
    type: "frequency",
    dayConfigs,
  };
}
