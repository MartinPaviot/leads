// Optional Sentry forwarding — only required at runtime when the DSN
// is set. Import is dynamic so we don't pay the bundle cost when it's
// disabled.
type SentryModule = typeof import("@sentry/nextjs");
let sentryPromise: Promise<SentryModule | null> | null = null;
async function getSentry(): Promise<SentryModule | null> {
  const dsn =
    process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN;
  if (!dsn) return null;
  if (!sentryPromise) {
    sentryPromise = import("@sentry/nextjs").catch(() => null);
  }
  return sentryPromise;
}

type LogLevel = "debug" | "info" | "warn" | "error";

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  [key: string]: unknown;
}

const isDev = process.env.NODE_ENV !== "production";

function formatEntry(entry: LogEntry): string {
  if (isDev) {
    const { timestamp, level, message, ...meta } = entry;
    const color = {
      debug: "\x1b[36m", // cyan
      info: "\x1b[32m",  // green
      warn: "\x1b[33m",  // yellow
      error: "\x1b[31m", // red
    }[level];
    const reset = "\x1b[0m";
    const metaStr = Object.keys(meta).length
      ? ` ${JSON.stringify(meta)}`
      : "";
    return `${color}[${level.toUpperCase()}]${reset} ${timestamp} ${message}${metaStr}`;
  }
  return JSON.stringify(entry);
}

function log(level: LogLevel, message: string, meta?: Record<string, unknown>) {
  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...meta,
  };

  const formatted = formatEntry(entry);

  switch (level) {
    case "error":
      console.error(formatted);
      break;
    case "warn":
      console.warn(formatted);
      break;
    case "debug":
      console.debug(formatted);
      break;
    default:
      console.log(formatted);
  }

  // Forward errors to Sentry when configured. Best-effort, no await —
  // we never want logger.error itself to throw.
  if (level === "error" || level === "warn") {
    void forwardToSentry(level, message, meta);
  }
}

async function forwardToSentry(
  level: LogLevel,
  message: string,
  meta?: Record<string, unknown>
) {
  const sentry = await getSentry();
  if (!sentry) return;
  try {
    const err = meta?.err;
    if (err instanceof Error) {
      sentry.captureException(err, {
        level: level === "error" ? "error" : "warning",
        extra: meta,
        tags: { logger_message: message.slice(0, 120) },
      });
    } else {
      sentry.captureMessage(message, {
        level: level === "error" ? "error" : "warning",
        extra: meta,
      });
    }
  } catch {
    // Never let Sentry forwarding crash the caller.
  }
}

export const logger = {
  debug: (message: string, meta?: Record<string, unknown>) =>
    log("debug", message, meta),
  info: (message: string, meta?: Record<string, unknown>) =>
    log("info", message, meta),
  warn: (message: string, meta?: Record<string, unknown>) =>
    log("warn", message, meta),
  error: (message: string, meta?: Record<string, unknown>) =>
    log("error", message, meta),
};

export default logger;
