/**
 * Structured application logging.
 *
 * Prefer `log.info/warn/error` over raw console.* in server paths so
 * operators can ship JSON to DO monitoring / Loki without rewriting
 * call sites later. Secrets and raw PCN payloads must never be logged.
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogFields {
  [key: string]: string | number | boolean | null | undefined;
}

function emit(level: LogLevel, message: string, fields?: LogFields): void {
  const entry = {
    ts: new Date().toISOString(),
    level,
    msg: message,
    ...(fields ?? {}),
  };
  const line = JSON.stringify(entry);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const log = {
  debug: (message: string, fields?: LogFields) => emit("debug", message, fields),
  info: (message: string, fields?: LogFields) => emit("info", message, fields),
  warn: (message: string, fields?: LogFields) => emit("warn", message, fields),
  error: (message: string, fields?: LogFields) => emit("error", message, fields),
};
