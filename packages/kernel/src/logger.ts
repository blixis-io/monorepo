import type { LogFields, Logger } from '@blixis/contracts'

/** Log levels in increasing severity. */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

const RANK: Readonly<Record<LogLevel, number>> = { debug: 10, info: 20, warn: 30, error: 40 }

/** Options for {@link createJsonLogger}. */
export interface JsonLoggerOptions {
  /** Minimum level to emit. Defaults to `info`. */
  readonly level?: LogLevel
  /** Fields added to every entry. */
  readonly fields?: LogFields
  /** Where lines go. Defaults to the platform console (captured by Workers Logs). */
  readonly write?: (level: LogLevel, line: string) => void
}

function consoleSink(level: LogLevel, line: string): void {
  // biome-ignore lint/suspicious/noConsole: the default sink of the platform logger is the console
  console[level === 'debug' ? 'log' : level](line)
}

/**
 * Minimal structured logger writing one JSON object per line (architecture §35). Redaction,
 * sampling, and richer serialisation are added in roadmap task 020.001.
 */
export function createJsonLogger(options: JsonLoggerOptions = {}): Logger {
  const min = RANK[options.level ?? 'info']
  const write = options.write ?? consoleSink
  const make = (bound: LogFields): Logger => {
    const log =
      (level: LogLevel) =>
      (message: string, fields?: LogFields): void => {
        if (RANK[level] < min) return
        write(
          level,
          JSON.stringify({ level, message, time: new Date().toISOString(), ...bound, ...fields }),
        )
      }
    return {
      debug: log('debug'),
      info: log('info'),
      warn: log('warn'),
      error: log('error'),
      child: (fields) => make({ ...bound, ...fields }),
    }
  }
  return make(options.fields ?? {})
}

/** A logger that discards everything. */
export const noopLogger: Logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
  child: () => noopLogger,
}
