import type {
  DayKey,
  Schedule,
  ScheduleDirection,
  ScheduleDirectionKey,
  ScheduleFrequency,
} from "@/hooks/useRouteBuilder";
import { getScheduleDirection, normalizeSchedule } from "@/hooks/useRouteBuilder";

export type ScheduleMode = "frequency" | "fixed";
export type ScheduleDayGroup = "weekday" | "weekend" | "all";

export type FrequencyDraft = {
  dayGroup: ScheduleDayGroup;
  startTime: string;
  endTime: string;
  intervalMinutes: number;
};

export type DirectionDraft = {
  mode: ScheduleMode;
  frequency: FrequencyDraft;
  fixedText: string;
};

export type ScheduleDraft = {
  selectedDirection: ScheduleDirectionKey;
  directions: Record<ScheduleDirectionKey, DirectionDraft>;
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

function createEmptyDirectionDraft(): DirectionDraft {
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
  return normalized.monday.enabled ? normalized.monday : normalized.tuesday;
}

function createDirectionDraft(direction?: ScheduleDirection): DirectionDraft {
  if (!direction) return createEmptyDirectionDraft();

  if (direction.type === "fixed") {
    const departures = Array.from(new Set(direction.departures)).sort();
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

  const normalized = normalizeFrequencySchedule(direction);
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

export function createScheduleDraft(schedule?: Schedule): ScheduleDraft {
  const normalized = normalizeSchedule(schedule);
  return {
    selectedDirection: "primary",
    directions: {
      primary: createDirectionDraft(normalized?.primary),
      opposite: createDirectionDraft(normalized?.opposite),
    },
  };
}

export function getDirectionDraft(
  draft: ScheduleDraft,
  direction: ScheduleDirectionKey = draft.selectedDirection,
): DirectionDraft {
  return draft.directions[direction];
}

export function updateDirectionDraft(
  draft: ScheduleDraft,
  direction: ScheduleDirectionKey,
  next: DirectionDraft,
): ScheduleDraft {
  return {
    ...draft,
    directions: {
      ...draft.directions,
      [direction]: next,
    },
  };
}

export function getDirectionPreview(
  draft: ScheduleDraft,
  direction: ScheduleDirectionKey = draft.selectedDirection,
): SchedulePreview {
  const directionDraft = getDirectionDraft(draft, direction);

  if (directionDraft.mode === "fixed") {
    const departures = normalizeFixedDepartures(directionDraft.fixedText);
    if (directionDraft.fixedText.trim().length > 0 && departures.length === 0) {
      return {
        departures: [],
        summary: "No valid departures",
        validationError: "Enter times in HH:MM format.",
      };
    }
    return {
      departures,
      summary:
        departures.length === 0 ? "No departures entered" : `${departures.length} departures`,
      validationError: null,
    };
  }

  const departures = buildFrequencyDepartures(directionDraft.frequency);
  if (departures.length === 0) {
    return {
      departures: [],
      summary: "Invalid service window",
      validationError: "Set a valid start time, end time, and headway.",
    };
  }

  const dayLabel =
    directionDraft.frequency.dayGroup === "all"
      ? "Daily"
      : directionDraft.frequency.dayGroup === "weekend"
        ? "Weekend"
        : "Weekday";

  return {
    departures,
    summary: `${dayLabel} service · ${departures.length} departures · every ${directionDraft.frequency.intervalMinutes} min`,
    validationError: null,
  };
}

function buildDirectionSchedule(directionDraft: DirectionDraft): ScheduleDirection | undefined {
  if (directionDraft.mode === "fixed") {
    const departures = normalizeFixedDepartures(directionDraft.fixedText);
    return departures.length > 0 ? { type: "fixed", departures } : undefined;
  }

  const departures = buildFrequencyDepartures(directionDraft.frequency);
  if (departures.length === 0) return undefined;

  const enabledDays =
    directionDraft.frequency.dayGroup === "all"
      ? DAY_KEYS
      : directionDraft.frequency.dayGroup === "weekend"
        ? WEEKEND_KEYS
        : WEEKDAY_KEYS;

  const dayConfigs: ScheduleFrequency["dayConfigs"] = {};
  DAY_KEYS.forEach((day) => {
    dayConfigs[day] = {
      enabled: enabledDays.includes(day),
      startTime: directionDraft.frequency.startTime,
      endTime: directionDraft.frequency.endTime,
      intervalMinutes: directionDraft.frequency.intervalMinutes,
    };
  });

  return {
    type: "frequency",
    dayConfigs,
  };
}

export function buildScheduleFromDraft(draft: ScheduleDraft): Schedule | undefined {
  const primary = buildDirectionSchedule(draft.directions.primary);
  const opposite = buildDirectionSchedule(draft.directions.opposite);
  if (!primary && !opposite) return undefined;
  return { primary, opposite };
}

export function getExistingDirectionSummary(
  schedule: Schedule | undefined,
  direction: ScheduleDirectionKey,
) {
  const directionSchedule = getScheduleDirection(schedule, direction);
  if (!directionSchedule) {
    return {
      type: "No schedule",
      lines: [{ label: "Status", value: "Not configured" }],
    };
  }

  if (directionSchedule.type === "fixed") {
    const departures = Array.from(new Set(directionSchedule.departures)).sort();
    const sample = departures.slice(0, 4).join(", ");
    return {
      type: "Fixed Times",
      lines: [
        { label: "Departures", value: `${departures.length}` },
        { label: "Sample", value: sample || "None" },
      ],
    };
  }

  const directionDraft = createDirectionDraft(directionSchedule);
  const preview = getDirectionPreview({
    selectedDirection: direction,
    directions: {
      primary: direction === "primary" ? directionDraft : createEmptyDirectionDraft(),
      opposite: direction === "opposite" ? directionDraft : createEmptyDirectionDraft(),
    },
  });
  const dayLabel =
    directionDraft.frequency.dayGroup === "all"
      ? "Every day"
      : directionDraft.frequency.dayGroup === "weekend"
        ? "Weekend"
        : "Weekday";

  return {
    type: "Frequency",
    lines: [
      { label: "Days", value: dayLabel },
      {
        label: "Service span",
        value: `${directionDraft.frequency.startTime} - ${directionDraft.frequency.endTime}`,
      },
      { label: "Headway", value: `${directionDraft.frequency.intervalMinutes} min` },
      { label: "Preview", value: `${preview.departures.length} departures` },
    ],
  };
}
