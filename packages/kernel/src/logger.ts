import type { LogFields, Logger } from '@blixis-io/contracts'

/** Log levels in increasing severity. */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

const RANK: Readonly<Record<LogLevel, number>> = { debug: 10, info: 20, warn: 30, error: 40 }

/** Whether `value` is a log level (e.g. from the `LOG_LEVEL` variable). */
export function isLogLevel(value: unknown): value is LogLevel {
  return typeof value === 'string' && value in RANK
}

/** Options for {@link createJsonLogger}. */
export interface JsonLoggerOptions {
  /**
   * Minimum level to emit. Defaults to `info`. A function is read on every call, so the level can
   * follow `LOG_LEVEL`, which Workers only provide per request.
   */
  readonly level?: LogLevel | (() => LogLevel)
  /**
   * Include error stacks. Defaults to `true` when the level is `debug`, otherwise `false`: stacks
   * are noise in production info logs (§35) and may reveal paths.
   */
  readonly stacks?: boolean | (() => boolean)
  /** Fields added to every entry. */
  readonly fields?: LogFields
  /** Where lines go. Defaults to the platform console (captured by Workers Logs). */
  readonly write?: (level: LogLevel, line: string) => void
}

function consoleSink(level: LogLevel, line: string): void {
  // biome-ignore lint/suspicious/noConsole: the default sink of the platform logger is the console
  console[level === 'debug' ? 'log' : level](line)
}

/** Replacement for redacted values. */
export const REDACTED = '[redacted]'

/**
 * Field names whose values are never logged (§35): credentials, tokens, cookies, connection
 * strings, signatures, and personal secrets. Matched case-insensitively, ignoring `_` and `-`.
 */
const SECRET_KEY =
  /(pass(word|phrase)?|secret|token|authori[sz]ation|cookie|connectionstring|dsn|apikey|privatekey|signature|credential|otp|sessionid|setcookie)$/i

/** Secrets recognizable by their shape, replaced wherever they appear in strings. */
const SECRET_VALUES: readonly [RegExp, string][] = [
  // Blixis API tokens, delivery/preview keys, refresh tokens: blx_pat_…, blx_dk_…, blx_pk_…, blx_rt_…
  [/\bblx_[a-z]{2,4}_[A-Za-z0-9_-]{8,}/g, `blx_${REDACTED}`],
  // Credentials in connection strings: postgres://user:password@host → postgres://user:[redacted]@host
  [/\b([a-z][a-z0-9+.-]*:\/\/[^:/?#\s@]+):[^@/\s]+@/gi, `$1:${REDACTED}@`],
  // Bearer / Basic authorization values
  [/\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{8,}/g, `$1 ${REDACTED}`],
  // JSON Web Tokens
  [/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, REDACTED],
  // npm, GitHub, and Stripe-style tokens
  [/\b(npm_|gh[pousr]_|sk_live_|sk_test_)[A-Za-z0-9]{16,}/g, `$1${REDACTED}`],
]

/** Limits that keep one log line reasonable for Workers Logs. */
const MAX_STRING = 2_000
const MAX_ITEMS = 50
const MAX_DEPTH = 5

/** Redacts secret-shaped substrings of a string and caps its length. */
export function redactString(value: string): string {
  let result = value
  for (const [pattern, replacement] of SECRET_VALUES) result = result.replace(pattern, replacement)
  return result.length > MAX_STRING
    ? `${result.slice(0, MAX_STRING)}…[truncated ${result.length - MAX_STRING} chars]`
    : result
}

const isSecretKey = (key: string) => SECRET_KEY.test(key.replace(/[_-]/g, ''))

/**
 * Makes a value safe and compact to log: secrets redacted by key and by shape, errors serialized
 * (stack only when `stacks`), long strings, big arrays, and deep objects cut short.
 */
export function sanitize(value: unknown, stacks = false, depth = 0): unknown {
  if (typeof value === 'string') return redactString(value)
  if (value === null || typeof value !== 'object') {
    return typeof value === 'bigint' ? value.toString() : value
  }
  if (value instanceof Error) return serializeError(value, stacks, depth)
  if (value instanceof Date) return value.toISOString()
  if (depth >= MAX_DEPTH) return '[truncated: too deep]'
  if (Array.isArray(value)) {
    const items = value.slice(0, MAX_ITEMS).map((item) => sanitize(item, stacks, depth + 1))
    if (value.length > MAX_ITEMS) items.push(`[truncated ${value.length - MAX_ITEMS} items]`)
    return items
  }
  const result: Record<string, unknown> = {}
  for (const [key, item] of Object.entries(value)) {
    result[key] = isSecretKey(key) ? REDACTED : sanitize(item, stacks, depth + 1)
  }
  return result
}

function serializeError(error: Error, stacks: boolean, depth: number): Record<string, unknown> {
  const extra = error as Error & { code?: unknown; status?: unknown; cause?: unknown }
  return {
    name: error.name,
    message: redactString(error.message),
    ...(typeof extra.code === 'string' || typeof extra.code === 'number'
      ? { code: extra.code }
      : {}),
    ...(typeof extra.status === 'number' ? { status: extra.status } : {}),
    ...(stacks && error.stack !== undefined ? { stack: redactString(error.stack) } : {}),
    ...(extra.cause !== undefined && depth < MAX_DEPTH
      ? { cause: sanitize(extra.cause, stacks, depth + 1) }
      : {}),
  }
}

/**
 * The platform logger: one JSON object per line (architecture §35), with level filtering, child
 * bindings, redaction of secrets by field name and by shape, error serialization, and size limits.
 * Standard field names: `requestId`, `correlationId`, `organizationId`, `spaceId`, `actorId`,
 * `module`, `eventType`, `eventId`, `duration` (ms), `status`.
 */
export function createJsonLogger(options: JsonLoggerOptions = {}): Logger {
  const configured = options.level
  const level: () => LogLevel =
    typeof configured === 'function' ? configured : () => configured ?? 'info'
  const stacks =
    typeof options.stacks === 'function'
      ? options.stacks
      : options.stacks === undefined
        ? () => level() === 'debug'
        : () => options.stacks as boolean
  const write = options.write ?? consoleSink
  const make = (bound: LogFields): Logger => {
    const log =
      (entryLevel: LogLevel) =>
      (message: string, fields?: LogFields): void => {
        if (RANK[entryLevel] < RANK[level()]) return
        const withStacks = stacks()
        const entry = sanitize({ ...bound, ...fields }, withStacks) as Record<string, unknown>
        write(
          entryLevel,
          JSON.stringify({
            level: entryLevel,
            message: redactString(message),
            time: new Date().toISOString(),
            ...entry,
          }),
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
