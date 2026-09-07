/**
 * Structured logging.
 *
 * One JSON object per line, so a log aggregator can filter on jobId or stage
 * without a parser. Fields are deliberately fixed: ts, service, level, msg, and
 * whatever context the call site adds.
 *
 * No feed *content* is ever logged — GTFS ids, stop names and coordinates are
 * the user's data. Counts, durations, file names and error codes are safe and
 * are what actually helps.
 */

type Level = "debug" | "info" | "warn" | "error";

export interface LogContext {
  jobId?: string;
  datasetId?: string;
  stage?: string;
  file?: string;
  rows?: number;
  bytes?: number;
  durationMs?: number;
  [key: string]: unknown;
}

const LEVELS: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const threshold = LEVELS[(process.env.LOG_LEVEL as Level) ?? "info"] ?? 20;

function emit(level: Level, msg: string, context: LogContext = {}): void {
  if (LEVELS[level] < threshold) return;
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    service: "gtfs-worker",
    level,
    msg,
    ...context,
  });
  if (level === "error" || level === "warn") console.error(line);
  else console.log(line);
}

export const log = {
  debug: (msg: string, ctx?: LogContext) => emit("debug", msg, ctx),
  info: (msg: string, ctx?: LogContext) => emit("info", msg, ctx),
  warn: (msg: string, ctx?: LogContext) => emit("warn", msg, ctx),
  error: (msg: string, ctx?: LogContext) => emit("error", msg, ctx),

  /** Bind context once so every line from a job carries its ids. */
  child(base: LogContext) {
    return {
      debug: (msg: string, ctx?: LogContext) => emit("debug", msg, { ...base, ...ctx }),
      info: (msg: string, ctx?: LogContext) => emit("info", msg, { ...base, ...ctx }),
      warn: (msg: string, ctx?: LogContext) => emit("warn", msg, { ...base, ...ctx }),
      error: (msg: string, ctx?: LogContext) => emit("error", msg, { ...base, ...ctx }),
    };
  },
};

export type Logger = ReturnType<typeof log.child>;
