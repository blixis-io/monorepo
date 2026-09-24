import {
  type BlixisError,
  ConflictError,
  InfrastructureError,
  isBlixisError,
} from '@blixis/contracts'

/** SQLSTATE codes Blixis maps explicitly (https://www.postgresql.org/docs/current/errcodes-appendix.html). */
const UNIQUE_VIOLATION = '23505'
const FOREIGN_KEY_VIOLATION = '23503'
const RETRYABLE_SQLSTATES = new Set([
  '40001', // serialization_failure
  '40P01', // deadlock_detected
  '55P03', // lock_not_available
  '57014', // query_canceled (statement timeout)
  '57P01', // admin_shutdown
  '57P02', // crash_shutdown
  '57P03', // cannot_connect_now
])
/** SQLSTATE classes that are retryable as a whole: connection exceptions, insufficient resources. */
const RETRYABLE_CLASSES = new Set(['08', '53'])
const RETRYABLE_NETWORK_CODES = new Set(['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'EPIPE'])

/** Postgres fields that are safe to keep. `detail`, `where`, and query params may hold user data. */
interface PostgresErrorFields {
  readonly code?: string
  readonly constraint?: string
  readonly table?: string
  readonly schema?: string
  readonly column?: string
}

const CONNECTION_STRING = /postgres(?:ql)?:\/\/\S+/gi

/** Removes connection strings from a message (§35: never leak credentials). */
function redact(message: string): string {
  return message.replace(CONNECTION_STRING, '[redacted connection string]')
}

/** Drizzle wraps driver errors (`DrizzleQueryError`, message includes params); unwrap them. */
function driverError(error: unknown): unknown {
  let current = error
  for (let depth = 0; depth < 5; depth++) {
    if (!(current instanceof Error)) return current
    const fields = current as Error & PostgresErrorFields
    if (typeof fields.code === 'string') return current
    if (current.cause === undefined) return current
    current = current.cause
  }
  return current
}

/** A sanitized copy of the driver error, used as `cause` (logs, error tracking). */
function sanitizedCause(error: unknown): Error & PostgresErrorFields {
  if (!(error instanceof Error)) return new Error('Unknown database error')
  const source = error as Error & PostgresErrorFields
  const copy: Error & { -readonly [K in keyof PostgresErrorFields]: PostgresErrorFields[K] } =
    new Error(redact(source.message))
  copy.name = source.name
  for (const key of ['code', 'constraint', 'table', 'schema', 'column'] as const) {
    if (typeof source[key] === 'string') copy[key] = source[key]
  }
  return copy
}

/**
 * Translates a driver/query-layer error into a Blixis error (architecture §28). `BlixisError`s
 * pass through unchanged.
 *
 * - unique violation (`23505`) → `ConflictError` (details: `constraint`);
 * - foreign-key violation (`23503`) → `ConflictError` — the referenced row is missing or the
 *   row is still referenced, which is a state conflict rather than malformed input
 *   (`ValidationError` is reserved for input that fails schema validation);
 * - serialisation failure, deadlock, lock timeout, statement timeout, connection and resource
 *   errors → `InfrastructureError` with `retryable: true`;
 * - everything else → `InfrastructureError` (not retryable).
 *
 * Messages never contain the connection string or query parameters; the `cause` is a sanitized
 * copy of the driver error (SQLSTATE `code`, `constraint`, `table`, `schema`, `column`).
 */
export function translateDatabaseError(error: unknown): BlixisError {
  if (isBlixisError(error)) return error
  const driver = driverError(error)
  const cause = sanitizedCause(driver)
  const code = cause.code
  if (code === UNIQUE_VIOLATION) {
    return new ConflictError('A record with the same unique value already exists.', {
      cause,
      ...(cause.constraint === undefined ? {} : { details: { constraint: cause.constraint } }),
    })
  }
  if (code === FOREIGN_KEY_VIOLATION) {
    return new ConflictError('The operation conflicts with a related record.', {
      cause,
      ...(cause.constraint === undefined ? {} : { details: { constraint: cause.constraint } }),
    })
  }
  const retryable =
    code !== undefined &&
    (RETRYABLE_SQLSTATES.has(code) ||
      RETRYABLE_CLASSES.has(code.slice(0, 2)) ||
      RETRYABLE_NETWORK_CODES.has(code))
  const connectionLost =
    code === undefined &&
    /connection terminated|timeout exceeded when trying to connect/i.test(cause.message)
  return new InfrastructureError('Database operation failed', {
    cause,
    retryable: retryable || connectionLost,
  })
}
