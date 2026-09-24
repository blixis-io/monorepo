import type { LogFields, Logger } from '@blixis/contracts'

/** One captured log entry. */
export interface LogEntry {
  readonly level: 'debug' | 'info' | 'warn' | 'error'
  readonly message: string
  /** Bound fields (from `child`) merged with call fields. */
  readonly fields: LogFields
}

/** A logger that records entries in memory, for assertions in tests. */
export interface CapturingLogger extends Logger {
  /** All entries logged through this logger and its children, in order. */
  readonly entries: readonly LogEntry[]
  /** Removes all captured entries. */
  clear(): void
}

/** Creates a {@link CapturingLogger}. */
export function createCapturingLogger(): CapturingLogger {
  const entries: LogEntry[] = []
  const make = (bound: LogFields): Logger => {
    const log =
      (level: LogEntry['level']) =>
      (message: string, fields?: LogFields): void => {
        entries.push({ level, message, fields: { ...bound, ...fields } })
      }
    return {
      debug: log('debug'),
      info: log('info'),
      warn: log('warn'),
      error: log('error'),
      child: (fields) => make({ ...bound, ...fields }),
    }
  }
  return Object.assign(make({}), {
    entries,
    clear: () => {
      entries.length = 0
    },
  })
}
