import { redact, scrubString } from "./redact";

export const LOG_LEVELS = ["debug", "info", "warn", "error"] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];
export type LogFields = Readonly<Record<string, unknown>>;

export interface Logger {
  debug(msg: string, fields?: LogFields): void;
  info(msg: string, fields?: LogFields): void;
  warn(msg: string, fields?: LogFields): void;
  error(msg: string, fields?: LogFields): void;
}

export interface LogSink {
  write(level: LogLevel, line: string): void;
}

export interface CreateLoggerOptions {
  readonly level: LogLevel | (() => LogLevel);
  /** Default: debug/info -> process.stdout, warn/error -> process.stderr. */
  readonly sink?: LogSink;
  readonly now?: () => Date;
}

const RANK: Readonly<Record<LogLevel, number>> = { debug: 10, info: 20, warn: 30, error: 40 };

const processSink: LogSink = {
  write(level, line) {
    const stream = level === "warn" || level === "error" ? process.stderr : process.stdout;
    stream.write(`${line}\n`);
  },
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function createLogger(options: CreateLoggerOptions): Logger {
  const sink = options.sink ?? processSink;
  const now = options.now ?? (() => new Date());
  const configured = options.level;
  const currentLevel = typeof configured === "function" ? configured : () => configured;

  function emit(level: LogLevel, msg: string, fields?: LogFields): void {
    try {
      if (RANK[level] < RANK[currentLevel()]) return;
      const reserved = { ts: now().toISOString(), level, msg: scrubString(msg) };
      let line: string;
      try {
        const redacted = fields === undefined ? {} : redact(fields);
        line = JSON.stringify(
          Object.assign({}, reserved, isRecord(redacted) ? redacted : {}, reserved),
        );
      } catch {
        line = JSON.stringify({ ...reserved, logError: "serialization_failed" });
      }
      sink.write(level, line);
    } catch {
      // The logger must never throw into its caller.
    }
  }

  return {
    debug: (msg, fields) => emit("debug", msg, fields),
    info: (msg, fields) => emit("info", msg, fields),
    warn: (msg, fields) => emit("warn", msg, fields),
    error: (msg, fields) => emit("error", msg, fields),
  };
}

let globalLevel: LogLevel = "info";

export function setLogLevel(level: LogLevel): void {
  globalLevel = level;
}

export const logger: Logger = createLogger({ level: () => globalLevel });
